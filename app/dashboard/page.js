"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { defaultWorkspace, getWorkspace } from "@/lib/workspaceStore";
import MuApiStatusCard from "@/components/MuApiStatusCard";
import CreateoraLoadingState from "@/app/components/CreateoraLoadingState";
import {
  AuthenticatedImage,
  AuthenticatedVideo,
} from "@/components/AuthenticatedMedia";

const quick = [
  ["ads", "feature-creation.png", "Product ad", "Create platform-ready ads from one photo", "coral"],
  ["image", "flow-image.png", "Product photo", "Generate polished studio and lifestyle shots", "orange"],
  ["video", "flow-preview.png", "Short video", "Animate an image or create from a prompt", "red"],
  ["campaign", "feature-workspace.png", "Full campaign", "Copy, images and video in one workflow", "green", "/assets/Neon Creative Toolkit Dashboard.png"],
];

const chartStatuses = [["NOT_STARTED", "Not started", "#8d8792"], ["IN_PROGRESS", "In progress", "#f0a36b"], ["COMPLETED", "Completed", "#31a371"], ["FAILED", "Failed", "#e05252"], ["ARCHIVED", "Archived", "#8b6edb"]];

const assetCategories = [
  { key: "IMAGE", label: "Images", color: "#62a8ff" },
  { key: "VIDEO", label: "Videos", color: "#34c785" },
  { key: "AUDIO", label: "Voice", color: "#ffb74d" },
];

function MonthlyProjectChart({ projects, loading = false }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [navigatedByUser, setNavigatedByUser] = useState(false);

  // The projects arrive asynchronously, so the "open the month that actually has
  // data" behaviour cannot live in a useState initializer (it would run before the
  // first fetch resolves and always fall back to the current month).
  useEffect(() => {
    if (navigatedByUser || !projects || projects.length === 0) return;
    const now = new Date();
    const hasCurrent = projects.some((p) => {
      const d = new Date(p.updatedAt || p.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    if (hasCurrent) {
      setMonthOffset((current) => (current === 0 ? current : 0));
      return;
    }
    const latest = projects.reduce((max, p) => {
      const d = new Date(p.updatedAt || p.createdAt);
      return d > max ? d : max;
    }, new Date(0));
    if (latest.getTime() === 0) return;
    const diff = (latest.getFullYear() - now.getFullYear()) * 12 + (latest.getMonth() - now.getMonth());
    const target = Math.min(0, diff);
    setMonthOffset((current) => (current === target ? current : target));
  }, [projects, navigatedByUser]);

  const chart = useMemo(() => {
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const counts = Object.fromEntries(chartStatuses.map(([key]) => [key, 0]));
    let totalProjects = 0;
    (projects || []).forEach((project) => {
      const date = new Date(project.updatedAt || project.createdAt);
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const key = project.status === "DRAFT" ? "NOT_STARTED" : project.status === "ACTIVE" ? "IN_PROGRESS" : project.status;
      if (counts[key] !== undefined) {
        counts[key] += 1;
        totalProjects += 1;
      }
    });
    const maxCount = Math.max(1, ...chartStatuses.map(([key]) => counts[key]));
    return {
      counts,
      maxCount,
      totalProjects,
      label: targetDate.toLocaleString("en", { month: "long", year: "numeric" }),
    };
  }, [projects, monthOffset]);

  return (
    <article className="project-wave-card">
      <div className="wave-title">
        <div>
          <span>MONTHLY PROJECT STATUS</span>
        </div>
        <div className="wave-month-nav" aria-label="Chart month navigation">
          <button
            type="button"
            className="wave-nav-btn"
            onClick={() => { setNavigatedByUser(true); setMonthOffset((o) => o - 1); }}
            title="Previous month"
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="wave-month-indicator">{chart.label}</span>
          <button
            type="button"
            className="wave-nav-btn"
            onClick={() => { setNavigatedByUser(true); setMonthOffset((o) => o + 1); }}
            disabled={monthOffset >= 0}
            title="Next month"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>
      {loading ? (
        <CreateoraLoadingState
          className="createora-loading-state--compact"
          label="Loading your workspace..."
          size={60}
        />
      ) : (
        <>
          <b className="status-total">
            {chart.totalProjects} {chart.totalProjects === 1 ? "Project" : "Projects"}
          </b>
          {chart.totalProjects === 0 ? (
            <p className="status-empty">No projects for this month.</p>
          ) : (
            <div className="status-bars">
              {chartStatuses.map(([key, label, color]) => {
                const count = chart.counts[key];
                const percent = chart.totalProjects ? Math.round((count / chart.totalProjects) * 100) : 0;
                return (
                  <div className="status-row" key={key}>
                    <span className="status-label">{label}</span>
                    <span className="status-track">
                      <span
                        className="status-fill"
                        style={{ background: color, width: `${(count / chart.maxCount) * 100}%` }}
                      />
                    </span>
                    <span className="status-count">{count}</span>
                    <span className="status-pct">{percent}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function DashboardTemplate({ template }) {
  const [playing, setPlaying] = useState(false);
  const isVideo = Boolean(template.previewUrl) && /\.(mp4|webm|mov|m3u8)(?:\?|$)/i.test(template.previewUrl);
  return <article className="template-card live-template-card"><div className="template-live-media">{playing && isVideo ? <video src={template.previewUrl} poster={template.image || undefined} controls autoPlay playsInline /> : template.image ? <img src={template.image} alt={`${template.name} thumbnail`} /> : <div className="template-art peach"><span>{template.category}</span><div className="product-shape" /></div>}{isVideo && !playing && <button type="button" className="template-play" onClick={() => setPlaying(true)} aria-label={`Play ${template.name}`}>▶</button>}<span className="template-type">{template.type || template.category || "TEMPLATE"}</span></div><h3>{template.name}</h3><p>{template.description || `${template.platform || "Multi-platform"} · ${template.format || "Flexible"}`}</p><Link href={`/dashboard/templates?template=${encodeURIComponent(template.id)}`}>Use template →</Link></article>;
}

const statusLabel = (status) =>
  ({ NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Completed", FAILED: "Failed", ARCHIVED: "Archived", DRAFT: "Not started", ACTIVE: "In progress" })[status] || status;

const relativeTime = (value) => {
  if (!value) return "recently";
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export default function Dashboard() {
  const { authFetch, user } = useAuth();
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [projects, setProjects] = useState([]);
  const [projectHistory, setProjectHistory] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [assetIds, setAssetIds] = useState(() => new Set());
  const [listedAssets, setListedAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetLoadFailed, setAssetLoadFailed] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  useEffect(() => {
    const refresh = () => setWorkspace(getWorkspace());
    refresh();
    window.addEventListener("creatora:workspace-updated", refresh);
    return () => window.removeEventListener("creatora:workspace-updated", refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/workspace/projects?limit=100", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load projects.");
        if (!cancelled) {
          const projectData = result.data || [];
          setProjects(projectData);
          setProjectHistory(result.statusHistory || projectData);
          const projectAssetIds = projectData.flatMap((project) =>
            (project.assets || []).map((asset) => asset.id).filter(Boolean),
          );
          setAssetIds((current) => new Set([...current, ...projectAssetIds]));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setProjectHistory([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => { cancelled = true; };
  }, [authFetch]);

  useEffect(() => {
    let cancelled = false;
    setAssetLoadFailed(false);
    authFetch("/api/assets", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load assets.");
        if (!cancelled) {
          const loadedAssets = result.assets || [];
          setListedAssets(loadedAssets);
          const listedAssetIds = loadedAssets
            .map((asset) => asset.id)
            .filter(Boolean);
          setAssetIds((current) => new Set([...current, ...listedAssetIds]));
        }
      })
      .catch(() => {
        if (!cancelled) setAssetLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingAssets(false);
      });
    return () => { cancelled = true; };
  }, [authFetch]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates?page=1&pageSize=4", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => { if (!cancelled) setTemplates(result.templates || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingTemplates(false); });
    return () => { cancelled = true; };
  }, []);

  const firstName = user?.firstName || workspace.profile.firstName;
  const createdAssetCount = assetIds.size;
  const assetBreakdown = useMemo(() => {
    const counts = { IMAGE: 0, VIDEO: 0, AUDIO: 0, OTHER: 0 };
    const seen = new Set();
    const countAsset = (asset) => {
      if (!asset || !asset.id || seen.has(asset.id)) return;
      seen.add(asset.id);
      const type = String(asset.assetType || "").toUpperCase();
      counts[type === "IMAGE" || type === "VIDEO" || type === "AUDIO" ? type : "OTHER"] += 1;
    };
    listedAssets.forEach(countAsset);
    projects.forEach((project) => (project.assets || []).forEach(countAsset));
    return counts;
  }, [listedAssets, projects]);
  const recentProjects = projects.filter((project) => project.status !== "ARCHIVED");
  const today = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();

  return (
    <main className="dashboard-content">
      <div className="welcome">
        <div><span>{today}</span><h1>Good evening, {firstName} <i>✦</i></h1><p>What would you like to create for your brand today?</p></div>
      </div>
      <MuApiStatusCard authFetch={authFetch} />
      <section className="quick-grid">
        {quick.map(([id, icon, title, copy, color, image]) => <Link href={`/dashboard/${id}`} className={`quick-card ${color}${image ? " quick-card--campaign" : ""}`} key={id}>{image ? <span className="quick-card-image"><Image src={image} alt="Creatora AI campaign creation and publishing workspace" fill sizes="(max-width: 700px) 90vw, 300px" /></span> : <span className="quick-icon"><Image src={`/assets/icons/${icon}`} alt="" width={76} height={76} /></span>}<div><h3>{title}</h3><p>{copy}</p></div><b>→</b></Link>)}
      </section>
      <section className="stats-row dashboard-metrics">
        <article className="creative-assets-card">
          <span>CREATIVE ASSETS</span>
          {loadingAssets || loadingProjects ? (
            <CreateoraLoadingState
              className="createora-loading-state--compact"
              label="Loading your workspace..."
              size={60}
            />
          ) : (
            <>
              <b>{assetLoadFailed ? "—" : createdAssetCount}</b>
              <small>Total assets</small>
              <ul className="asset-breakdown">
                {assetCategories.map(({ key, label, color }) => (
                  <li key={key}>
                    <span className="asset-breakdown-label"><i style={{ background: color }} />{label}</span>
                    <b>{assetBreakdown[key] || 0}</b>
                  </li>
                ))}
                {assetBreakdown.OTHER > 0 && (
                  <li>
                    <span className="asset-breakdown-label"><i style={{ background: "#8d8792" }} />Other</span>
                    <b>{assetBreakdown.OTHER}</b>
                  </li>
                )}
              </ul>
              <div className="asset-distribution" role="img" aria-label="Asset type distribution">
                {assetCategories.map(({ key, label, color }) => {
                  const count = assetBreakdown[key] || 0;
                  if (!count) return null;
                  return <span key={key} className="asset-distribution-segment" style={{ background: color, flexGrow: count }} title={`${label}: ${count}`} />;
                })}
              </div>
              <Link href="/dashboard/assets" className="creative-assets-link">View assets →</Link>
            </>
          )}
        </article>
        <MonthlyProjectChart projects={projectHistory} loading={loadingProjects} />
      </section>
      <section className="content-section recent-creations">
        <div className="section-head">
          <div><h2>Recent creations</h2><p>Your latest generated and uploaded assets</p></div>
          <Link href="/dashboard/assets">View asset library →</Link>
        </div>
        {loadingAssets ? (
          <CreateoraLoadingState className="createora-loading-state--compact" label="Loading recent creations..." size={60} />
        ) : assetLoadFailed ? (
          <div className="project-empty"><h3>Recent creations are unavailable</h3><p>Your asset library could not be loaded right now.</p></div>
        ) : listedAssets.length ? (
          <div className="recent-creation-grid">
            {listedAssets.slice(0, 4).map((asset) => {
              const kind = String(asset.assetType || "").toUpperCase();
              const preview = asset.thumbnailUrl || asset.outputUrl;
              return (
                <Link href="/dashboard/assets" className="recent-creation-card" key={asset.id}>
                  <div className="recent-creation-media">
                    {kind === "VIDEO" && !asset.thumbnailUrl ? (
                      <AuthenticatedVideo src={asset.outputUrl} authFetch={authFetch} muted playsInline preload="metadata" fallback={<span>Video preview unavailable</span>} />
                    ) : kind === "IMAGE" || asset.thumbnailUrl ? (
                      <AuthenticatedImage src={preview} alt={asset.title || "Creative asset"} authFetch={authFetch} fallback={<span>Preview unavailable</span>} />
                    ) : (
                      <span>{kind === "AUDIO" ? "Audio creation" : "Asset preview unavailable"}</span>
                    )}
                  </div>
                  <span className="recent-creation-meta">
                    <b>{asset.title || "Untitled creation"}</b>
                    <small>{kind === "AVATAR_VIDEO" ? "Avatar video" : kind === "VIDEO" ? "Video" : kind === "AUDIO" ? "Voice" : "Image"} · {relativeTime(asset.createdAt)}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="project-empty"><h3>No creations yet</h3><p>Generate your first image, video, or voice asset to see it here.</p><Link className="button" href="/dashboard/create">Start creating</Link></div>
        )}
      </section>
      <section className="content-section">
        <div className="section-head"><div><h2>Popular templates</h2><p>Live templates from your Template Library</p></div><Link href="/dashboard/templates">View all templates →</Link></div>
        <div className="template-grid">
          {loadingTemplates ? <CreateoraLoadingState label="Loading your workspace..." /> : templates.length ? templates.map((template) => <DashboardTemplate template={template} key={template.id} />) : <div className="project-empty">No published templates are available.</div>}
        </div>
      </section>
      <section className="content-section">
        <div className="section-head"><div><h2>Recent projects</h2><p>Database-backed project status and outputs</p></div><Link href="/dashboard/projects">View all projects →</Link></div>
        <div className="dashboard-project-grid">
          {loadingProjects ? <CreateoraLoadingState label="Loading your workspace..." /> : recentProjects.length ? recentProjects.slice(0, 6).map((project) => (
            <Link href={`/dashboard/projects/${encodeURIComponent(project.id)}`} className="dashboard-project-card" key={project.id}>
              <div className="dashboard-project-media">
                {project.thumbnailUrl ? (
                  <AuthenticatedImage
                    src={project.thumbnailUrl}
                    alt=""
                    authFetch={authFetch}
                    fallback={<span>{project.name.slice(0, 2).toUpperCase()}</span>}
                  />
                ) : project.previewUrl && project.thumbnailKind === "video" ? (
                  <AuthenticatedVideo
                    src={project.previewUrl}
                    authFetch={authFetch}
                    muted
                    playsInline
                    preload="metadata"
                    fallback={<span>{project.name.slice(0, 2).toUpperCase()}</span>}
                  />
                ) : (
                  <span>{project.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div><b>{project.name}</b><small>{project.assetCount ?? project.assets ?? 0} assets · {project.platform || "No platform"} · {relativeTime(project.updatedAt)}</small></div>
              <span className={`status ${project.status === "COMPLETED" ? "green" : project.status === "IN_PROGRESS" ? "amber" : project.status === "FAILED" ? "red" : ""}`}>{statusLabel(project.status)}</span>
            </Link>
          )) : <div className="project-empty"><h3>No projects yet</h3><p>Create your first project to see its assets and progress here.</p><Link className="button" href="/dashboard/create">Create Project</Link></div>}
        </div>
      </section>
    </main>
  );
}
