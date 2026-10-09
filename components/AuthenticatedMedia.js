"use client";

import { useEffect, useState } from "react";

// Thumbnails are rendered with plain <img>/<video> tags, which cannot send the
// Authorization header. Auth-gated URLs such as /api/project-assets/<id> always
// resolve to 401 in the browser, so the tag renders as a broken (white) box.
// Those URLs must be fetched with the authenticated helper and turned into a blob
// URL before they can be displayed, and any load failure must fall back to a
// placeholder instead of an empty white frame.
export const isAuthGatedUrl = (url) =>
  typeof url === "string" && url.length > 0 && url.startsWith("/api/");

export function useAuthenticatedMediaUrl(src, authFetch) {
  const requiresAuth = isAuthGatedUrl(src);
  const [resolved, setResolved] = useState(() =>
    src && !requiresAuth ? src : "",
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setResolved("");
      setFailed(false);
      return undefined;
    }
    if (!requiresAuth) {
      setResolved(src);
      setFailed(false);
      return undefined;
    }
    if (typeof authFetch !== "function") {
      setFailed(true);
      return undefined;
    }

    let active = true;
    let objectUrl;
    setResolved("");
    setFailed(false);

    authFetch(src, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load preview.");
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setResolved(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authFetch, requiresAuth, src]);

  return {
    url: resolved,
    failed,
    // Exposed so consumers can report a decode/network failure from onError.
    setFailed,
    pending: Boolean(src) && !resolved && !failed,
  };
}

export function AuthenticatedImage({
  src,
  alt = "",
  authFetch,
  fallback = null,
  loadingLabel = "Loading preview…",
  ...rest
}) {
  const { url, failed, pending, setFailed } = useAuthenticatedMediaUrl(
    src,
    authFetch,
  );
  if (!src || failed) return fallback;
  if (pending)
    return (
      <span className="collection-preview-state" role="status">
        {loadingLabel}
      </span>
    );
  return <img src={url} alt={alt} onError={() => setFailed(true)} {...rest} />;
}

export function AuthenticatedVideo({
  src,
  authFetch,
  fallback = null,
  loadingLabel = "Loading preview…",
  ...rest
}) {
  const { url, failed, pending, setFailed } = useAuthenticatedMediaUrl(
    src,
    authFetch,
  );
  if (!src || failed) return fallback;
  if (pending)
    return (
      <span className="collection-preview-state" role="status">
        {loadingLabel}
      </span>
    );
  return <video src={url} onError={() => setFailed(true)} {...rest} />;
}

// A plain <a href> to an auth-gated URL navigates to a 401 JSON response instead of
// downloading the file, because links cannot send the Authorization header either.
export function AuthenticatedDownloadLink({
  src,
  filename,
  authFetch,
  className = "button secondary",
  children = "Download",
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src) return null;

  const trigger = (href) => {
    const link = document.createElement("a");
    link.href = href;
    if (filename) link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const download = async () => {
    setFailed(false);
    if (!isAuthGatedUrl(src)) return trigger(src);
    let objectUrl;
    setBusy(true);
    try {
      const response = await authFetch(src, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load the file.");
      objectUrl = URL.createObjectURL(await response.blob());
      trigger(objectUrl);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={download} disabled={busy}>
        {busy ? "Preparing…" : children}
      </button>
      {failed && <small className="download-error">Download failed. Please try again.</small>}
    </>
  );
}

