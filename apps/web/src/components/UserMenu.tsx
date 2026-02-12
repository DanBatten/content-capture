'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export function UserMenu() {
  const { user, userTier, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-7 h-7 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-mono-ui text-xs">
            {(displayName || '?')[0].toUpperCase()}
          </div>
        )}
        {userTier === 'pro' && (
          <span className="px-1.5 py-0.5 bg-[var(--accent)] text-white font-mono-ui text-[10px] uppercase tracking-wider">
            Pro
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-[var(--card-bg)] border border-[var(--panel-border)] shadow-lg z-50">
          <div className="px-4 py-3 border-b border-[var(--panel-border)]">
            <p className="font-mono-ui text-sm text-[var(--foreground)] truncate">
              {displayName}
            </p>
            <p className="font-mono-ui text-xs text-[var(--foreground-muted)] truncate">
              {user.email}
            </p>
          </div>
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 font-mono-ui text-sm text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors"
            >
              Settings
            </Link>
            <button
              onClick={() => {
                setIsOpen(false);
                signOut();
              }}
              className="block w-full text-left px-4 py-2 font-mono-ui text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
