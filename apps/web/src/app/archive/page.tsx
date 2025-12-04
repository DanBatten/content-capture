'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ContentGrid } from '@/components/ContentGrid';
import { Sidebar } from '@/components/Sidebar';
import { ContentModal } from '@/components/ContentModal';
import { SearchBar } from '@/components/SearchBar';
import { HeroHeader } from '@/components/HeroHeader';
import { FolderIcon } from '@/components/FolderIcon';
import type { ContentItem, FiltersData, ItemsResponse } from '@/types/content';

interface SearchIntent {
  keywords: string[];
  topics: string[];
  useCases: string[];
  sourceTypes: string[];
  contentTypes: string[];
  searchStrategy: 'broad' | 'focused' | 'exact';
}

interface SearchResponse extends ItemsResponse {
  intent?: SearchIntent;
}

const ITEMS_PER_PAGE = 24;

export default function ArchivePage() {
  // State
  const [items, setItems] = useState<ContentItem[]>([]);
  const [filters, setFilters] = useState<FiltersData | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchIntent, setSearchIntent] = useState<SearchIntent | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceType, setSelectedSourceType] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Infinite scroll
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [latestItemDate, setLatestItemDate] = useState<Date | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState('');

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

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500); // Slightly longer debounce for AI search
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch items - uses agentic search when there's a search query
  const fetchItems = useCallback(async (pageNum: number, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setSearchIntent(null);
    }

    try {
      // If we have a search query, use the agentic search endpoint
      if (debouncedSearch.trim()) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: debouncedSearch,
            page: pageNum,
            limit: ITEMS_PER_PAGE,
          }),
        });

        const data: SearchResponse = await res.json();

        if (append) {
          setItems(prev => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setTotal(data.total);
        setHasMore(data.items.length === ITEMS_PER_PAGE && items.length + data.items.length < data.total);
        if (data.intent) {
          setSearchIntent(data.intent);
        }
      } else {
        // No search query - use regular items endpoint with filters
        const params = new URLSearchParams({
          page: pageNum.toString(),
          limit: ITEMS_PER_PAGE.toString(),
        });

        if (selectedSourceType) params.set('source_type', selectedSourceType);
        if (selectedTopic) params.set('topic', selectedTopic);

        const res = await fetch(`/api/items?${params}`);
        const data: ItemsResponse = await res.json();

        if (append) {
          setItems(prev => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setTotal(data.total);
        setHasMore(data.items.length === ITEMS_PER_PAGE);
        
        // Set latest item date from first item (items are sorted newest first)
        if (pageNum === 1 && data.items.length > 0 && !selectedSourceType && !selectedTopic) {
          setLatestItemDate(new Date(data.items[0].created_at));
        }
      }
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [debouncedSearch, selectedSourceType, selectedTopic, items.length]);

  // Initial fetch
  useEffect(() => {
    fetchItems(1, false);
  }, [selectedSourceType, selectedTopic, debouncedSearch]);

  // Load more function
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchItems(nextPage, true);
    }
  }, [isLoadingMore, hasMore, page, fetchItems]);

  // Intersection observer for infinite scroll
  // threshold: 0.1 triggers when 10% of element is visible (reliable)
  // rootMargin: '0px' means no preloading - triggers only when element enters viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '0px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, loadMore]);

  // Reset when filters change
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
  }, [selectedSourceType, selectedTopic, debouncedSearch]);

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
            {/* Top row - Brand, Filter (mobile), Search (desktop) */}
            <div className="flex items-center justify-between gap-4 sm:gap-8">
              {/* Brand */}
              <div className="flex items-center gap-3">
                <span className="font-pixel text-lg tracking-tight text-[var(--foreground)]">
                  ARCHIVE
                </span>
                <FolderIcon size="sm" className="text-[var(--foreground)]" />
              </div>

              {/* Mobile: Filter button only */}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className={`
                  sm:hidden font-mono-ui text-sm transition-colors flex items-center gap-2
                  ${hasActiveFilters 
                    ? 'text-[var(--foreground)]' 
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }
                `}
              >
                <span>{hasActiveFilters ? '[+]' : '[ ]'}</span>
                <span>Filters</span>
                {hasActiveFilters && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                )}
              </button>

              {/* Desktop: Search and filters */}
              <div className="hidden sm:block flex-1 max-w-2xl">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onFilterClick={() => setIsSidebarOpen(true)}
                  hasActiveFilters={hasActiveFilters}
                  placeholder="Search with natural language..."
                />
              </div>

              {/* Right side stats - hidden until lg breakpoint to give search bar more room */}
              <div className="hidden lg:flex items-center gap-4 text-[var(--foreground-muted)]">
                <span className="font-mono-ui text-sm">
                  {total} items
                </span>
                {latestItemDate && (
                  <>
                    <span className="opacity-30">|</span>
                    <span className="font-mono-ui text-sm">
                      Last updated: {latestItemDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} {latestItemDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Mobile: Search bar on its own row */}
            <div className="sm:hidden mt-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="w-4 h-4 text-[var(--foreground-muted)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search with natural language..."
                  className="w-full pl-10 pr-4 py-2.5 bg-transparent text-[var(--foreground)] placeholder-[var(--foreground-muted)] font-mono-ui text-sm outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <span className="font-mono-ui text-xs">[ clear ]</span>
                  </button>
                )}
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

        {/* Hero Header - show when not searching */}
        <HeroHeader isVisible={!debouncedSearch && !hasActiveFilters} />

        {/* Content */}
        <div className="px-6 sm:px-8 lg:px-12 py-8">
          {/* Search results info with AI intent */}
          {!isLoading && debouncedSearch && (
            <div className="mb-6">
              <p className="font-mono-ui text-sm text-[var(--foreground-muted)]">
                {total} {total === 1 ? 'result' : 'results'} for "{debouncedSearch}"
              </p>
              {searchIntent && (searchIntent.topics.length > 0 || searchIntent.keywords.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="font-mono-ui text-xs text-[var(--foreground-muted)] opacity-60">
                    Searching:
                  </span>
                  {searchIntent.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="px-2 py-0.5 bg-[var(--card-bg)] text-[var(--foreground-muted)] font-mono-ui text-xs"
                    >
                      {keyword}
                    </span>
                  ))}
                  {searchIntent.topics.map((topic) => (
                    <span
                      key={topic}
                      className="px-2 py-0.5 bg-violet-500 text-white font-mono-ui text-xs"
                    >
                      {topic}
                    </span>
                  ))}
                  {searchIntent.useCases.map((useCase) => (
                    <span
                      key={useCase}
                      className="px-2 py-0.5 bg-blue-500 text-white font-mono-ui text-xs"
                    >
                      {useCase}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Initial loading state */}
          {isLoading && items.length === 0 ? (
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

              {/* Load more trigger / loading indicator */}
              <div ref={loadMoreRef} className="mt-12 pt-8 border-t border-[var(--panel-border)]">
                {isLoadingMore && (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-4 h-4 border-2 border-[var(--foreground-muted)] border-t-transparent rounded-full animate-spin" />
                    <span className="font-mono-ui text-sm text-[var(--foreground-muted)]">
                      Loading more...
                    </span>
                  </div>
                )}
                {!hasMore && items.length > 0 && (
                  <p className="text-center font-mono-ui text-sm text-[var(--foreground-muted)]">
                    End of archive · {total} items
                  </p>
                )}
              </div>
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
