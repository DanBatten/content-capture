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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceType, setSelectedSourceType] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Sidebar - fixed on large screens */}
      <Sidebar
        filters={filters}
        selectedSourceType={selectedSourceType}
        selectedTopic={selectedTopic}
        onSourceTypeChange={(type) => {
          setSelectedSourceType(type);
          setIsSidebarOpen(false);
        }}
        onTopicChange={(topic) => {
          setSelectedTopic(topic);
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="lg:ml-72">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-neutral-50/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800">
          <div className="px-4 sm:px-6 py-3">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onMenuClick={() => setIsSidebarOpen(true)}
            />

            {/* Active filters */}
            {(selectedSourceType || selectedTopic) && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs text-neutral-500">Filtering by:</span>
                {selectedSourceType && (
                  <button
                    onClick={() => setSelectedSourceType(null)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
                  >
                    {selectedSourceType}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {selectedTopic && (
                  <button
                    onClick={() => setSelectedTopic(null)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
                  >
                    {selectedTopic}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="p-4 sm:p-6 pt-3">
          {/* Results count */}
          {!isLoading && (
            <p className="text-sm text-neutral-500 mb-3">
              {total} {total === 1 ? 'item' : 'items'}
              {searchQuery && ` matching "${searchQuery}"`}
            </p>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/3] bg-neutral-200 dark:bg-neutral-800 rounded-2xl animate-pulse"
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
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-neutral-500">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
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
