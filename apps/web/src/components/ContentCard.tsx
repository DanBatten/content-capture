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

// Helper to get the best image URL from various formats
function getImageUrl(image: { url?: string; publicUrl?: string; originalUrl?: string } | undefined): string | null {
  if (!image) return null;
  return image.publicUrl || image.originalUrl || image.url || null;
}

export function ContentCard({ item, size = 'medium', onClick }: ContentCardProps) {
  const hasImage = item.images && item.images.length > 0;
  const hasVideo = item.videos && item.videos.length > 0;

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

  const heightClasses = {
    large: 'min-h-[400px]',
    medium: 'min-h-[280px]',
    small: 'min-h-[200px]',
  };

  return (
    <article
      className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${sizeClasses[size]} ${heightClasses[size]}`}
      onClick={onClick}
    >
      {/* Background */}
      {thumbnail ? (
        <div className="absolute inset-0">
          <img
            src={thumbnail}
            alt={item.title || 'Content preview'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        </div>
      ) : (
        <div className={`absolute inset-0 ${sourceColors[item.source_type] || 'bg-neutral-800'}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        </div>
      )}

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-5">
        {/* Source badge */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${sourceColors[item.source_type] || 'bg-neutral-700'}`}>
            {item.source_type === 'twitter' ? '𝕏' :
             item.source_type === 'instagram' ? 'IG' :
             item.source_type === 'linkedin' ? 'in' :
             item.source_type === 'pinterest' ? 'P' : '🌐'}
          </span>
        </div>

        {/* Video indicator */}
        {hasVideo && (
          <div className="absolute top-4 right-4">
            <span className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}

        {/* Text content */}
        <div className="space-y-2">
          {/* Author */}
          {(item.author_name || item.author_handle) && (
            <p className="text-white/70 text-sm font-medium">
              {item.author_name}
              {item.author_handle && (
                <span className="text-white/50 ml-1">{item.author_handle}</span>
              )}
            </p>
          )}

          {/* Title */}
          <h3 className={`text-white font-semibold leading-tight ${
            size === 'large' ? 'text-xl' : size === 'medium' ? 'text-base' : 'text-sm'
          }`}>
            {item.title || item.description?.slice(0, 100) || 'Untitled'}
          </h3>

          {/* Summary (large cards only) */}
          {size === 'large' && item.summary && (
            <p className="text-white/70 text-sm line-clamp-2">
              {item.summary}
            </p>
          )}

          {/* Topics */}
          {item.topics && item.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {item.topics.slice(0, size === 'large' ? 4 : 2).map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-white/90 text-xs"
                >
                  {topic}
                </span>
              ))}
              {item.topics.length > (size === 'large' ? 4 : 2) && (
                <span className="px-2 py-0.5 text-white/60 text-xs">
                  +{item.topics.length - (size === 'large' ? 4 : 2)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
    </article>
  );
}
