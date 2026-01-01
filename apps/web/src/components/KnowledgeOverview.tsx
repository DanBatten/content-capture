'use client';

interface KnowledgeOverviewProps {
  topic: string;
  overview: string | null;
  suggestedPrompts: string[];
  isLoading: boolean;
  onPromptClick: (prompt: string) => void;
  onRegenerateClick: () => void;
}

export function KnowledgeOverview({
  topic,
  overview,
  suggestedPrompts,
  isLoading,
  onPromptClick,
  onRegenerateClick,
}: KnowledgeOverviewProps) {
  if (isLoading) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl p-6 animate-pulse">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="font-mono-ui text-sm text-[var(--foreground-muted)]">
            Generating overview for {topic}...
          </span>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-[var(--panel-border)] rounded w-3/4" />
          <div className="h-4 bg-[var(--panel-border)] rounded w-full" />
          <div className="h-4 bg-[var(--panel-border)] rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl p-6 text-center">
        <p className="text-[var(--foreground-muted)] font-mono-ui text-sm mb-4">
          No overview generated yet for this topic.
        </p>
        <button
          onClick={onRegenerateClick}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-mono-ui text-sm hover:opacity-90 transition-opacity"
        >
          Generate Overview
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] rounded-xl p-6">
      {/* Overview text */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)]">
            AI Overview
          </h3>
          <button
            onClick={onRegenerateClick}
            className="font-mono-ui text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            [ regenerate ]
          </button>
        </div>
        <p className="text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
          {overview}
        </p>
      </div>

      {/* Suggested prompts */}
      {suggestedPrompts.length > 0 && (
        <div>
          <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">
            Explore Further
          </h3>
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => onPromptClick(prompt)}
                className="px-3 py-2 border border-[var(--panel-border)] rounded-lg font-mono-ui text-sm text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
