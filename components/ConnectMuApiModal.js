'use client';

import { useState } from 'react';

export default function ConnectMuApiModal({ onClose, onConnected, initialStatus, organizationName, locale = 'en', authFetch = fetch }) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isConnected = initialStatus?.connected ?? false;

  if (initialStatus?.canManage === false) return null;

  const handleConnect = async () => {
    if (connecting) return;
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError('Enter your MuAPI API key.');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const response = await authFetch('/api/integrations/muapi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Unable to connect MuAPI.');
        setConnecting(false);
        return;
      }
      setApiKey('');
      window.dispatchEvent(new CustomEvent('creatora:muapi-connection-updated', { detail: { connected: true } }));
      onConnected?.(result);
    } catch {
      setError('Unable to connect MuAPI. Check your API key and try again.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const response = await authFetch('/api/integrations/muapi/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to disconnect MuAPI.');
      window.dispatchEvent(new CustomEvent('creatora:muapi-connection-updated', { detail: { connected: false } }));
      onConnected?.({ connected: false });
    } catch {
      // Silently fail
    }
    setDisconnecting(false);
  };

  // If already connected, show management view
  if (isConnected && step !== 2) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto px-4 py-4 sm:py-8 font-inter animate-fade-in-up">
        <div role="dialog" aria-modal="true" aria-labelledby="muapi-dialog-title" className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="flex flex-col items-center text-center mb-8">
            <div className="createora-sparkle createora-sparkle--idle mb-4" aria-hidden="true">
              <span style={{ fontSize: '48px', lineHeight: 1, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #ff5a36, #ff704d, #c7462a, #ff8a5c)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 10px rgba(255, 90, 54, 0.35))' }}>✦</span>
            </div>
            <h1 id="muapi-dialog-title" className="text-xl font-bold text-white tracking-tight mb-2">
              Manage MuAPI
            </h1>
            <p className="text-white/40 text-[13px] leading-relaxed">
              {organizationName ? `${organizationName}'s MuAPI connection is active.` : 'Your MuAPI connection is active.'}
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-white/50">Status</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/15 text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Connected
                </span>
              </div>

              {initialStatus?.keyLastFour && (
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-white/50">API Key</span>
                  <span className="text-sm text-white/70 font-mono">••••••••{initialStatus.keyLastFour}</span>
                </div>
              )}

              {initialStatus?.balance != null && (
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-white/50">Available Balance</span>
                  <span className="text-sm font-bold text-green-400">${initialStatus.balance.toFixed(2)}</span>
                </div>
              )}

              {initialStatus?.lastSynced && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Last Synced</span>
                  <span className="text-xs text-white/40">
                    {new Date(initialStatus.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full bg-white/10 text-white font-medium py-2.5 rounded-lg hover:bg-white/15 transition-all"
            >
              Replace API Key
            </button>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full bg-red-500/10 text-red-400 font-medium py-2.5 rounded-lg hover:bg-red-500/20 transition-all border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect MuAPI'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full text-white/40 hover:text-white/60 text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // New connection flow
  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto px-4 py-4 sm:py-8 font-inter animate-fade-in-up">
      <div role="dialog" aria-modal="true" aria-labelledby="muapi-dialog-title" className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col items-center text-center mb-8">
          <div className="createora-sparkle createora-sparkle--idle mb-4" aria-hidden="true">
            <span style={{ fontSize: '48px', lineHeight: 1, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #ff5a36, #ff704d, #c7462a, #ff8a5c)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 10px rgba(255, 90, 54, 0.35))' }}>✦</span>
          </div>
          <h1 id="muapi-dialog-title" className="text-xl font-bold text-white tracking-tight mb-2">
            {organizationName ? `Connect MuAPI for ${organizationName}` : 'Connect MuAPI'}
          </h1>
          <p className="text-white/40 text-[13px] leading-relaxed">
            {organizationName ? 'This MuAPI account will be used for AI generation inside this organization. Members can generate without seeing the API key.' : 'Use your own MuAPI account for AI generation.'}
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-white mb-2">Step 1</h3>
                <p className="text-white/50 text-xs leading-relaxed mb-3">
                  Create or sign in to your MuAPI account.
                </p>
                <a
                  href="https://muapi.ai/access-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Open MuAPI
                </a>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-white mb-2">Step 2</h3>
                <p className="text-white/50 text-xs leading-relaxed">
                  Create or copy your API key from your MuAPI account.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-white mb-2">Step 3</h3>
                <p className="text-white/50 text-xs leading-relaxed">
                  Return to CreateoraAI and enter your API key below.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full bg-[#ff5a36] text-white font-medium py-2.5 rounded-lg hover:bg-[#ff704d] transition-all shadow-lg shadow-[#ff5a36]/20"
            >
              I have my API key
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-white/50 ml-1">
                MuAPI API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setError(''); }}
                  placeholder="Enter your MuAPI API key"
                  className="w-full bg-white/5 border border-white/[0.08] rounded-lg px-4 py-3 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#ff5a36]/40 focus:bg-white/[0.07] transition-all"
                  suppressHydrationWarning
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              {error && <p className="mt-2 text-red-500/80 text-[14px] font-medium ml-1">{error}</p>}
            </div>

            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="w-full bg-[#ff5a36] text-white font-medium py-2.5 rounded-lg hover:bg-[#ff704d] transition-all shadow-lg shadow-[#ff5a36]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? isConnected ? 'Validating...' : 'Connecting...' : isConnected ? 'Replace Key' : 'Connect MuAPI'}
            </button>

            <p className="text-center text-[12px] text-white/30">
              Your MuAPI account is charged directly for AI generation.
            </p>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-white/40 hover:text-white/60 text-sm transition-colors"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
