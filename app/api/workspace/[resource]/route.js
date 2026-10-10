import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireOrganization } from '@/lib/auth';
import { mediaUrlForWorkspace } from '@/lib/mediaDelivery';
import { assertProjectCapacity, lockWorkspaceQuota, workspaceEntitlements } from '@/lib/planCatalog';
import { collapseProjectsByCategory, projectCategoryKey, projectStatusHistory, projectStatusKey, uniqueProjectAssets } from '@/lib/projectCategories';
import { permanentlyDeleteProjects } from '@/lib/permanentDeletion';

const models = { projects: 'project', campaigns: 'campaign', workflows: 'workflow', templates: 'template', notifications: 'notification', integrations: 'integrationConnection', 'api-keys': 'apiKey' };
const json = (data, status = 200) => NextResponse.json(data, { status });
const pageOptions = (request) => { const params = new URL(request.url).searchParams; return { take: Math.min(Math.max(Number(params.get('limit') || 30), 1), 100), skip: Math.max(Number(params.get('offset') || 0), 0) }; };
const publicAsset = ({ provider, providerJobId, providerStatus, ...asset }) => ({ ...asset, generated: provider !== 'LOCAL_REFERENCE' });
const publicProject = ({ successfulProvider, successfulProviderTaskId, ...project }) => project;

// Thumbnails are rendered through plain <img>/<video> tags, which cannot send the
// Authorization header. Auth-gated URLs such as /api/project-assets/<id> therefore
// always resolve to 401 in the browser, so they must never be used as a thumbnail.
const isBrowserRenderable = (url) => typeof url === 'string' && url.length > 0 && !url.startsWith('/api/');
const imageLike = (url) => typeof url === 'string' && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
const videoLike = (url) => typeof url === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
const audioLike = (url) => typeof url === 'string' && /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url);

// An <img> tag cannot decode a video or audio file, so serving one as thumbnailUrl
// renders as a broken/white tile. Prefer a real image, and otherwise hand the media
// back separately so the client can render it with <video>/<audio> instead.
function projectPreview(record, assets) {
  const candidates = [record.thumbnailUrl, record.finalThumbnailUrl, ...assets.flatMap((asset) => [asset.thumbnailUrl, asset.outputUrl])];
  const image = candidates.find((url) => isBrowserRenderable(url) && imageLike(url));
  if (image) return { thumbnailUrl: image, previewUrl: null, thumbnailKind: 'image' };
  const video = candidates.find((url) => isBrowserRenderable(url) && videoLike(url));
  if (video) return { thumbnailUrl: null, previewUrl: video, thumbnailKind: 'video' };
  const audio = candidates.find((url) => isBrowserRenderable(url) && audioLike(url));
  if (audio) return { thumbnailUrl: null, previewUrl: audio, thumbnailKind: 'audio' };
  // Extension-less URLs (signed CDN links, /uploads/... without a known suffix)
  // cannot be classified, so keep whatever the project stored and let the client
  // fall back gracefully if the browser refuses to decode it.
  const unknown = candidates.find((url) => isBrowserRenderable(url));
  return unknown ? { thumbnailUrl: unknown, previewUrl: null, thumbnailKind: 'image' } : { thumbnailUrl: null, previewUrl: null, thumbnailKind: null };
}

export async function GET(request, { params }) {
  try {
    const { resource } = await params; const model = models[resource]; if (!model) return json({ error: 'Not found.' }, 404);
    const { user } = await requireOrganization(request); const { take, skip } = pageOptions(request); const organizationId = user.organizationId;
    const requestedId = new URL(request.url).searchParams.get('id');
    const where = resource === 'notifications' ? { userId: user.sub, organizationId } : resource === 'templates' ? { OR: [{ organizationId }, { organizationId: null, isPublished: true }] } : resource === 'projects' && requestedId ? { organizationId, id: requestedId } : { organizationId };
    let records = await prisma[model].findMany({ where, take, skip, orderBy: { createdAt: 'desc' } });
    if (resource === 'projects') {
      let groups;
      let total;
      let statusHistory = [];
      if (requestedId && !records[0]) {
        groups = [];
        total = 0;
      } else if (requestedId) {
        const category = projectCategoryKey(records[0].name);
        const related = await prisma.project.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
        const requestedStatus = projectStatusKey(records[0].status);
        const matching = collapseProjectsByCategory(related.filter((project) => projectCategoryKey(project.name) === category));
        groups = matching.filter((group) => group.statusKey === requestedStatus && group.projectIds.includes(requestedId));
        total = groups.length;
        statusHistory = records.map(({ id, status, createdAt, updatedAt }) => ({ id, status, createdAt, updatedAt }));
      } else {
        // Group before pagination so old duplicate attempts cannot consume the
        // whole page and hide otherwise distinct projects.
        const allProjects = await prisma.project.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
        const allGroups = collapseProjectsByCategory(allProjects);
        total = allGroups.length;
        groups = allGroups.slice(skip, skip + take);
        statusHistory = projectStatusHistory(allProjects);
      }
      const projectIds = groups.flatMap((group) => group.projectIds);
      const assets = projectIds.length ? await prisma.asset.findMany({ where: { projectId: { in: projectIds } }, orderBy: { createdAt: 'desc' } }) : [];
      const data = await Promise.all(groups.map(async ({ project: record, projectIds: relatedProjectIds }) => {
        const relatedIds = new Set(relatedProjectIds);
        const projectAssets = await Promise.all(uniqueProjectAssets(assets.filter((asset) => relatedIds.has(asset.projectId))).map(async (asset) => ({
          ...asset,
          outputUrl: await mediaUrlForWorkspace(asset.outputUrl, organizationId),
          thumbnailUrl: await mediaUrlForWorkspace(asset.thumbnailUrl, organizationId),
        })));
        let configuration = {};
        try { configuration = JSON.parse(record.configuration || '{}'); } catch {}
        const signedProject = {
          ...record,
          thumbnailUrl: await mediaUrlForWorkspace(record.thumbnailUrl, organizationId),
          finalVideoUrl: await mediaUrlForWorkspace(record.finalVideoUrl, organizationId),
          finalThumbnailUrl: await mediaUrlForWorkspace(record.finalThumbnailUrl, organizationId),
        };
        return { ...publicProject(signedProject), configuration, assetCount: projectAssets.length, assets: projectAssets.map(publicAsset), ...projectPreview(signedProject, projectAssets) };
      }));
      return json({ data, statusHistory, pagination: { limit: take, offset: skip, total } });
    }
    const safe = resource === 'integrations' ? records.map(({ encryptedAccessToken, encryptedRefreshToken, ...record }) => record) : resource === 'api-keys' ? records.map(({ keyHash, ...record }) => record) : records;
    return json({ data: safe, pagination: { limit: take, offset: skip } });
  } catch (error) { return json({ error: error.message || 'Unauthorized.' }, 401); }
}

export async function POST(request, { params }) {
  try {
    const { resource } = await params; const model = models[resource]; if (!model) return json({ error: 'Not found.' }, 404);
    const { user, membership } = await requireOrganization(request); const body = await request.json(); const organizationId = user.organizationId;
    if (['VIEWER', 'REVIEWER'].includes(membership.role)) return json({ error: 'Insufficient permission.' }, 403);
    if (resource === 'projects') {
      const requestedName = String(body.name || 'Untitled project').trim().replace(/\s+/g, ' ').slice(0, 200) || 'Untitled project';
      const projectData = {
        organizationId, createdById: user.sub, name: requestedName,
        description: body.description || null, prompt: body.prompt || null,
        configuration: JSON.stringify(body.configuration || {}),
        inputMethod: String(body.inputMethod || 'TEXT').toUpperCase(),
        platform: body.platform || null, aspectRatio: body.aspectRatio || null,
        outputType: String(body.outputType || 'IMAGE').toUpperCase(),
        status: 'NOT_STARTED', thumbnailUrl: body.thumbnailUrl || null,
      };
      const reusableData = {
        name: projectData.name, description: projectData.description, prompt: projectData.prompt,
        configuration: projectData.configuration, inputMethod: projectData.inputMethod,
        platform: projectData.platform, aspectRatio: projectData.aspectRatio,
        outputType: projectData.outputType, status: projectData.status,
      };
      const result = await prisma.$transaction(async (tx) => {
        await lockWorkspaceQuota(tx, organizationId);
        const activeProjects = await tx.project.findMany({ where: { organizationId, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' } });
        const reusable = activeProjects.find((project) =>
          projectCategoryKey(project.name) === projectCategoryKey(requestedName)
          && ['NOT_STARTED', 'IN_PROGRESS', 'DRAFT', 'ACTIVE'].includes(project.status)
        );
        if (reusable) return { project: await tx.project.update({ where: { id: reusable.id }, data: reusableData }), reused: true };
        const entitlement = await workspaceEntitlements(tx, organizationId);
        assertProjectCapacity(entitlement, activeProjects.length);
        return { project: await tx.project.create({ data: projectData }), reused: false };
      });
      return json({ data: publicProject(result.project), reused: result.reused }, result.reused ? 200 : 201);
    }
    if (resource === 'api-keys') {
      const rawKey = `crt_${randomBytes(32).toString('base64url')}`;
      const record = await prisma.apiKey.create({ data: { organizationId, createdById: user.sub, name: String(body.name || 'Unnamed key'), keyPrefix: rawKey.slice(0, 12), keyHash: createHash('sha256').update(rawKey).digest('hex'), scopes: JSON.stringify(body.scopes || []) } });
      const { keyHash, ...safe } = record; return json({ data: safe, apiKey: rawKey }, 201);
    }
    const dataByResource = {
      projects: { organizationId, createdById: user.sub, name: String(body.name || 'Untitled project').trim().replace(/\s+/g, ' ').slice(0, 200), description: body.description || null, prompt: body.prompt || null, configuration: JSON.stringify(body.configuration || {}), inputMethod: String(body.inputMethod || 'TEXT').toUpperCase(), platform: body.platform || null, aspectRatio: body.aspectRatio || null, outputType: String(body.outputType || 'IMAGE').toUpperCase(), status: 'NOT_STARTED', thumbnailUrl: body.thumbnailUrl || null },
      campaigns: { organizationId, projectId: body.projectId || null, createdById: user.sub, name: String(body.name || 'Untitled campaign'), productName: body.productName || null, productDescription: body.productDescription || null, targetAudience: body.targetAudience || null, objective: body.objective || null, offer: body.offer || null, platforms: JSON.stringify(body.platforms || []), strategy: body.strategy ? JSON.stringify(body.strategy) : null, contentPlan: body.contentPlan ? JSON.stringify(body.contentPlan) : null, status: body.status || 'PLANNING' },
      workflows: { organizationId, createdById: user.sub, name: String(body.name || 'Untitled workflow'), description: body.description || null, definition: JSON.stringify(body.definition || {}) },
      templates: { organizationId, createdById: user.sub, name: String(body.name || 'Untitled template'), slug: `${String(body.slug || body.name || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, configuration: JSON.stringify(body.configuration || {}) },
      notifications: { userId: user.sub, organizationId, type: String(body.type || 'system'), title: String(body.title || 'Notification'), message: String(body.message || '') },
      integrations: { organizationId, provider: body.provider || 'OTHER', accountName: body.accountName || null, externalAccountId: body.externalAccountId || null, scopes: JSON.stringify(body.scopes || []), metadata: JSON.stringify(body.metadata || {}) },
    };
    const created = await prisma[model].create({ data: dataByResource[resource] });
    return json({ data: resource === 'projects' ? publicProject(created) : created }, 201);
  } catch (error) {
    const status = error.code === 'PROJECT_LIMIT_REACHED' ? 403 : /auth|token|jwt|claim timestamp|organization access/i.test(error.message || '') ? 401 : 400;
    return json({ error: error.message || 'Request failed.', ...(error.code ? { code: error.code } : {}), ...(error.limit != null ? { limit: error.limit, used: error.used } : {}) }, status);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { resource } = await params;
    if (!['projects', 'campaigns'].includes(resource)) return json({ error: 'Not found.' }, 404);
    const { user, membership } = await requireOrganization(request);
    if (['VIEWER', 'REVIEWER'].includes(membership.role)) return json({ error: 'Insufficient permission.' }, 403);
    const body = await request.json();
    const targetModel = resource === 'projects' ? prisma.project : prisma.campaign;
    const existing = await targetModel.findFirst({ where: { id: String(body.id || ''), organizationId: user.organizationId } });
    if (!existing) return json({ error: resource === 'projects' ? 'Project not found.' : 'Campaign not found.' }, 404);
    if (resource === 'campaigns') {
      const campaignStatuses = ['DRAFT', 'PLANNING', 'GENERATING', 'REVIEW', 'COMPLETED', 'FAILED', 'ARCHIVED'];
      const status = String(body.status || '').toUpperCase();
      if (!campaignStatuses.includes(status)) return json({ error: 'Invalid campaign status.' }, 400);
      return json({ data: await prisma.campaign.update({ where: { id: existing.id }, data: { status } }) });
    }
    const allowedStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'DRAFT', 'ACTIVE', 'ARCHIVED'];
    const data = {};
    if (body.name) data.name = String(body.name).slice(0, 200);
    if ('description' in body) data.description = body.description || null;
    if ('prompt' in body) data.prompt = body.prompt || null;
    if (body.configuration) data.configuration = JSON.stringify(body.configuration);
    if (body.platform) data.platform = body.platform;
    if (body.aspectRatio) data.aspectRatio = body.aspectRatio;
    if (body.outputType) data.outputType = String(body.outputType).toUpperCase();
    if (body.thumbnailUrl) data.thumbnailUrl = body.thumbnailUrl;
    if (body.status && allowedStatuses.includes(String(body.status).toUpperCase())) data.status = String(body.status).toUpperCase();
    if (body.applyToCategory) {
      const category = projectCategoryKey(existing.name);
      const workspaceProjects = await prisma.project.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } });
      const ids = workspaceProjects.filter((project) =>
        projectCategoryKey(project.name) === category
        && (!body.statusGroup || projectStatusKey(project.status) === projectStatusKey(body.statusGroup))
      ).map((project) => project.id);
      await prisma.project.updateMany({ where: { id: { in: ids } }, data });
      return json({ data: publicProject(await prisma.project.findUnique({ where: { id: existing.id } })) });
    }
    return json({ data: publicProject(await prisma.project.update({ where: { id: existing.id }, data })) });
  } catch (error) {
    const status = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || '') ? 401 : 400;
    return json({ error: error.message || 'Unable to update project.' }, status);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { resource } = await params;
    if (resource !== 'projects') return json({ error: 'Not found.' }, 404);
    const { user, membership } = await requireOrganization(request);
    if (['VIEWER', 'REVIEWER'].includes(membership.role)) return json({ error: 'Insufficient permission.' }, 403);
    const body = await request.json().catch(() => ({}));
    const project = await prisma.project.findFirst({ where: { id: String(body.id || ''), organizationId: user.organizationId } });
    if (!project) return json({ error: 'Project not found.' }, 404);
    await permanentlyDeleteProjects(prisma, [project]);
    return json({ ok: true, deletedId: project.id });
  } catch (error) {
    const status = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || '') ? 401 : 500;
    return json({ error: error.message || 'Unable to delete project.' }, status);
  }
}
