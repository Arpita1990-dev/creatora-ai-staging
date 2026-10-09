export const WORKSPACE_KEY = 'creatora_workspace';

const defaultWorkspace = {
  profile: { firstName: 'Arpita', lastName: 'Das', email: 'arpita@example.com' },
  workspace: { name: 'Arpita Studio', industry: 'E-commerce', type: 'Small business / brand' },
  credits: 840,
  notifications: [
    { id: 'welcome', title: 'Welcome to Creatora', text: 'Your workspace is ready to create.', read: false, createdAt: 'Today' },
  ],
  usageHistory: [{ id: 'seed-usage', type: 'Monthly allocation', amount: 1200, date: 'This month' }],
  assets: [],
  workflows: [
    { id: 'workflow-launch', name: 'Product to campaign', description: 'Create a connected launch kit.', status: 'Ready', updated: 'Yesterday' },
    { id: 'workflow-reel', name: 'Image to reel', description: 'Turn a product image into short video.', status: 'Ready', updated: '3 days ago' },
  ],
  team: [
    { id: 'member-arpita', name: 'Arpita Das', email: 'arpita@example.com', role: 'Owner', status: 'Active' },
    { id: 'member-rahul', name: 'Rahul Kumar', email: 'rahul@example.com', role: 'Editor', status: 'Active' },
    { id: 'member-sneha', name: 'Sneha Mehta', email: 'sneha@example.com', role: 'Viewer', status: 'Invited' },
  ],
  templates: [
    { id: 'template-luxury', name: 'Luxury product launch', type: 'Product', description: '4 outputs · Image + Copy', favourite: true },
    { id: 'template-ugc', name: 'UGC product reel', type: 'Video', description: '15 sec · 9:16', favourite: false },
    { id: 'template-carousel', name: 'Instagram carousel', type: 'Social', description: '5 slides · 1:1', favourite: false },
    { id: 'template-marketplace', name: 'Marketplace photo set', type: 'Ecommerce', description: '6 images · Multi-format', favourite: false },
  ],
  brandKit: { logoName: '', primaryColor: '#FF5A36', secondaryColor: '#101011', voice: 'Clear, confident and warm' },
  settings: { notifications: true, autoSave: true, defaultPlatform: 'Instagram / Facebook' },
  projects: [],
};

export function getWorkspace() {
  if (typeof window === 'undefined') return defaultWorkspace;
  try {
    const saved = window.localStorage.getItem(WORKSPACE_KEY);
    if (!saved) return clone(defaultWorkspace);
    const parsed = JSON.parse(saved);
    return {
      ...clone(defaultWorkspace),
      ...parsed,
      profile: { ...defaultWorkspace.profile, ...parsed.profile },
      workspace: { ...defaultWorkspace.workspace, ...parsed.workspace },
      brandKit: { ...defaultWorkspace.brandKit, ...parsed.brandKit },
      settings: { ...defaultWorkspace.settings, ...parsed.settings },
    };
  } catch {
    return defaultWorkspace;
  }
}

export function saveWorkspace(workspace) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  window.dispatchEvent(new CustomEvent('creatora:workspace-updated'));
}

export function updateWorkspace(updates) {
  const next = { ...getWorkspace(), ...updates };
  saveWorkspace(next);
  return next;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function resetWorkspace() {
  const next = clone(defaultWorkspace);
  saveWorkspace(next);
  return next;
}

export function addNotification(input) {
  const workspace = getWorkspace();
  const notification = { id: makeId('notification'), read: false, createdAt: 'Just now', ...input };
  updateWorkspace({ notifications: [notification, ...(workspace.notifications || [])].slice(0, 30) });
  return notification;
}

export function markNotificationsRead() {
  const workspace = getWorkspace();
  updateWorkspace({ notifications: (workspace.notifications || []).map((item) => ({ ...item, read: true })) });
}

export function addAsset(input) {
  const workspace = getWorkspace();
  const asset = { id: makeId('asset'), status: 'Ready', type: 'Image', ...input };
  updateWorkspace({ assets: [asset, ...(workspace.assets || [])] });
  return asset;
}

export function updateAsset(id, updates) {
  const workspace = getWorkspace();
  updateWorkspace({ assets: (workspace.assets || []).map((item) => item.id === id ? { ...item, ...updates } : item) });
}

export function deleteAsset(id) {
  const workspace = getWorkspace();
  updateWorkspace({ assets: (workspace.assets || []).filter((item) => item.id !== id) });
}

export function addWorkflow(input) {
  const workspace = getWorkspace();
  const workflow = { id: makeId('workflow'), status: 'Draft', updated: 'Just now', ...input };
  updateWorkspace({ workflows: [workflow, ...(workspace.workflows || [])] });
  return workflow;
}

export function updateWorkflow(id, updates) {
  const workspace = getWorkspace();
  updateWorkspace({ workflows: (workspace.workflows || []).map((item) => item.id === id ? { ...item, ...updates } : item) });
}

export function deleteWorkflow(id) {
  const workspace = getWorkspace();
  updateWorkspace({ workflows: (workspace.workflows || []).filter((item) => item.id !== id) });
}

export function addTeamMember(input) {
  const workspace = getWorkspace();
  const member = { id: makeId('member'), role: 'Editor', status: 'Invited', ...input };
  updateWorkspace({ team: [member, ...(workspace.team || [])] });
  return member;
}

export function updateTeamMember(id, updates) {
  const workspace = getWorkspace();
  updateWorkspace({ team: (workspace.team || []).map((item) => item.id === id ? { ...item, ...updates } : item) });
}

export function deleteTeamMember(id) {
  const workspace = getWorkspace();
  updateWorkspace({ team: (workspace.team || []).filter((item) => item.id !== id) });
}

export function toggleTemplateFavourite(id) {
  const workspace = getWorkspace();
  const templates = workspace.templates || [];
  const existing = templates.find((item) => item.id === id);
  updateWorkspace({ templates: existing
    ? templates.map((item) => item.id === id ? { ...item, favourite: !item.favourite } : item)
    : [{ id, name: id, type: 'Workflow', description: 'Saved template', favourite: true }, ...templates] });
}

export function createProject(input) {
  const workspace = getWorkspace();
  const cost = input.cost ?? 5;
  const project = {
    id: input.id || makeId('project'),
    name: input.name || 'Untitled creative',
    assets: input.assets ?? 0,
    status: input.status || 'NOT_STARTED',
    progress: 0,
    updated: 'just now',
    style: input.style || 'Luxury',
    prompt: input.prompt || '',
    imageName: input.imageName || '',
    platform: input.platform || '',
    format: input.format || '',
    outputType: input.outputType || 'IMAGE',
    configuration: input.configuration || {},
  };
  // NOTE: no local `credits` decrement. MuAPI is the single source of truth for
  // the credit balance (see lib/ai/credits.js and /api/muapi/balance), so
  // tracking a parallel local figure here only caused the UI to disagree with
  // the provider.
  updateWorkspace({ projects: [project, ...workspace.projects], usageHistory: [{ id: makeId('usage'), type: `Generation: ${project.name}`, amount: -cost, date: 'Just now' }, ...(workspace.usageHistory || [])] });
  addNotification({ title: 'Generation started', text: `${project.name} is being created.` });
  return project;
}

export function updateProject(id, updates) {
  const workspace = getWorkspace();
  updateWorkspace({ projects: workspace.projects.map((item) => item.id === id ? { ...item, ...updates } : item) });
}

export function deleteProject(id) {
  const workspace = getWorkspace();
  updateWorkspace({ projects: workspace.projects.filter((item) => item.id !== id), assets: (workspace.assets || []).filter((item) => item.projectId !== id) });
}

export { defaultWorkspace };
