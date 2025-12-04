'use client';

import { useState } from 'react';
import type { FiltersData } from '@/types/content';
import { getTopicColor } from './ContentCard';

interface SidebarProps {
  filters: FiltersData | null;
  selectedSourceType: string | null;
  selectedTopic: string | null;
  onSourceTypeChange: (type: string | null) => void;
  onTopicChange: (topic: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
}

const sourceTypeLabels: Record<string, string> = {
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  web: 'Web',
};

const INITIAL_TOPICS_COUNT = 5;

export function Sidebar({
  filters,
  selectedSourceType,
  selectedTopic,
  onSourceTypeChange,
  onTopicChange,
  isOpen,
  onClose,
}: SidebarProps) {
  const [showAllTopics, setShowAllTopics] = useState(false);
  
  const topicsToShow = showAllTopics 
    ? filters?.topics 
    : filters?.topics?.slice(0, INITIAL_TOPICS_COUNT);
  
  const hasMoreTopics = (filters?.topics?.length || 0) > INITIAL_TOPICS_COUNT;
  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`
          fixed inset-0 bg-[#1a1a1a]/30 z-40
          transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
      />

      {/* Slide-in Panel */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-80
          bg-[var(--panel-bg)] panel-backdrop
          border-r border-[var(--panel-border)]
          z-50
          transition-panel
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          overflow-y-auto
        `}
      >
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <h1 className="font-mono-ui text-sm uppercase tracking-widest text-[var(--foreground-muted)]">
              Filters
            </h1>
            <button
              onClick={onClose}
              className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              [ close ]
            </button>
          </div>

          {/* Stats */}
          {filters && (
            <div className="mb-10 pb-8 border-b border-[var(--panel-border)]">
              <p className="font-mono-ui text-4xl font-light text-[var(--foreground)]">
                {filters.totalItems}
              </p>
              <p className="font-mono-ui text-xs uppercase tracking-wider text-[var(--foreground-muted)] mt-1">
                items in archive
              </p>
            </div>
          )}

          {/* Source Types */}
          <div className="mb-10">
            <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
              Sources
            </h2>
            <div className="space-y-1">
              <button
                onClick={() => {
                  onSourceTypeChange(null);
                  onClose();
                }}
                className={`
                  w-full flex items-center justify-between py-2 font-mono-ui text-sm transition-colors
                  ${selectedSourceType === null
                    ? 'text-[var(--foreground)]'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  <span className="opacity-50">{selectedSourceType === null ? '[+]' : '[ ]'}</span>
                  <span>All sources</span>
                </span>
                <span className="text-xs opacity-60">{filters?.totalItems || 0}</span>
              </button>
              {filters?.sourceTypes.map(({ name, count }) => (
                <button
                  key={name}
                  onClick={() => {
                    onSourceTypeChange(name);
                    onClose();
                  }}
                  className={`
                    w-full flex items-center justify-between py-2 font-mono-ui text-sm transition-colors
                    ${selectedSourceType === name
                      ? 'text-[var(--foreground)]'
                      : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                    }
                  `}
                >
                  <span className="flex items-center gap-2">
                    <span className="opacity-50">{selectedSourceType === name ? '[+]' : '[ ]'}</span>
                    <span>{sourceTypeLabels[name] || name}</span>
                  </span>
                  <span className="text-xs opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Topics */}
          {filters?.topics && filters.topics.length > 0 && (
            <div className="mb-10">
              <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
                Topics
              </h2>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    onTopicChange(null);
                    onClose();
                  }}
                  className={`
                    w-full flex items-center justify-between py-2 font-mono-ui text-sm transition-colors
                    ${selectedTopic === null
                      ? 'text-[var(--foreground)]'
                      : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                    }
                  `}
                >
                  <span className="flex items-center gap-2">
                    <span className="opacity-50">{selectedTopic === null ? '[+]' : '[ ]'}</span>
                    <span>All topics</span>
                  </span>
                </button>
                {topicsToShow?.map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => {
                      onTopicChange(name);
                      onClose();
                    }}
                    className={`
                      w-full flex items-center justify-between py-2 font-mono-ui text-sm transition-colors
                      ${selectedTopic === name
                        ? 'text-[var(--foreground)]'
                        : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                      }
                    `}
                  >
                    <span className="flex items-center gap-2">
                      <span className="opacity-50">{selectedTopic === name ? '[+]' : '[ ]'}</span>
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="text-xs opacity-60 ml-2">{count}</span>
                  </button>
                ))}
                {hasMoreTopics && (
                  <button
                    onClick={() => setShowAllTopics(!showAllTopics)}
                    className="w-full py-2 font-mono-ui text-xs text-[var(--accent-dark)] hover:text-[var(--foreground)] transition-colors text-left"
                  >
                    {showAllTopics 
                      ? `[ show less ]` 
                      : `[ show ${(filters?.topics?.length || 0) - INITIAL_TOPICS_COUNT} more ]`
                    }
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Disciplines as tags */}
          {filters?.disciplines && filters.disciplines.length > 0 && (
            <div>
              <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
                Disciplines
              </h2>
              <div className="flex flex-wrap gap-2">
                {filters.disciplines.slice(0, 10).map(({ name }) => (
                  <span
                    key={name}
                    className={`px-3 py-1.5 font-mono-ui text-xs ${getTopicColor(name)}`}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
