'use client';

import type { ContentItem } from '@/types/content';

interface ContentCardProps {
  item: ContentItem;
  size?: 'large' | 'medium' | 'small';
  onClick?: () => void;
}

const sourceColors: Record<string, string> = {
  twitter: 'bg-neutral-900',
  instagram: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400',
  linkedin: 'bg-blue-700',
  pinterest: 'bg-red-600',
  web: 'bg-emerald-600',
};

// Color palette for topic pills on cards (semi-transparent for overlay)
const topicCardColors = [
  'bg-violet-500/30 text-violet-100',
  'bg-emerald-500/30 text-emerald-100',
  'bg-amber-500/30 text-amber-100',
  'bg-rose-500/30 text-rose-100',
  'bg-cyan-500/30 text-cyan-100',
  'bg-fuchsia-500/30 text-fuchsia-100',
  'bg-lime-500/30 text-lime-100',
  'bg-orange-500/30 text-orange-100',
];

// Get consistent color for a tag based on its name
function getTopicColor(topic: string): string {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = ((hash << 5) - hash) + topic.charCodeAt(i);
    hash |= 0;
  }
  return topicCardColors[Math.abs(hash) % topicCardColors.length];
}

// Helper to get the best image URL from various formats
function getImageUrl(image: { url?: string; publicUrl?: string; originalUrl?: string } | undefined): string | null {
  if (!image) return null;
  return image.publicUrl || image.originalUrl || image.url || null;
}

export function ContentCard({ item, size = 'medium', onClick }: ContentCardProps) {
  const hasImage = item.images && item.images.length > 0;
  const hasVideo = item.videos && item.videos.length > 0;
  const imageCount = item.images?.length || 0;
  const hasMultipleImages = imageCount > 1;

  // Get thumbnail: prefer video thumbnail, then first image
  const thumbnail = hasVideo && item.videos?.[0]?.thumbnail
    ? item.videos[0].thumbnail
    : hasImage
    ? getImageUrl(item.images?.[0])
    : null;

  const sizeClasses = {
    large: 'col-span-2 row-span-2',
    medium: 'col-span-1 row-span-1',
    small: 'col-span-1 row-span-1',
  };

  // Fixed aspect ratios for consistent image display
  const aspectClasses = {
    large: 'aspect-[4/3]',
    medium: 'aspect-[4/3]',
    small: 'aspect-[4/3]',
  };

  return (
    <article
      className={`group flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl bg-neutral-900 ${sizeClasses[size]}`}
      onClick={onClick}
    >
      {/* Image section with fixed aspect ratio */}
      <div className={`relative w-full ${aspectClasses[size]} flex-shrink-0`}>
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={item.title || 'Content preview'}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Gallery indicator for multiple images */}
            {hasMultipleImages && (
              <div className="absolute bottom-3 right-3 flex gap-1">
                {item.images!.slice(0, 4).map((img, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
                {imageCount > 4 && (
                  <span className="text-white/70 text-xs ml-1">+{imageCount - 4}</span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className={`absolute inset-0 ${sourceColors[item.source_type] || 'bg-neutral-800'}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
          </div>
        )}

        {/* Source badge */}
        <div className="absolute top-3 left-3">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${sourceColors[item.source_type] || 'bg-neutral-700'}`}>
            {item.source_type === 'twitter' ? '𝕏' :
             item.source_type === 'instagram' ? 'IG' :
             item.source_type === 'linkedin' ? 'in' :
             item.source_type === 'pinterest' ? 'P' : '🌐'}
          </span>
        </div>

        {/* Video indicator */}
        {hasVideo && (
          <div className="absolute top-3 right-3">
            <span className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* Text content section - fixed height */}
      <div className={`flex flex-col p-4 ${size === 'large' ? 'gap-2' : 'gap-1.5'}`}>
        {/* Author */}
        {(item.author_name || item.author_handle) && (
          <p className="text-neutral-400 text-sm font-medium truncate">
            {item.author_name}
            {item.author_handle && (
              <span className="text-neutral-500 ml-1">{item.author_handle}</span>
            )}
          </p>
        )}

        {/* Title */}
        <h3 className={`text-white font-semibold leading-tight line-clamp-2 ${
          size === 'large' ? 'text-lg' : 'text-sm'
        }`}>
          {item.title || item.description?.slice(0, 100) || 'Untitled'}
        </h3>

        {/* Summary (large cards only) */}
        {size === 'large' && item.summary && (
          <p className="text-neutral-400 text-sm line-clamp-2">
            {item.summary}
          </p>
        )}

        {/* Topics - color coded */}
        {item.topics && item.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
            {item.topics.slice(0, size === 'large' ? 4 : 2).map((topic) => (
              <span
                key={topic}
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTopicColor(topic)}`}
              >
                {topic}
              </span>
            ))}
            {item.topics.length > (size === 'large' ? 4 : 2) && (
              <span className="px-2 py-0.5 text-neutral-500 text-xs">
                +{item.topics.length - (size === 'large' ? 4 : 2)}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
