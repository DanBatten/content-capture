'use client';

import type { FiltersData } from '@/types/content';

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

const sourceTypeIcons: Record<string, string> = {
  twitter: '𝕏',
  instagram: '📷',
  linkedin: '💼',
  pinterest: '📌',
  web: '🌐',
};

export function Sidebar({
  filters,
  selectedSourceType,
  selectedTopic,
  onSourceTypeChange,
  onTopicChange,
  isOpen,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-72 bg-white dark:bg-neutral-900
          border-r border-neutral-200 dark:border-neutral-800
          z-40
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          overflow-y-auto
        `}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Archive</h1>
            <button
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Stats */}
          {filters && (
            <div className="mb-8 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl">
              <p className="text-3xl font-bold text-neutral-900 dark:text-white">
                {filters.totalItems}
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">items in archive</p>
            </div>
          )}

          {/* Source Types */}
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
              Sources
            </h2>
            <div className="space-y-1">
              <button
                onClick={() => onSourceTypeChange(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedSourceType === null
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <span>All sources</span>
                <span className="text-xs opacity-60">{filters?.totalItems || 0}</span>
              </button>
              {filters?.sourceTypes.map(({ name, count }) => (
                <button
                  key={name}
                  onClick={() => onSourceTypeChange(name)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedSourceType === name
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{sourceTypeIcons[name] || '🔗'}</span>
                    <span>{sourceTypeLabels[name] || name}</span>
                  </span>
                  <span className="text-xs opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Topics */}
          {filters?.topics && filters.topics.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
                Topics
              </h2>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                <button
                  onClick={() => onTopicChange(null)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTopic === null
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span>All topics</span>
                </button>
                {filters.topics.slice(0, 15).map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => onTopicChange(name)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedTopic === name
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    <span className="text-xs opacity-60 ml-2">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Disciplines */}
          {filters?.disciplines && filters.disciplines.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
                Disciplines
              </h2>
              <div className="flex flex-wrap gap-2">
                {filters.disciplines.slice(0, 10).map(({ name, count }) => (
                  <span
                    key={name}
                    className="px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs rounded-full"
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
