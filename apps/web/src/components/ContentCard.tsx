'use client';

import type { ContentItem } from '@/types/content';

interface ContentCardProps {
  item: ContentItem;
  size?: 'large' | 'medium' | 'small';
  position?: 'left' | 'right' | 'auto';
  onClick?: () => void;
  index?: number;
}

const sourceColors: Record<string, string> = {
  twitter: 'bg-[#1a1a1a]',
  instagram: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
  linkedin: 'bg-[#0A66C2]',
  pinterest: 'bg-[#E60023]',
  web: 'bg-[var(--accent)]',
};

// Soft, muted topic colors
const topicCardColors = [
  'bg-violet-300/70 text-violet-900',
  'bg-emerald-300/70 text-emerald-900',
  'bg-amber-300/70 text-amber-900',
  'bg-rose-300/70 text-rose-900',
  'bg-cyan-300/70 text-cyan-900',
  'bg-fuchsia-300/70 text-fuchsia-900',
  'bg-lime-300/70 text-lime-900',
  'bg-orange-300/70 text-orange-900',
];

export function getTopicColor(topic: string): string {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = ((hash << 5) - hash) + topic.charCodeAt(i);
    hash |= 0;
  }
  return topicCardColors[Math.abs(hash) % topicCardColors.length];
}

function getImageUrl(image: { url?: string; publicUrl?: string; originalUrl?: string } | undefined): string | null {
  if (!image) return null;
  return image.publicUrl || image.originalUrl || image.url || null;
}

export function ContentCard({ item, size = 'medium', position = 'auto', onClick, index = 0 }: ContentCardProps) {
  const hasImage = item.images && item.images.length > 0;
  const hasVideo = item.videos && item.videos.length > 0;
  const imageCount = item.images?.length || 0;
  const hasMultipleImages = imageCount > 1;

  // For web items, prefer screenshot, then OG image
  // For social items, prefer video thumbnail, then images
  // For Twitter without images, use fallback
  const getWebThumbnail = () => {
    const screenshot = item.platform_data?.screenshot as string | undefined;
    if (screenshot) return screenshot;
    if (hasImage) return getImageUrl(item.images?.[0]);
    return null;
  };

  const getTwitterThumbnail = () => {
    if (hasVideo && item.videos?.[0]?.thumbnail) return item.videos[0].thumbnail;
    if (hasImage) return getImageUrl(item.images?.[0]);
    return '/twitter-fallback.png'; // Watercolor fallback for text-only tweets
  };

  const thumbnail = item.source_type === 'web'
    ? getWebThumbnail()
    : item.source_type === 'twitter'
      ? getTwitterThumbnail()
      : hasVideo && item.videos?.[0]?.thumbnail
        ? item.videos[0].thumbnail
        : hasImage
          ? getImageUrl(item.images?.[0])
          : null;

  // Size classes - large cards span 2 columns
  const getSizeClasses = () => {
    if (size === 'large') {
      // For large cards, add position-based column start on xl screens
      // xl has 4 columns, so right-aligned starts at column 3
      // 2xl has 5 columns, so right-aligned starts at column 4
      if (position === 'right') {
        return 'col-span-1 sm:col-span-2 row-span-1 sm:row-span-2 xl:col-start-3 2xl:col-start-4';
      }
      return 'col-span-1 sm:col-span-2 row-span-1 sm:row-span-2';
    }
    return 'col-span-1 row-span-1';
  };

  const aspectClasses = {
    large: 'aspect-[4/3]',
    medium: 'aspect-[4/3]',
    small: 'aspect-[4/3]',
  };

  // Stagger class for animation
  const staggerClass = `stagger-${Math.min(index % 8 + 1, 8)}`;

  return (
    <article
      className={`
        group flex flex-col overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        hover:-translate-y-1 hover:shadow-xl
        bg-[var(--card-bg)]
        opacity-0 animate-fade-in-up ${staggerClass}
        ${getSizeClasses()}
      `}
      onClick={onClick}
    >
      {/* Image section */}
      <div className={`relative w-full ${aspectClasses[size]} flex-shrink-0 overflow-hidden`}>
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={item.title || 'Content preview'}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Gallery indicator */}
            {hasMultipleImages && (
              <div className="absolute bottom-3 right-3 flex gap-1">
                {item.images!.slice(0, 4).map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
                {imageCount > 4 && (
                  <span className="text-white/70 text-xs font-mono-ui ml-1">+{imageCount - 4}</span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className={`absolute inset-0 ${sourceColors[item.source_type] || 'bg-[var(--accent)]'}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
          </div>
        )}

        {/* Source badge - minimal */}
        <div className="absolute top-3 left-3">
          <span className={`
            w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium
            ${sourceColors[item.source_type] || 'bg-[var(--accent)]'}
            shadow-sm
          `}>
            {item.source_type === 'twitter' ? '𝕏' :
             item.source_type === 'instagram' ? 'IG' :
             item.source_type === 'linkedin' ? 'in' :
             item.source_type === 'pinterest' ? 'P' : '◎'}
          </span>
        </div>

        {/* Video indicator */}
        {hasVideo && (
          <div className="absolute top-3 right-3">
            <span className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-[var(--foreground)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* Text content */}
      <div className={`flex flex-col p-4 ${size === 'large' ? 'gap-2' : 'gap-1.5'} flex-grow`}>
        {/* Author */}
        {(item.author_name || item.author_handle) && (
          <p className="font-mono-ui text-xs text-[var(--foreground-muted)] truncate">
            {item.author_name}
            {item.author_handle && (
              <span className="opacity-60 ml-1">{item.author_handle}</span>
            )}
          </p>
        )}

        {/* Title */}
        <h3 className={`
          text-[var(--foreground)] font-medium leading-snug line-clamp-2
          ${size === 'large' ? 'text-lg' : 'text-sm'}
        `}>
          {item.title || item.description?.slice(0, 100) || 'Untitled'}
        </h3>

        {/* Summary (large cards only) */}
        {size === 'large' && item.summary && (
          <p className="text-[var(--foreground-muted)] text-sm line-clamp-2">
            {item.summary}
          </p>
        )}

        {/* Topics */}
        {item.topics && item.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
            {item.topics.slice(0, size === 'large' ? 4 : 2).map((topic) => (
              <span
                key={topic}
                className={`px-2 py-0.5 text-xs font-mono-ui ${getTopicColor(topic)}`}
              >
                {topic}
              </span>
            ))}
            {item.topics.length > (size === 'large' ? 4 : 2) && (
              <span className="px-2 py-0.5 text-[var(--foreground-muted)] text-xs font-mono-ui">
                +{item.topics.length - (size === 'large' ? 4 : 2)}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
