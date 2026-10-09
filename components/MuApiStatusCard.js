'use client';

import { useState, useEffect } from 'react';
import ConnectMuApiModal from './ConnectMuApiModal';
import { useAuth } from './AuthProvider';

export default function MuApiStatusCard({ authFetch }) {
  const { organization } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await authFetch('/api/integrations/muapi', { cache: 'no-store' });
      const result = await response.json();
      if (response.ok) {
        setStatus(result);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setStatus(null);
    setLoading(true);
    setShowConnect(false);
    fetchStatus();
  }, [organization?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const handleConnected = () => {
    setShowConnect(false);
    fetchStatus();
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect MuAPI?\n\nAI generation will be unavailable until you connect MuAPI again.')) return;
    try {
      await authFetch('/api/integrations/muapi/disconnect', { method: 'POST' });
      setStatus({ connected: false, keyLastFour: null, balance: null, lastSynced: null });
    } catch {
      // Silently fail
    }
  };

  if (loading) {
    return (
      <div className="muapi-status-card">
        <div className="muapi-status-header">
          <span>✦ AI Generation</span>
        </div>
        <div className="muapi-status-loading">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="muapi-status-card">
        <div className="muapi-status-header">
          <span>✦ AI Generation</span>
        </div>

        {status?.connected ? (
          <div className="muapi-status-connected">
            <div className="muapi-status-row">
              <span className="muapi-label">MuAPI</span>
              <span className="muapi-status-badge connected">
                <span className="muapi-dot" />
                Connected
              </span>
            </div>

            {status.canManage && status.keyLastFour && (
              <div className="muapi-status-row">
                <span className="muapi-label">API Key</span>
                <span className="muapi-key-last4">••••••••{status.keyLastFour}</span>
              </div>
            )}

            {status.balance != null && (
              <div className="muapi-status-row">
                <span className="muapi-label">Available Balance</span>
                <span className="muapi-balance">${status.balance.toFixed(2)}</span>
              </div>
            )}

            {status.lastSynced && (
              <div className="muapi-status-row">
                <span className="muapi-label">Last Synced</span>
                <span className="muapi-synced">
                  {new Date(status.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            <div className="muapi-status-actions">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="muapi-btn secondary"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              {status.canManage && <button type="button" onClick={() => setShowConnect(true)} className="muapi-btn secondary">Manage MuAPI</button>}
            </div>
            {!status.canManage && <p className="muapi-description">Connected by your organization. AI generation is available.</p>}
          </div>
        ) : (
          <div className="muapi-status-unconnected">
            <div className="muapi-status-row">
              <span className="muapi-label">MuAPI</span>
              <span className="muapi-status-badge unconnected">
                <span className="muapi-dot" />
                Not Connected
              </span>
            </div>

            <p className="muapi-description">{status?.canManage ? 'Connect MuAPI to create images, videos, audio and campaigns.' : 'MuAPI is not connected for this organization. Ask an organization owner or admin to connect MuAPI.'}</p>
            {status?.canManage && <button type="button" onClick={() => setShowConnect(true)} className="muapi-btn primary">Connect MuAPI</button>}
          </div>
        )}
      </div>

      {showConnect && status?.canManage && (
        <ConnectMuApiModal
          onClose={() => setShowConnect(false)}
          onConnected={handleConnected}
          initialStatus={status}
          authFetch={authFetch}
          organizationName={organization?.accountType === 'ORGANIZATION' ? organization.name : null}
        />
      )}
    </>
  );
}
