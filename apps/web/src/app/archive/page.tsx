'use client';

import { useState, useEffect, useCallback } from 'react';
import { ContentGrid } from '@/components/ContentGrid';
import { Sidebar } from '@/components/Sidebar';
import { ContentModal } from '@/components/ContentModal';
import { SearchBar } from '@/components/SearchBar';
import type { ContentItem, FiltersData, ItemsResponse } from '@/types/content';

export default function ArchivePage() {
  // State
  const [items, setItems] = useState<ContentItem[]>([]);
  const [filters, setFilters] = useState<FiltersData | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Collapsed by default

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceType, setSelectedSourceType] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Check if any filters are active
  const hasActiveFilters = selectedSourceType !== null || selectedTopic !== null;

  // Fetch filters
  useEffect(() => {
    async function fetchFilters() {
      try {
        const res = await fetch('/api/filters');
        const data = await res.json();
        setFilters(data);
      } catch (error) {
        console.error('Failed to fetch filters:', error);
      }
    }
    fetchFilters();
  }, []);

  // Fetch items
  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '24',
      });

      if (selectedSourceType) params.set('source_type', selectedSourceType);
      if (selectedTopic) params.set('topic', selectedTopic);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/items?${params}`);
      const data: ItemsResponse = await res.json();

      setItems(data.items);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedSourceType, selectedTopic, searchQuery]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedSourceType, selectedTopic, searchQuery]);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedSearch !== searchQuery) return;
    fetchItems();
  }, [debouncedSearch]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Slide-in Sidebar */}
      <Sidebar
        filters={filters}
        selectedSourceType={selectedSourceType}
        selectedTopic={selectedTopic}
        onSourceTypeChange={setSelectedSourceType}
        onTopicChange={setSelectedTopic}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main content - full width */}
      <main className="w-full">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[var(--background)]/90 panel-backdrop border-b border-[var(--panel-border)]">
          <div className="px-6 sm:px-8 lg:px-12 py-4">
            {/* Top row with branding and search */}
            <div className="flex items-center justify-between gap-8">
              {/* Brand */}
              <div className="flex items-center gap-4">
                <h1 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)]">
                  Archive
                </h1>
              </div>

              {/* Search and filters */}
              <div className="flex-1 max-w-2xl">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onFilterClick={() => setIsSidebarOpen(true)}
                  hasActiveFilters={hasActiveFilters}
                />
              </div>

              {/* Right side stats */}
              <div className="hidden sm:flex items-center gap-6 text-[var(--foreground-muted)]">
                <span className="font-mono-ui text-sm">
                  {total} items
                </span>
              </div>
            </div>

            {/* Active filters row */}
            {hasActiveFilters && (
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[var(--panel-border)]">
                <span className="font-mono-ui text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                  Active:
                </span>
                {selectedSourceType && (
                  <button
                    onClick={() => setSelectedSourceType(null)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--card-bg)] text-[var(--foreground)] font-mono-ui text-xs hover:bg-[var(--card-hover)] transition-colors"
                  >
                    {selectedSourceType}
                    <span className="opacity-50">×</span>
                  </button>
                )}
                {selectedTopic && (
                  <button
                    onClick={() => setSelectedTopic(null)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--card-bg)] text-[var(--foreground)] font-mono-ui text-xs hover:bg-[var(--card-hover)] transition-colors"
                  >
                    {selectedTopic}
                    <span className="opacity-50">×</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedSourceType(null);
                    setSelectedTopic(null);
                  }}
                  className="font-mono-ui text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors ml-auto"
                >
                  [ clear all ]
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="px-6 sm:px-8 lg:px-12 py-8">
          {/* Results info */}
          {!isLoading && searchQuery && (
            <p className="font-mono-ui text-sm text-[var(--foreground-muted)] mb-6">
              {total} {total === 1 ? 'result' : 'results'} for "{searchQuery}"
            </p>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/3] bg-[var(--card-bg)] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              <ContentGrid
                items={items}
                onItemClick={setSelectedItem}
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-12 pt-8 border-t border-[var(--panel-border)]">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    [ prev ]
                  </button>
                  <span className="font-mono-ui text-sm text-[var(--foreground-muted)]">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    [ next ]
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Detail modal */}
      <ContentModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
