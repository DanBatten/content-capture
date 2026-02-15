'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { FolderIcon } from '@/components/FolderIcon';

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <span className="font-mono-ui text-sm text-[var(--foreground-muted)]">Loading...</span>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { user, userTier, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Handle checkout return and sync param
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const sync = searchParams.get('sync');

    if (checkout === 'success' || sync === 'true') {
      // Clear params from URL immediately to prevent reload loop
      window.history.replaceState({}, '', '/settings');

      if (checkout === 'success') {
        setSyncMessage('Payment successful! Your account is being upgraded...');
      }
      handleSync();
    }
  }, [searchParams]);

  // Load API keys
  useEffect(() => {
    loadApiKeys();
  }, []);

  async function loadApiKeys() {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch {
      // Silently fail - keys feature may not be deployed yet
    }
  }

  async function handleUpgrade(plan: 'basic' | 'pro' = 'pro') {
    setIsCheckoutLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setIsCheckoutLoading(false);
    }
  }

  async function handleManageBilling() {
    setIsPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Portal error:', error);
    } finally {
      setIsPortalLoading(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/subscription/sync', { method: 'POST' });
      const data = await res.json();
      setSyncMessage(`Subscription synced. Current tier: ${data.tier}`);
      // Reload page to refresh auth context
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setSyncMessage('Failed to sync subscription. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleGenerateKey() {
    if (!newKeyName.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (data.key) {
        setGeneratedKey(data.key);
        setNewKeyName('');
        loadApiKeys();
      }
    } catch (error) {
      console.error('Key generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    try {
      await fetch(`/api/keys?id=${keyId}`, { method: 'DELETE' });
      loadApiKeys();
    } catch (error) {
      console.error('Key revoke error:', error);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <span className="font-mono-ui text-sm text-[var(--foreground-muted)]">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--background)] border-b border-[var(--panel-border)]">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/archive" className="flex items-center gap-3 group">
                <div className="w-8 h-8 flex items-center justify-center">
                  <FolderIcon size="md" />
                </div>
                <span className="font-serif text-lg text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                  Archive
                </span>
              </Link>
              <span className="text-[var(--foreground-muted)]">/</span>
              <span className="font-mono-ui text-sm text-[var(--foreground)]">Settings</span>
            </div>
            <Link
              href="/archive"
              className="font-mono-ui text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              [ back to archive ]
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {/* Profile */}
        <section>
          <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
            Profile
          </h2>
          <div className="bg-[var(--panel-bg)] rounded-xl p-6 flex items-center gap-4">
            {user?.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-14 h-14 rounded-full"
              />
            )}
            <div>
              <p className="font-medium text-[var(--foreground)]">
                {user?.user_metadata?.full_name || user?.email || 'Unknown'}
              </p>
              <p className="text-sm text-[var(--foreground-muted)]">{user?.email}</p>
            </div>
          </div>
        </section>

        {/* Subscription */}
        <section>
          <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
            Subscription
          </h2>
          <div className="bg-[var(--panel-bg)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium text-[var(--foreground)]">
                  Current Plan:{' '}
                  <span className={userTier !== 'free' ? 'text-[var(--accent)]' : ''}>
                    {userTier === 'pro' ? 'Pro' : userTier === 'basic' ? 'Basic' : 'Free'}
                  </span>
                </p>
                <p className="text-sm text-[var(--foreground-muted)] mt-1">
                  {userTier === 'pro'
                    ? 'Full access to chat, deep research, and all features.'
                    : userTier === 'basic'
                    ? 'Save and search your archive. Upgrade to Pro for AI chat and research.'
                    : 'Upgrade for full archive access, AI chat, and more.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {userTier === 'pro' ? (
                <button
                  onClick={handleManageBilling}
                  disabled={isPortalLoading}
                  className="px-4 py-2 rounded-lg border border-[var(--panel-border)] font-mono-ui text-sm text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors disabled:opacity-50"
                >
                  {isPortalLoading ? 'Loading...' : 'Manage Billing'}
                </button>
              ) : userTier === 'basic' ? (
                <>
                  <button
                    onClick={() => handleUpgrade('pro')}
                    disabled={isCheckoutLoading}
                    className="px-4 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] font-mono-ui text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isCheckoutLoading ? 'Loading...' : 'Upgrade to Pro — $16/mo'}
                  </button>
                  <button
                    onClick={handleManageBilling}
                    disabled={isPortalLoading}
                    className="px-4 py-2 rounded-lg border border-[var(--panel-border)] font-mono-ui text-sm text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors disabled:opacity-50"
                  >
                    {isPortalLoading ? 'Loading...' : 'Manage Billing'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleUpgrade('basic')}
                    disabled={isCheckoutLoading}
                    className="px-4 py-2 rounded-lg border border-[var(--foreground)] font-mono-ui text-sm text-[var(--foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isCheckoutLoading ? 'Loading...' : 'Basic — $6/mo'}
                  </button>
                  <button
                    onClick={() => handleUpgrade('pro')}
                    disabled={isCheckoutLoading}
                    className="px-4 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] font-mono-ui text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isCheckoutLoading ? 'Loading...' : 'Pro — $16/mo'}
                  </button>
                </>
              )}

              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="px-4 py-2 rounded-lg border border-[var(--panel-border)] font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors disabled:opacity-50"
              >
                {isSyncing ? 'Syncing...' : 'Refresh Subscription'}
              </button>
            </div>

            {syncMessage && (
              <p className="mt-3 font-mono-ui text-xs text-[var(--accent)]">{syncMessage}</p>
            )}
          </div>
        </section>

        {/* API Keys */}
        <section>
          <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
            API Keys
          </h2>
          <div className="bg-[var(--panel-bg)] rounded-xl p-6 space-y-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              Generate API keys for the Chrome extension or third-party integrations.
            </p>

            {/* Generated key display */}
            {generatedKey && (
              <div className="bg-[var(--card-bg)] border border-[var(--accent)] rounded-lg p-4">
                <p className="font-mono-ui text-xs text-[var(--accent)] mb-2">
                  Copy this key now - it won&apos;t be shown again:
                </p>
                <code className="block font-mono text-sm text-[var(--foreground)] bg-[var(--background)] px-3 py-2 rounded break-all select-all">
                  {generatedKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedKey);
                    setGeneratedKey(null);
                  }}
                  className="mt-2 font-mono-ui text-xs text-[var(--accent)] hover:underline"
                >
                  Copy & dismiss
                </button>
              </div>
            )}

            {/* Generate new key */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g., Chrome Extension)"
                className="flex-1 bg-transparent border border-[var(--panel-border)] rounded-lg px-3 py-2 font-mono-ui text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none focus:border-[var(--foreground)] transition-colors"
              />
              <button
                onClick={handleGenerateKey}
                disabled={isGenerating || !newKeyName.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] font-mono-ui text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>

            {/* Key list */}
            {apiKeys.length > 0 && (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between bg-[var(--card-bg)] rounded-lg px-4 py-3"
                  >
                    <div>
                      <p className="font-mono-ui text-sm text-[var(--foreground)]">{key.name}</p>
                      <p className="font-mono text-xs text-[var(--foreground-muted)]">
                        {key.key_prefix}... &middot; {key.scopes.join(', ')} &middot;{' '}
                        {key.last_used_at
                          ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}`
                          : 'Never used'}
                      </p>
                    </div>
                    {!key.revoked_at && (
                      <button
                        onClick={() => handleRevokeKey(key.id)}
                        className="font-mono-ui text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                    {key.revoked_at && (
                      <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
                        Revoked
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
