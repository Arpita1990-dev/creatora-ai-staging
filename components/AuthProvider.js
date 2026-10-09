'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getWorkspace, updateWorkspace } from '@/lib/workspaceStore';

const AuthContext = createContext({ loading: true, user: null, authFetch: fetch, logout: async () => {} });

function tokenExpiresSoon(token, leewaySeconds = 30) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || payload.exp <= Math.floor(Date.now() / 1000) + leewaySeconds;
  } catch {
    return true;
  }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, organization: null, role: null });
  const accessToken = useRef(null);
  const refreshPromise = useRef(null);
  const redirectToLogin = () => {
    if (!window.location.pathname.startsWith('/dashboard')) return;
    window.location.replace(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
  };
  const refreshAccessToken = async () => {
    if (!refreshPromise.current) {
      const refresh = async () => {
        const response = await fetch('/api/auth/refresh', { method: 'POST', cache: 'no-store' });
        if (!response.ok) throw new Error('Your session has expired. Please sign in again.');
        const result = await response.json();
        if (!result.accessToken) throw new Error('The refreshed session did not include an access token.');
        accessToken.current = result.accessToken;
        return result.accessToken;
      };
      const operation = navigator.locks
        ? navigator.locks.request('creatora-auth-refresh', refresh)
        : refresh();
      refreshPromise.current = operation
        .catch((error) => {
          accessToken.current = null;
          redirectToLogin();
          throw error;
        })
        .finally(() => {
          refreshPromise.current = null;
        });
    }
    return refreshPromise.current;
  };
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) {
        if (response.status === 401 && window.location.pathname.startsWith('/dashboard')) {
          redirectToLogin();
        }
        return null;
      }
      return response.json();
    }).then((result) => {
      accessToken.current = result?.accessToken || null;
      setState({ loading: false, user: result?.user || null, organization: result?.organization || null, role: result?.role || null });
      if (result?.user) {
        const workspace = getWorkspace();
        updateWorkspace({
          profile: {
            ...workspace.profile,
            firstName: result.user.firstName || '',
            lastName: result.user.lastName || '',
            email: result.user.email,
          },
        });
      }
    }).catch(() => setState((current) => ({ ...current, loading: false })));
  }, []);
  const authFetch = async (input, init = {}, retried = false) => {
    if (!retried && tokenExpiresSoon(accessToken.current)) await refreshAccessToken();
    const request = () => fetch(input, { ...init, headers: { ...init.headers, ...(accessToken.current ? { Authorization: `Bearer ${accessToken.current}` } : {}) } });
    let response = await request();
    if (response.status === 401 && !retried) {
      await refreshAccessToken();
      response = await authFetch(input, init, true);
    }
    return response;
  };
  authFetch.balanceScopeKey = state.organization?.accountType === 'ORGANIZATION'
    ? `organization:${state.organization.id}`
    : state.user?.id ? `personal:${state.user.id}` : 'anonymous';
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); accessToken.current = null; window.sessionStorage.removeItem('creatora_active_campaign_id'); setState({ loading: false, user: null, organization: null, role: null }); window.location.assign('/login'); };
  return <AuthContext.Provider value={{ ...state, authFetch, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);