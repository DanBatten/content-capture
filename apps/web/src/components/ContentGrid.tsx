'use client';

import { ContentCard } from './ContentCard';
import type { ContentItem } from '@/types/content';

interface ContentGridProps {
  items: ContentItem[];
  onItemClick?: (item: ContentItem) => void;
}

export function ContentGrid({ items, onItemClick }: ContentGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-1">No content yet</h3>
        <p className="text-neutral-500 dark:text-neutral-400">Start saving links to build your archive</p>
      </div>
    );
  }

  // Determine card sizes for mixed layout
  // First item is large, then alternate patterns
  const getCardSize = (index: number): 'large' | 'medium' | 'small' => {
    if (index === 0) return 'large';
    if (index % 7 === 0) return 'large'; // Every 7th is large
    if (index % 5 === 0) return 'medium';
    return 'medium';
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-auto">
      {items.map((item, index) => (
        <ContentCard
          key={item.id}
          item={item}
          size={getCardSize(index)}
          onClick={() => onItemClick?.(item)}
        />
      ))}
    </div>
  );
}
