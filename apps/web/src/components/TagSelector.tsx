'use client';

import { useState, useMemo } from 'react';

interface TagOption {
  name: string;
  count: number;
}

interface TagSelectorProps {
  availableTags: TagOption[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onCreateKnowledgeBase?: (name: string, tags: string[]) => void;
}

export function TagSelector({
  availableTags,
  selectedTags,
  onTagToggle,
  onCreateKnowledgeBase,
}: TagSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKbName, setNewKbName] = useState('');

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return availableTags;
    const query = searchQuery.toLowerCase();
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [availableTags, searchQuery]);

  const handleCreateKnowledgeBase = () => {
    if (newKbName.trim() && selectedTags.length > 0 && onCreateKnowledgeBase) {
      onCreateKnowledgeBase(newKbName.trim(), selectedTags);
      setNewKbName('');
      setShowCreateModal(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search topics..."
          className="w-full px-4 py-2 bg-transparent border border-[var(--panel-border)] rounded-lg font-mono-ui text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none focus:border-[var(--foreground)] transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className="px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg font-mono-ui text-xs flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              {tag}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ))}
          {onCreateKnowledgeBase && selectedTags.length > 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 border border-[var(--accent)] text-[var(--accent)] rounded-lg font-mono-ui text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              + Create Knowledge Base
            </button>
          )}
        </div>
      )}

      {/* Tag list */}
      <div className="flex flex-wrap gap-2">
        {filteredTags.map((tag) => {
          const isSelected = selectedTags.includes(tag.name);
          return (
            <button
              key={tag.name}
              onClick={() => onTagToggle(tag.name)}
              className={`px-3 py-1.5 rounded-lg font-mono-ui text-xs transition-colors ${
                isSelected
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--panel-border)] text-[var(--foreground-muted)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {tag.name}
              <span className={`ml-1.5 ${isSelected ? 'text-white/70' : 'opacity-50'}`}>
                {tag.count}
              </span>
            </button>
          );
        })}
        {filteredTags.length === 0 && (
          <p className="text-[var(--foreground-muted)] font-mono-ui text-sm">
            No topics found matching &ldquo;{searchQuery}&rdquo;
          </p>
        )}
      </div>

      {/* Create Knowledge Base Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-[var(--panel-bg)] rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="font-serif text-xl text-[var(--foreground)] mb-4">
              Create Knowledge Base
            </h3>
            <p className="text-[var(--foreground-muted)] font-mono-ui text-sm mb-4">
              Create a custom knowledge base from the selected topics:
              <br />
              <span className="text-[var(--accent)]">{selectedTags.join(', ')}</span>
            </p>
            <input
              type="text"
              value={newKbName}
              onChange={(e) => setNewKbName(e.target.value)}
              placeholder="Knowledge base name..."
              className="w-full px-4 py-2 bg-transparent border border-[var(--panel-border)] rounded-lg font-mono-ui text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none focus:border-[var(--foreground)] transition-colors mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKnowledgeBase}
                disabled={!newKbName.trim()}
                className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-mono-ui text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
