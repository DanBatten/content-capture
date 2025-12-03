'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ContentItem } from '@/types/content';

interface ContentModalProps {
  item: ContentItem | null;
  onClose: () => void;
}

const sourceColors: Record<string, string> = {
  twitter: 'bg-[#1a1a1a]',
  instagram: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
  linkedin: 'bg-[#0A66C2]',
  pinterest: 'bg-[#E60023]',
  web: 'bg-[var(--accent)]',
};

// Vibrant topic colors
const topicColors = [
  { bg: 'bg-violet-500', text: 'text-white' },
  { bg: 'bg-emerald-500', text: 'text-white' },
  { bg: 'bg-amber-500', text: 'text-white' },
  { bg: 'bg-rose-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
  { bg: 'bg-fuchsia-500', text: 'text-white' },
  { bg: 'bg-lime-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
];

const useCaseColors = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-sky-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
];

function getTagColor(tag: string, colors: typeof topicColors): typeof topicColors[0] {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches.map(url => url.replace(/[.,;:!?)]+$/, '')))];
}

function getDomain(url: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return url;
  }
}

function getImageUrl(image: { url?: string; publicUrl?: string; originalUrl?: string } | undefined): string | null {
  if (!image) return null;
  return image.publicUrl || image.originalUrl || image.url || null;
}

function ImageGallery({ images, videos }: {
  images?: ContentItem['images'];
  videos?: ContentItem['videos'];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const mediaItems = useMemo(() => {
    const items: Array<{ type: 'video' | 'image'; url: string; thumbnail?: string }> = [];

    if (videos && videos.length > 0) {
      videos.forEach(video => {
        const url = video.originalUrl || video.url;
        if (url) {
          items.push({ type: 'video', url, thumbnail: video.thumbnail });
        }
      });
    }

    if (images && images.length > 0) {
      images.forEach(image => {
        const url = getImageUrl(image);
        if (url) {
          items.push({ type: 'image', url });
        }
      });
    }

    return items;
  }, [images, videos]);

  const totalItems = mediaItems.length;
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < totalItems - 1) {
      setCurrentIndex(prev => prev + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < totalItems - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  if (totalItems === 0) return null;

  const currentItem = mediaItems[currentIndex];

  return (
    <div
      className="relative w-full max-h-[50vh] bg-[var(--card-bg)] flex-shrink-0 overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative w-full h-full flex items-center justify-center" style={{ maxHeight: '50vh' }}>
        {currentItem.type === 'video' ? (
          <video
            key={currentItem.url}
            src={currentItem.url}
            poster={currentItem.thumbnail}
            controls
            className="max-w-full max-h-[50vh] object-contain"
          />
        ) : (
          <img
            key={currentItem.url}
            src={currentItem.url}
            alt={`Image ${currentIndex + 1}`}
            className="max-w-full max-h-[50vh] object-contain"
          />
        )}
      </div>

      {totalItems > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToPrev(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 font-mono-ui text-sm text-[var(--foreground)]/60 hover:text-[var(--foreground)] transition-colors"
            >
              [ ← ]
            </button>
          )}
          {currentIndex < totalItems - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToNext(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 font-mono-ui text-sm text-[var(--foreground)]/60 hover:text-[var(--foreground)] transition-colors"
            >
              [ → ]
            </button>
          )}
        </>
      )}

      {totalItems > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {mediaItems.map((_, index) => (
            <button
              key={index}
              onClick={(e) => { e.stopPropagation(); goToSlide(index); }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-[var(--foreground)] w-4'
                  : 'bg-[var(--foreground)]/30 hover:bg-[var(--foreground)]/50'
              }`}
            />
          ))}
        </div>
      )}

      {totalItems > 1 && (
        <div className="absolute top-3 right-3 font-mono-ui text-xs text-[var(--foreground-muted)]">
          {currentIndex + 1} / {totalItems}
        </div>
      )}
    </div>
  );
}

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
                className="text-[var(--accent-dark)] hover:underline break-all"
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
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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

  const extractedLinks = useMemo(() => {
    if (!item?.body_text) return [];
    return extractUrls(item.body_text);
  }, [item?.body_text]);

  if (!item) return null;

  const hasImage = item.images && item.images.length > 0;
  const hasVideo = item.videos && item.videos.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#1a1a1a]/60 panel-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[var(--panel-bg)] rounded-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          [ close ]
        </button>

        {/* Media section */}
        {(hasImage || hasVideo) && (
          <ImageGallery images={item.images} videos={item.videos} />
        )}

        {/* Content section */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {/* Source badge and link */}
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-[var(--panel-border)]">
            <div className="flex items-center gap-3">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${sourceColors[item.source_type] || 'bg-[var(--accent)]'}`}>
                {item.source_type === 'twitter' ? '𝕏' :
                 item.source_type === 'instagram' ? 'IG' :
                 item.source_type === 'linkedin' ? 'in' :
                 item.source_type === 'pinterest' ? 'P' : '◎'}
              </span>
              {(item.author_name || item.author_handle) && (
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {item.author_name}
                  </p>
                  {item.author_handle && (
                    <p className="font-mono-ui text-xs text-[var(--foreground-muted)]">{item.author_handle}</p>
                  )}
                </div>
              )}
            </div>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              [ view original ]
            </a>
          </div>

          {/* Title */}
          <h2 className="text-xl font-medium text-[var(--foreground)] mb-4">
            {item.title || 'Untitled'}
          </h2>

          {/* Summary */}
          {item.summary && (
            <div className="mb-6 p-4 bg-[var(--card-bg)] rounded-lg">
              <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-2">Summary</h3>
              <p className="text-[var(--foreground)]">{item.summary}</p>
            </div>
          )}

          {/* Body text */}
          {item.body_text && (
            <div className="mb-6">
              <p className="text-[var(--foreground-muted)] whitespace-pre-wrap leading-relaxed">
                <TextWithLinks text={item.body_text} />
              </p>
            </div>
          )}

          {/* Extracted links */}
          {extractedLinks.length > 0 && (
            <div className="mb-6">
              <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Links</h3>
              <div className="space-y-2">
                {extractedLinks.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-[var(--card-bg)] hover:bg-[var(--card-hover)] rounded-lg transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono-ui text-sm text-[var(--foreground)] truncate group-hover:text-[var(--accent-dark)] transition-colors">
                        {getDomain(url)}
                      </p>
                      <p className="font-mono-ui text-xs text-[var(--foreground-muted)] truncate">
                        {url}
                      </p>
                    </div>
                    <span className="font-mono-ui text-xs text-[var(--foreground-muted)] group-hover:text-[var(--foreground)] transition-colors">→</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Topics */}
          {item.topics && item.topics.length > 0 && (
            <div className="mb-6">
              <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {item.topics.map((topic) => {
                  const color = getTagColor(topic, topicColors);
                  return (
                    <span
                      key={topic}
                      className={`px-3 py-1.5 ${color.bg} ${color.text} font-mono-ui text-xs`}
                    >
                      {topic}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Use cases */}
          {item.use_cases && item.use_cases.length > 0 && (
            <div className="mb-6">
              <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Use Cases</h3>
              <div className="flex flex-wrap gap-2">
                {item.use_cases.map((useCase) => {
                  const color = getTagColor(useCase, useCaseColors);
                  return (
                    <span
                      key={useCase}
                      className={`px-3 py-1.5 ${color.bg} ${color.text} font-mono-ui text-xs`}
                    >
                      {useCase}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-6 border-t border-[var(--panel-border)]">
            <div className="flex flex-wrap gap-6 font-mono-ui text-xs text-[var(--foreground-muted)]">
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
