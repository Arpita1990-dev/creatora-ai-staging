"use client";

import Link from "next/link";
import { useState } from "react";
export function SocialPlatformIcon({ platform }) {
  if (platform === "FACEBOOK") return <svg className="social-publish-icon facebook" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M13.6 20v-7h2.35l.35-2.73h-2.7V8.53c0-.79.22-1.33 1.36-1.33h1.45V4.76c-.25-.03-1.11-.11-2.11-.11-2.09 0-3.52 1.28-3.52 3.62v2H8.42V13h2.36v7h2.82Z" /></svg>;
  if (platform === "INSTAGRAM") return <svg className="social-publish-icon instagram" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.1" /><circle className="instagram-dot" cx="17.4" cy="6.8" r="1" /></svg>;
  if (platform === "LINKEDIN") return <svg className="social-publish-icon linkedin" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3" /><path d="M7 9.5V18M7 6.5v.1M11 18v-4.6c0-2.8 4-3 4 0V18M11 10v8" /></svg>;
  return <svg className="social-publish-icon youtube" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3Z" /></svg>;
}

function supportsPublishing(type) {
  return ["Image", "Video", "image", "video", "IMAGE", "VIDEO"].includes(type);
}

const PLATFORMS = [["FACEBOOK", "Facebook"], ["INSTAGRAM", "Instagram"], ["LINKEDIN", "LinkedIn"], ["YOUTUBE", "YouTube"]];

const ACCOUNT_TYPE_LABELS = {
  FACEBOOK_PAGE: "Facebook Page",
  INSTAGRAM_BUSINESS: "Instagram Business",
  LINKEDIN_MEMBER: "Personal Profile",
  LINKEDIN_ORGANIZATION: "Organization",
  YOUTUBE_CHANNEL: "YouTube Channel",
};

const PLATFORM_JOB_LABEL = {
  PUBLISHED: "Published",
  FAILED: "Failed",
  PROCESSING: "Publishing...",
};

export default function SocialPublishButton({ asset, authFetch, notify }) {
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(asset.caption || asset.prompt || "");
  const [selected, setSelected] = useState({});
  const [destinations, setDestinations] = useState([]);
  const [youtubeTitle, setYoutubeTitle] = useState(asset.title || "CreateoraAI video");
  const [youtubeDescription, setYoutubeDescription] = useState(asset.caption || asset.prompt || "");
  const [youtubePrivacy, setYoutubePrivacy] = useState("private");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [jobs, setJobs] = useState([]);
  const assetId = asset.assetId || asset.id;
  const assetType = asset.type || asset.assetType;
  const canPublish = assetId && asset.outputUrl && supportsPublishing(assetType);
  const isVideo = ["Video", "video", "VIDEO"].includes(assetType);

  // YouTube only accepts videos through the existing upload flow, so an image
  // disables those destinations instead of failing at publish time.
  const blockedReason = (destination) => {
    if (destination.platform === "YOUTUBE" && !isVideo) return "YouTube needs a video asset";
    if (destination.overLimit) return "Beyond your plan limit";
    return null;
  };

  const openPublisher = async (preferredPlatform) => {
    if (!canPublish) return notify("Generate an image or video before publishing.");
    setOpen(true);
    setJobs([]);
    setLoading(true);
    try {
      const response = await authFetch("/api/social/connections", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load connected accounts.");
      const rows = result.destinations || [];
      setDestinations(rows);
      setSelected(Object.fromEntries(rows.map((destination) => {
        const blocked = blockedReason(destination);
        if (blocked) return [destination.id, false];
        const eligible = !preferredPlatform || destination.platform === preferredPlatform;
        return [destination.id, eligible];
      })));
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id) => setSelected((current) => ({ ...current, [id]: !current[id] }));

  const submit = async () => {
    const chosen = destinations.filter((destination) => selected[destination.id]);
    if (!chosen.length) return notify("Select at least one connected social account.");
    if (chosen.some((destination) => destination.platform === "YOUTUBE") && !youtubeTitle.trim()) return notify("Enter a YouTube video title.");
    setPublishing(true);
    try {
      const response = await authFetch("/api/publish-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        assetId, caption, youtubeTitle, youtubeDescription, youtubePrivacy,
        destinations: chosen.map((destination) => ({ destinationId: destination.id, platform: destination.platform })),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to publish this asset.");
      setJobs(result.jobs || []);
      const published = (result.jobs || []).filter((job) => job.status === "PUBLISHED").length;
      const failed = (result.jobs || []).length - published;
      notify(published ? `Published to ${published} destination${published === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.` : "Publishing failed. Review the details below.");
    } catch (error) {
      notify(error.message);
    } finally {
      setPublishing(false);
    }
  };

  const groups = PLATFORMS.map(([platform, label]) => ({ platform, label, rows: destinations.filter((destination) => destination.platform === platform) }));
  const hasYouTubeSelection = destinations.some((destination) => destination.platform === "YOUTUBE" && selected[destination.id]);

  return <>
    <div className="social-publish-actions">
      <span>Publish to social media</span>
      <div className="social-publish-triggers" aria-label="Publish generated asset">
        {PLATFORMS.map(([platform, label]) => <button key={platform} type="button" className={`social-publish-trigger ${platform.toLowerCase()}`} disabled={!canPublish || (platform === "YOUTUBE" && !isVideo)} aria-label={`Publish to ${label}`} title={canPublish ? `Publish to ${label}` : "Generate an image or video first"} onClick={() => openPublisher(platform)}><SocialPlatformIcon platform={platform} /></button>)}
      </div>
    </div>
    {!canPublish && <small className="social-publish-hint">Generate an image or video to enable publishing.</small>}
    {open && <div className="asset-dialog-backdrop" onClick={() => setOpen(false)}><section className="settings-card asset-dialog publish-dialog" onClick={(event) => event.stopPropagation()}>
      <div className="campaign-output-head"><div><span>Publish Content</span><h3>Publish to</h3></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <div className="publish-dialog-body">
        {loading ? <p>Loading connected social accounts...</p> : <>
          {!destinations.length && <p>No connected accounts in this workspace. <Link href="/dashboard/settings">Connect one</Link> to publish here.</p>}
          {groups.filter((group) => group.rows.length).map((group) => <div key={group.platform} className="publish-destination-group">
            <h4>{group.label}</h4>
            {group.rows.map((destination) => {
              const blocked = blockedReason(destination);
              return <label key={destination.id} className={`social-destination ${blocked ? "disabled" : ""}`}>
                <input type="checkbox" checked={Boolean(selected[destination.id])} disabled={Boolean(blocked)} onChange={() => toggle(destination.id)} />
                {destination.thumbnail ? <img className="social-account-avatar" src={destination.thumbnail} alt="" /> : <SocialPlatformIcon platform={destination.platform} />}
                <span><b>{destination.label}</b><small>{blocked || ACCOUNT_TYPE_LABELS[destination.accountType] || destination.accountType}</small></span>
              </label>;
            })}
          </div>)}
          {hasYouTubeSelection && <div className="youtube-publish-fields"><label>Video title<input value={youtubeTitle} maxLength={100} onChange={(event) => setYoutubeTitle(event.target.value)} required /></label><label>Description<textarea value={youtubeDescription} maxLength={5000} onChange={(event) => setYoutubeDescription(event.target.value)} /></label><label>Visibility<select value={youtubePrivacy} onChange={(event) => setYoutubePrivacy(event.target.value)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label></div>}
          <label>Caption<textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Write the post caption and hashtags." /></label>
        </>}
        {jobs.length > 0 && <div className="publish-results">
          <h4>Results</h4>
          {jobs.map((job) => <p key={job.id} className={job.status === "FAILED" ? "failed" : ""}>
            <b>{job.platform} / {job.destinationName}</b> — {PLATFORM_JOB_LABEL[job.status] || job.status}
            {job.errorMessage ? `: ${job.errorMessage}` : ""}
            {job.platformPostUrl ? <> · <a href={job.platformPostUrl} target="_blank" rel="noreferrer">View post</a></> : null}
          </p>)}
        </div>}
      </div>
      <div className="publish-dialog-footer">
        <button type="button" className="button" onClick={submit} disabled={loading || publishing || !Object.values(selected).some(Boolean)}>{publishing ? "Publishing..." : "Publish Now"}</button>
      </div>
    </section></div>}
  </>;
}