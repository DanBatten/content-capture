'use client';

interface UpgradePromptProps {
  context?: 'chat' | 'item_chat';
}

export function UpgradePrompt({ context = 'chat' }: UpgradePromptProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h3 className="font-serif text-lg text-[var(--foreground)] mb-2">
        {context === 'item_chat'
          ? 'Unlock conversations with your content'
          : 'Unlock your knowledge base'}
      </h3>
      <p className="text-sm text-[var(--foreground-muted)] max-w-xs mb-6">
        {context === 'item_chat'
          ? 'Ask questions about this article, get summaries, and explore connections with Pro.'
          : 'Chat with your archive, get AI-powered insights, and run deep research with Pro.'}
      </p>
      <a
        href="/settings"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--foreground)] text-[var(--background)] rounded-lg font-mono-ui text-sm hover:opacity-90 transition-opacity"
      >
        Upgrade to Pro
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </a>
    </div>
  );
}
