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
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-[var(--card-bg)] flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-[var(--foreground-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-[var(--foreground)] mb-2">No content yet</h3>
        <p className="text-[var(--foreground-muted)] font-mono-ui text-sm">Start saving links to build your archive</p>
      </div>
    );
  }

  // Track which large card number we're on for alternating
  let largeCardCount = 0;

  // Determine card sizes and positions
  const getCardProps = (index: number): { size: 'large' | 'medium'; position: 'left' | 'right' | 'auto' } => {
    const isLarge = index === 0 || index % 7 === 0;
    
    if (isLarge) {
      largeCardCount++;
      // Alternate: odd large cards on left, even on right
      const position = largeCardCount % 2 === 1 ? 'left' : 'right';
      return { size: 'large', position };
    }
    
    return { size: 'medium', position: 'auto' };
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 auto-rows-auto grid-flow-dense">
      {items.map((item, index) => {
        const { size, position } = getCardProps(index);
        return (
          <ContentCard
            key={item.id}
            item={item}
            size={size}
            position={position}
            index={index}
            onClick={() => onItemClick?.(item)}
          />
        );
      })}
    </div>
  );
}
