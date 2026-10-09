"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import SocialPublishButton from "@/components/SocialPublishButton";
import {
  AuthenticatedDownloadLink,
  AuthenticatedImage,
  AuthenticatedVideo,
} from "@/components/AuthenticatedMedia";

const labels = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
  DRAFT: "Not started",
  ACTIVE: "In progress",
};

export default function ProjectWorkspace() {
  const { id } = useParams();
  const router = useRouter();
  const { authFetch } = useAuth();
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState("");

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/workspace/projects?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.data?.[0])
          throw new Error(result.error || "Project not found.");
        if (!cancelled) setProject(result.data[0]);
      })
      .catch((reason) => !cancelled && setError(reason.message));
    return () => { cancelled = true; };
  }, [authFetch, id]);

  const deleteProject = async () => {
    if (!window.confirm(`Permanently delete "${project.name}" and all of its assets? This cannot be undone.`)) return;
    setDeletingProject(true);
    setError("");
    try {
      const response = await authFetch("/api/workspace/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete project.");
      router.replace("/dashboard/projects");
    } catch (reason) {
      setError(reason.message || "Unable to delete project.");
      setDeletingProject(false);
    }
  };

  const deleteAsset = async (asset) => {
    if (!window.confirm(`Permanently delete "${asset.title}"? This cannot be undone.`)) return;
    setDeletingAssetId(asset.id);
    setError("");
    try {
      const response = await authFetch(`/api/assets?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete asset.");
      setProject((current) => ({ ...current, assets: current.assets.filter((item) => item.id !== asset.id) }));
    } catch (reason) {
      setError(reason.message || "Unable to delete asset.");
    } finally {
      setDeletingAssetId("");
    }
  };

  if (error)
    return <main className="workspace-page"><div className="agent-clarification">{error}</div><Link className="button" href="/dashboard/projects">Back to projects</Link></main>;
  if (!project)
    return <main className="workspace-page"><div className="template-loading"><span className="generation-spinner" /><b>Loading project…</b></div></main>;

  const configuration = project.configuration || {};
  const assets = project.assets || [];
  const completed = assets.filter((asset) => asset.status === "COMPLETED").length;
  const progress = project.status === "COMPLETED" ? 100 : project.status === "NOT_STARTED" ? 0 : assets.length ? Math.round((completed / assets.length) * 100) : 10;

  return (
    <main className="workspace-page project-workspace-page">
      <div className="page-title">
        <div>
          <span>PROJECTS / {project.id}</span>
          <h1>{project.name}</h1>
          <p>{project.description || "No project description was provided."}</p>
        </div>
        <div className="card-actions">
          <Link className="button" href={`/dashboard/create?prompt=${encodeURIComponent(project.description || project.prompt || "")}`}>Create variation</Link>
          <button type="button" disabled={deletingProject} onClick={deleteProject}>{deletingProject ? "Deleting..." : "Delete project"}</button>
        </div>
      </div>

      <section className="project-workspace-summary">
        <article><span>Status</span><b className={`status ${project.status === "COMPLETED" ? "green" : project.status === "IN_PROGRESS" ? "amber" : project.status === "FAILED" ? "red" : ""}`}>{labels[project.status] || project.status}</b></article>
        <article><span>Generation progress</span><b>{progress}%</b>
        {/* <div className="stat-meter"><i style={{ width: `${progress}%` }} /></div> */}
        
        </article>
        <article><span>Assets</span><b>{assets.length}</b><small>{completed} ready</small></article>
      </section>

      <div className="project-workspace-layout">
        <section className="settings-card">
          <h3>Prompt and settings</h3>
          <p className="project-prompt">{project.prompt || project.description}</p>
          <dl className="project-settings-list">
            <div><dt>Input</dt><dd>{project.inputMethod}</dd></div>
            <div><dt>Platform</dt><dd>{project.platform || "—"}</dd></div>
            <div><dt>Format</dt><dd>{configuration.format || project.aspectRatio || "—"}</dd></div>
            <div><dt>Output</dt><dd>{project.outputType}</dd></div>
            <div><dt>Direction</dt><dd>{configuration.creativeDirection || "—"}</dd></div>
            <div><dt>Duration</dt><dd>{configuration.videoDuration ? `${configuration.videoDuration}s` : "—"}</dd></div>
            <div><dt>Voiceover</dt><dd>{configuration.voiceover ? "On" : "Off"}</dd></div>
            <div><dt>Music</dt><dd>{configuration.music ? "On" : "Off"}</dd></div>
            <div><dt>CTA</dt><dd>{configuration.callToAction || "—"}</dd></div>
            <div><dt>Brand colors</dt><dd>{configuration.brandColors || "—"}</dd></div>
          </dl>
        </section>

        <section className="project-assets-panel">
          <div className="section-head"><div><h2>Project assets</h2><p>Images, videos, audio, and uploaded references linked to this project.</p></div><Link href="/dashboard/assets">Asset Library →</Link></div>
          <div className="project-asset-grid">
            {assets.length ? assets.map((asset) => {
              const url = asset.outputUrl || asset.thumbnailUrl;
              return (
                <article key={asset.id}>
                  <div className="project-asset-preview">
                    {url && asset.assetType === "VIDEO" ? (
                      <AuthenticatedVideo src={url} authFetch={authFetch} controls playsInline fallback={<span>{asset.assetType}</span>} />
                    ) : url && asset.assetType === "AUDIO" ? (
                      <audio src={url} controls />
                    ) : url ? (
                      <AuthenticatedImage src={url} alt={asset.title} authFetch={authFetch} fallback={<span>{asset.assetType}</span>} />
                    ) : (
                      <span>{asset.assetType}</span>
                    )}
                  </div>
                  <div><b>{asset.title}</b><small>{asset.assetType} · {asset.status}</small></div>
                  {url && <AuthenticatedDownloadLink src={url} filename={asset.title} authFetch={authFetch} />}
                  {url && <SocialPublishButton asset={{ ...asset, assetId: asset.id, type: asset.assetType, outputUrl: url }} authFetch={authFetch} notify={setError} />}
                  <button type="button" disabled={deletingAssetId === asset.id} onClick={() => deleteAsset(asset)}>{deletingAssetId === asset.id ? "Deleting..." : "Delete"}</button>
                </article>
              );
            }) : <div className="project-empty"><h3>No assets yet</h3><p>Assets will appear here as generation jobs complete.</p></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
