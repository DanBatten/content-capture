'use client';

import { useEffect } from 'react';
import type { ContentItem } from '@/types/content';

interface ContentModalProps {
  item: ContentItem | null;
  onClose: () => void;
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

export function ContentModal({ item, onClose }: ContentModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (item) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [item]);

  if (!item) return null;

  const hasImage = item.images && item.images.length > 0;
  const hasVideo = item.videos && item.videos.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Media section */}
        {(hasImage || hasVideo) && (
          <div className="relative w-full aspect-video bg-neutral-100 dark:bg-neutral-800 flex-shrink-0">
            {hasVideo && item.videos?.[0] ? (
              <video
                src={item.videos[0].originalUrl || item.videos[0].url}
                poster={item.videos[0].thumbnail}
                controls
                className="w-full h-full object-contain"
              />
            ) : hasImage && item.images?.[0] ? (
              <img
                src={getImageUrl(item.images[0]) || ''}
                alt={item.title || 'Content image'}
                className="w-full h-full object-contain"
              />
            ) : null}
          </div>
        )}

        {/* Content section */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Source badge and link */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${sourceColors[item.source_type] || 'bg-neutral-700'}`}>
                {item.source_type === 'twitter' ? '𝕏' :
                 item.source_type === 'instagram' ? 'IG' :
                 item.source_type === 'linkedin' ? 'in' :
                 item.source_type === 'pinterest' ? 'P' : '🌐'}
              </span>
              {(item.author_name || item.author_handle) && (
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">
                    {item.author_name}
                  </p>
                  {item.author_handle && (
                    <p className="text-sm text-neutral-500">{item.author_handle}</p>
                  )}
                </div>
              )}
            </div>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <span>View original</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">
            {item.title || 'Untitled'}
          </h2>

          {/* Summary */}
          {item.summary && (
            <div className="mb-4 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Summary</h3>
              <p className="text-neutral-700 dark:text-neutral-300">{item.summary}</p>
            </div>
          )}

          {/* Body text */}
          {item.body_text && (
            <div className="mb-4">
              <p className="text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                {item.body_text}
              </p>
            </div>
          )}

          {/* Topics */}
          {item.topics && item.topics.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {item.topics.map((topic) => (
                  <span
                    key={topic}
                    className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-sm rounded-full"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Use cases */}
          {item.use_cases && item.use_cases.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Use Cases</h3>
              <div className="flex flex-wrap gap-2">
                {item.use_cases.map((useCase) => (
                  <span
                    key={useCase}
                    className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-full"
                  >
                    {useCase}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Multiple images gallery */}
          {item.images && item.images.length > 1 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Images</h3>
              <div className="grid grid-cols-3 gap-2">
                {item.images.map((image, index) => {
                  const imgUrl = getImageUrl(image);
                  if (!imgUrl) return null;
                  return (
                    <img
                      key={index}
                      src={imgUrl}
                      alt={`Image ${index + 1}`}
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
              {item.published_at && (
                <span>Published: {new Date(item.published_at).toLocaleDateString()}</span>
              )}
              {item.captured_at && (
                <span>Captured: {new Date(item.captured_at).toLocaleDateString()}</span>
              )}
              {item.content_type && (
                <span>Type: {item.content_type}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
