"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultWorkspace,
  getWorkspace,
  markNotificationsRead,
} from "@/lib/workspaceStore";
import { fetchMuApiBalance, getBalanceScopeKey, invalidateMuApiBalance } from "@/lib/balanceClient";
import { useAuth } from "@/components/AuthProvider";
import BrandLogo from "@/components/BrandLogo";

const groups = [
  [
    "Workspace",
    [
      ["dashboard", "Overview", "feature-workspace.png"],
      ["create", "Create", "flow-idea.png"],
      ["projects", "Projects", "feature-projects.png"],
      ["assets", "Asset library", "feature-creation.png"],
    ],
  ],
  [
    "Studios",
    [
      ["voice-video", "Voice to video", "feature-voice.png"],
      ["image", "Image studio", "flow-image.png"],
      ["video", "Video studio", "flow-preview.png"],
      ["ads", "Ad creator", "feature-creation.png"],
      ["campaign", "Campaign agent", "feature-workspace.png"],
      ["templates", "Templates", "feature-brand.png"],
    ],
  ],
  [
    "Manage",
    [
      ["brand-kit", "Brand kit", "feature-brand.png"],
      ["team", "Team", "feature-avatars.png"],
      ["credits", "Plan & Billing", "feature-byok.png"],
      ["settings", "Settings", "feature-workspace.png"],
    ],
  ],
];

export default function ProductShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const section = pathname.split("/")[2] || "dashboard";
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const drawerId = "product-shell-drawer";
  const { loading, user, organization, logout, authFetch } = useAuth();
  const balanceScopeKey = getBalanceScopeKey(authFetch);
  const currentBalanceScope = useRef(balanceScopeKey);
  currentBalanceScope.current = balanceScopeKey;
  const [currentPlanName, setCurrentPlanName] = useState("");
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  const initials = `${firstName.slice(0, 1)}${lastName.slice(0, 1)}` || "?";
  const displayName = `${firstName} ${lastName}`.trim() || user?.email || (loading ? "Loading account" : "Account");
  const [muapiBalance, setMuapiBalance] = useState(null);
  const refreshBalance = useCallback(() => {
    const requestedScope = balanceScopeKey;
    fetchMuApiBalance(authFetch).then((value) => {
      if (currentBalanceScope.current === requestedScope) setMuapiBalance(value);
    }).catch(() => {});
  }, [authFetch, balanceScopeKey]);
  useEffect(() => {
    if (!user) return undefined;
    invalidateMuApiBalance(balanceScopeKey);
    setMuapiBalance(null);
    refreshBalance();
    const onBalance = (event) => {
      if (event?.detail?.scopeKey !== balanceScopeKey) return;
      const next = event?.detail?.balance;
      if (next != null) setMuapiBalance(next);
      else refreshBalance();
    };
    window.addEventListener("creatora:muapi-balance", onBalance);
    window.addEventListener("creatora:workspace-updated", refreshBalance);
    return () => {
      window.removeEventListener("creatora:muapi-balance", onBalance);
      window.removeEventListener("creatora:workspace-updated", refreshBalance);
    };
  }, [user?.id, organization?.id, balanceScopeKey]);
  useEffect(() => {
    if (!user) { setCurrentPlanName(""); return undefined; }
    let active = true;
    const refreshPlan = async () => {
      try {
        const response = await authFetch("/api/billing/subscription", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (active) setCurrentPlanName(result.effectivePlan?.name || "");
      } catch {}
    };
    refreshPlan();
    window.addEventListener("creatora:billing-updated", refreshPlan);
    return () => {
      active = false;
      window.removeEventListener("creatora:billing-updated", refreshPlan);
    };
  }, [authFetch, user?.id, organization?.id]);
  useEffect(() => {
    const refresh = () => setWorkspace(getWorkspace());
    refresh();
    window.addEventListener("creatora:workspace-updated", refresh);
    return () =>
      window.removeEventListener("creatora:workspace-updated", refresh);
  }, []);
  const search = (event) => {
    event.preventDefault();
    if (query.trim())
      router.push(`/dashboard/projects?q=${encodeURIComponent(query.trim())}`);
  };
  const unread = (workspace.notifications || []).filter(
    (item) => !item.read,
  ).length;
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        if (profileDropdownOpen) return setProfileDropdownOpen(false);
        if (menuOpen) setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen, profileDropdownOpen]);

  return (
    <div className={`app-shell${menuOpen ? " menu-open" : ""}`}>
      {menuOpen && <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className="sidebar" id={drawerId} role="dialog" aria-modal="true" aria-label="Navigation">
        <div className="sidebar-header">
          <Link href="/" className="brand" onClick={() => setMenuOpen(false)}>
            <BrandLogo priority />
          </Link>
          <button type="button" className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button>
        </div>
        <div className="workspace-switch">
          <span className="avatar tiny">{initials}</span>
          <div>
            <b>{organization?.accountType === 'ORGANIZATION' ? organization.name : 'Personal Workspace'}</b>
            <small>{organization?.accountType === 'ORGANIZATION' ? 'Small Business and Brand' : workspace.workspace.type}</small>
            {currentPlanName && <small className="workspace-plan">{currentPlanName} plan</small>}
          </div>
        </div>
        <nav className="custom-scrollbar">
          {groups.map(([label, links]) => (
            <div className="nav-group" key={label}>
              <label>{label}</label>
              {links
                .filter(([id]) => !["brand-kit", "team"].includes(id) || organization?.accountType === "ORGANIZATION")
                .map(([id, name, icon]) => (
                <Link
                  key={id}
                  className={section === id ? "active" : ""}
                  href={id === "dashboard" ? "/dashboard" : `/dashboard/${id}`}
                  onClick={() => menuOpen && setMenuOpen(false)}
                >
                  <i><Image src={`/assets/icons/${icon}`} alt="" width={28} height={28} /></i>
                  {name}
                  {id === "create" && <em>NEW</em>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="credit-card">
          <div>
            <span>MuAPI</span>
            <b>{muapiBalance != null ? `✦ ${muapiBalance.toLocaleString()} Provider Credits` : "Not connected"}</b>
          </div>
          <Link href="/dashboard/settings">Manage →</Link>
        </div>
        <div className="profile">
          <span className="avatar">{initials}</span>
          <div>
            <b>{displayName}</b>
            <small>{user?.email || (loading ? "Loading..." : "Not signed in")}</small>
          </div>
          <div className="profile-dropdown">
            <button
              type="button"
              className="profile-dropdown-toggle"
              aria-label="Account menu"
              aria-haspopup="true"
              aria-expanded={profileDropdownOpen}
              aria-controls="profile-dropdown-menu"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div id="profile-dropdown-menu" className={`profile-dropdown-menu${profileDropdownOpen ? " open" : ""}`}>
              <button type="button" role="menuitem" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>
      <section className="app-main">
        <header>
          <button
            className="mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <Link href="/" className="mobile-brand" aria-label="Creatora AI home">
            <BrandLogo iconOnly />
          </Link>
          <div className="header-actions">
            <button
              type="button"
              onClick={() => router.push("/dashboard/settings")}
            >
              ?
            </button>
            <button
              type="button"
              className="notification-button"
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                if (!notificationsOpen) markNotificationsRead();
              }}
            >
              ♧{unread > 0 && <i />}
            </button>
            <span className="credits-pill">{muapiBalance != null ? `✦ ${muapiBalance.toLocaleString("en-IN")} Provider Credits` : "✦ Connect MuAPI"}</span>
           
          </div>
          {notificationsOpen && (
            <div className="notifications-panel">
              <div>
                <b>Notifications</b>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                >
                  ×
                </button>
              </div>
              {(workspace.notifications || []).slice(0, 5).map((item) => (
                <article key={item.id}>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                  <small>{item.createdAt}</small>
                </article>
              ))}
            </div>
          )}
        </header>
        {children}
      </section>
    </div>
  );
}
