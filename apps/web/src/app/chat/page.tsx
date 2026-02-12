'use client';

import Link from 'next/link';
import { ChatInterface } from '@/components/ChatInterface';
import { FolderIcon } from '@/components/FolderIcon';
import { useAuth } from '@/components/AuthProvider';

export default function ChatPage() {
  const { userTier } = useAuth();
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--background)] border-b border-[var(--panel-border)]">
        <div className="max-w-4xl mx-auto px-6 py-4">
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
              <span className="font-mono-ui text-sm text-[var(--foreground)]">Chat</span>
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

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-[var(--foreground)] mb-2">
            Knowledge Base Chat
          </h1>
          <p className="font-mono-ui text-sm text-[var(--foreground-muted)]">
            Ask questions about your saved content. I&apos;ll search through your archive and
            provide answers with sources.
          </p>
        </div>

        <ChatInterface userTier={userTier} />
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--panel-border)] mt-12">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <p className="font-mono-ui text-xs text-[var(--foreground-muted)] text-center">
            Powered by semantic search and Claude AI
          </p>
        </div>
      </footer>
    </div>
  );
}
