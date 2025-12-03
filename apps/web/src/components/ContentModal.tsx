'use client';

import { useEffect, useMemo } from 'react';
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

// Color palette for topics - deterministic based on topic name
const topicColors = [
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
  { bg: 'bg-lime-100 dark:bg-lime-900/40', text: 'text-lime-700 dark:text-lime-300' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
];

// Color palette for use cases
const useCaseColors = [
  { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-700 dark:text-sky-300' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300' },
];

// Get consistent color for a tag based on its name
function getTagColor(tag: string, colors: typeof topicColors): typeof topicColors[0] {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

// Extract URLs from text
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  // Remove duplicates and clean up trailing punctuation
  return [...new Set(matches.map(url => url.replace(/[.,;:!?)]+$/, '')))];
}

// Get domain from URL for display
function getDomain(url: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return url;
  }
}

// Helper to get the best image URL from various formats
function getImageUrl(image: { url?: string; publicUrl?: string; originalUrl?: string } | undefined): string | null {
  if (!image) return null;
  return image.publicUrl || image.originalUrl || image.url || null;
}

// Render text with clickable links
function TextWithLinks({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, index) => {
        if (part.match(urlRegex)) {
          const cleanUrl = part.replace(/[.,;:!?)]+$/, '');
          const trailing = part.slice(cleanUrl.length);
          return (
            <span key={index}>
              <a
                href={cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                {cleanUrl}
              </a>
              {trailing}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
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

  // Extract links from body text
  const extractedLinks = useMemo(() => {
    if (!item?.body_text) return [];
    return extractUrls(item.body_text);
  }, [item?.body_text]);

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

          {/* Body text with clickable links */}
          {item.body_text && (
            <div className="mb-4">
              <p className="text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                <TextWithLinks text={item.body_text} />
              </p>
            </div>
          )}

          {/* Extracted links as cards */}
          {extractedLinks.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Links</h3>
              <div className="space-y-2">
                {extractedLinks.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {getDomain(url)}
                      </p>
                      <p className="text-xs text-neutral-500 truncate">
                        {url}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-neutral-400 group-hover:text-blue-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Topics - color coded */}
          {item.topics && item.topics.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {item.topics.map((topic) => {
                  const color = getTagColor(topic, topicColors);
                  return (
                    <span
                      key={topic}
                      className={`px-3 py-1 ${color.bg} ${color.text} text-sm rounded-full font-medium`}
                    >
                      {topic}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Use cases - color coded */}
          {item.use_cases && item.use_cases.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Use Cases</h3>
              <div className="flex flex-wrap gap-2">
                {item.use_cases.map((useCase) => {
                  const color = getTagColor(useCase, useCaseColors);
                  return (
                    <span
                      key={useCase}
                      className={`px-3 py-1 ${color.bg} ${color.text} text-sm rounded-full font-medium`}
                    >
                      {useCase}
                    </span>
                  );
                })}
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
