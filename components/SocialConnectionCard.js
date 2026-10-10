"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SocialPlatformIcon } from "@/components/SocialPublishButton";

const COPY = {
  meta: {
    name: "Meta",
    description: "Connect Facebook Pages and Instagram Business accounts for publishing.",
    connectLabel: "Connect another Facebook / Instagram account",
    icon: "FACEBOOK",
  },
  linkedin: {
    name: "LinkedIn",
    description: "Connect your LinkedIn profile or organization for image and video publishing.",
    connectLabel: "Connect another LinkedIn account",
    icon: "LINKEDIN",
  },
  youtube: {
    name: "YouTube",
    description: "Connect YouTube channels for video uploads.",
    connectLabel: "Connect another YouTube account",
    icon: "YOUTUBE",
  },
};

const ACCOUNT_TYPE_LABELS = {
  FACEBOOK_PAGE: "Facebook Page",
  INSTAGRAM_BUSINESS: "Instagram Business",
  LINKEDIN_MEMBER: "Personal Profile",
  LINKEDIN_ORGANIZATION: "Organization",
  YOUTUBE_CHANNEL: "YouTube Channel",
};

// One row per connected account. Each row owns its own destination id, which is
// what the disconnect endpoint receives, so removing one account never touches
// the provider's other connections.
export default function SocialConnectionCard({ provider, authFetch, notify }) {
  const copy = COPY[provider];
  const searchParams = useSearchParams();
  const reportedStatus = useRef(null);
  const connectInFlight = useRef(false);
  const connectDialog = useRef(null);
  const connectDialogAction = useRef(null);
  const [destinations, setDestinations] = useState([]);
  const [oauth, setOauth] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [discovery, setDiscovery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showLinkedinConnectInfo, setShowLinkedinConnectInfo] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch(`/api/social/${provider}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Unable to load ${copy.name}.`);
      setDestinations(result.destinations || []);
      setCanManage(Boolean(result.canManage));
      setOauth(result.oauth || null);
      setDiscovery(
        (result.connections || [])
          .filter((connection) => connection.discoveryStatus && !(connection.instagramAccounts || []).length)
          .map((connection) => connection.discoveryStatus)
      );
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch, copy.name, notify, provider]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const status = searchParams.get(provider);
    if (!status || reportedStatus.current === status) return;
    reportedStatus.current = status;
    notify(status === "connected" ? `${copy.name} connected successfully.` : searchParams.get("message") || `${copy.name} connection failed.`);
    load();
  }, [copy.name, load, notify, provider, searchParams]);

  useEffect(() => {
    if (!showLinkedinConnectInfo) return undefined;
    const previousFocus = document.activeElement;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !connectInFlight.current) setShowLinkedinConnectInfo(false);
      if (event.key !== "Tab") return;
      const focusable = [...(connectDialog.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    connectDialogAction.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [showLinkedinConnectInfo]);

  const connect = async () => {
    if (connectInFlight.current) return;
    connectInFlight.current = true;
    setWorking(true);
    try {
      const response = await authFetch(`/api/social/${provider}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Unable to connect ${copy.name}.`);
      if (result.authorizationUrl) window.location.href = result.authorizationUrl;
    } catch (error) {
      notify(error.message);
    } finally {
      connectInFlight.current = false;
      setWorking(false);
    }
  };

  const requestConnect = () => {
    if (provider === "linkedin" && destinations.length > 0) {
      setShowLinkedinConnectInfo(true);
      return;
    }
    connect();
  };

  const disconnect = async () => {
    const target = confirmDisconnect;
    if (!target) return;
    setWorking(true);
    try {
      const response = await authFetch(`/api/social/connections/${target.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Unable to disconnect ${target.label}.`);
      window.dispatchEvent(new Event("creatora:social-connections-updated"));
      notify(`${target.label} disconnected.`);
      setConfirmDisconnect(null);
      await load();
    } catch (error) {
      notify(error.message);
    } finally {
      setWorking(false);
    }
  };

  return <article className="meta-connection-card">
    <div>
      <div className="social-connection-title">
        <SocialPlatformIcon platform={copy.icon} />
        <h3>{copy.name}</h3>
      </div>
      <p>{copy.description}</p>
      <span>{loading ? "Checking connections..." : destinations.length ? `${destinations.length} account${destinations.length === 1 ? "" : "s"} connected` : "Not connected"}</span>
      {!loading && !destinations.length && !canManage && <small>Ask an organization owner or admin to connect a {copy.name} account for this workspace.</small>}
      <div className="social-connection-list">
        {destinations.map((destination) => <div key={destination.id} className="social-connection-row">
          <div className="social-connection-account">
            {destination.thumbnail ? <img className="social-account-avatar" src={destination.thumbnail} alt="" /> : <SocialPlatformIcon platform={destination.platform} />}
            <span>
              <b>{destination.label}</b>
              <small>{ACCOUNT_TYPE_LABELS[destination.accountType] || destination.accountType}{destination.overLimit ? " · beyond your plan limit" : ""}</small>
            </span>
          </div>
          <span className="social-connection-state">{destination.connected ? "Connected" : "Needs attention"}</span>
          {canManage && <button className="button secondary small" type="button" onClick={() => setConfirmDisconnect(destination)} disabled={working}>Disconnect</button>}
        </div>)}
      </div>
      {discovery.length > 0 && <small className="input-error">Instagram discovery: {discovery.join(", ").replaceAll("_", " ").toLowerCase()}</small>}
      {!loading && oauth && !oauth.configured && <small>{copy.name} setup required. Add this exact redirect URI in the provider console: {oauth.redirectUri}</small>}
    </div>
    {canManage && <div className="connection-card-actions">
      <button className="button secondary" type="button" onClick={requestConnect} disabled={working}>{destinations.length ? `+ ${copy.connectLabel}` : `Connect ${copy.name}`}</button>
    </div>}
    {showLinkedinConnectInfo && <div className="asset-dialog-backdrop" onClick={() => { if (!working) setShowLinkedinConnectInfo(false); }}>
      <section
        ref={connectDialog}
        className="settings-card asset-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="linkedin-connect-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="campaign-output-head">
          <div><span>LinkedIn</span><h3 id="linkedin-connect-dialog-title">Connect another LinkedIn account</h3></div>
          <button type="button" aria-label="Close" onClick={() => setShowLinkedinConnectInfo(false)} disabled={working}>Ã—</button>
        </div>
        <p>LinkedIn may automatically use the account currently signed in to your browser.</p>
        <p>To connect a different LinkedIn profile, sign out of LinkedIn first or use a private/incognito browser window.</p>
        <div className="publish-dialog-footer">
          <button type="button" className="button secondary" onClick={() => setShowLinkedinConnectInfo(false)} disabled={working}>Cancel</button>
          <button ref={connectDialogAction} type="button" className="button" onClick={connect} disabled={working}>{working ? "Opening LinkedIn..." : "Continue to LinkedIn"}</button>
        </div>
      </section>
    </div>}
    {confirmDisconnect && <div className="asset-dialog-backdrop" onClick={() => setConfirmDisconnect(null)}>
      <section className="settings-card asset-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="campaign-output-head"><div><span>Disconnect account</span><h3>Disconnect {confirmDisconnect.label}?</h3></div><button type="button" onClick={() => setConfirmDisconnect(null)}>×</button></div>
        <p>Creatora AI will no longer be able to publish to this account from this workspace. Other {copy.name} accounts stay connected.</p>
        <div className="publish-dialog-footer">
          <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(null)}>Cancel</button>
          <button type="button" className="button" onClick={disconnect} disabled={working}>Disconnect</button>
        </div>
      </section>
    </div>}
  </article>;
}
