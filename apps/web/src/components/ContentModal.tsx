'use client';

import { useEffect, useMemo } from 'react';
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

  // Collect all media (videos first, then images)
  const allMedia = useMemo(() => {
    if (!item) return [];
    const media: Array<{ type: 'video' | 'image'; url: string; thumbnail?: string }> = [];
    
    if (item.videos && item.videos.length > 0) {
      item.videos.forEach(video => {
        const url = video.originalUrl || video.url;
        if (url) {
          media.push({ type: 'video', url, thumbnail: video.thumbnail });
        }
      });
    }
    
    if (item.images && item.images.length > 0) {
      item.images.forEach(image => {
        const url = getImageUrl(image);
        if (url) {
          media.push({ type: 'image', url });
        }
      });
    }
    
    return media;
  }, [item]);

  if (!item) return null;

  const hasMedia = allMedia.length > 0;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#1a1a1a]/40"
        onClick={onClose}
      />

      {/* Modal container - top padding to clear nav, side/bottom padding for grid alignment */}
      <div className="relative w-full h-full pt-[73px] px-6 sm:px-8 lg:px-12 pb-6 sm:pb-8 lg:pb-12">
        {/* Modal card */}
        <div className="w-full h-full flex flex-col bg-[#E8DED0] dark:bg-[#2d271f] overflow-hidden">
          {/* Full-width header */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-4 border-b border-[var(--panel-border)]">
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
            <button
              onClick={onClose}
              className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              [ close ]
            </button>
          </div>

          {/* Two-column content area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left side - Text content */}
            <div className={`flex-1 overflow-y-auto p-6 sm:p-8 ${hasMedia ? 'md:w-2/5 lg:w-2/5' : 'w-full'}`}>
              {/* Title */}
              <h2 className="text-2xl sm:text-3xl font-medium text-[var(--foreground)] mb-6 leading-tight">
                {item.title || 'Untitled'}
              </h2>

              {/* Summary */}
              {item.summary && (
                <div className="mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Summary</h3>
                  <p className="text-[var(--foreground)] leading-relaxed">{item.summary}</p>
                </div>
              )}

              {/* Body text */}
              {item.body_text && (
                <div className="mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Content</h3>
                  <p className="text-[var(--foreground-muted)] whitespace-pre-wrap leading-relaxed">
                    <TextWithLinks text={item.body_text} />
                  </p>
                </div>
              )}

              {/* Extracted links */}
              {extractedLinks.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Links</h3>
                  <div className="space-y-2">
                    {extractedLinks.map((url, index) => (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-[var(--background)] hover:bg-[var(--background-warm)] transition-colors group"
                      >
                        <div className="w-8 h-8 bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
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
                <div className="mb-8">
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
                <div className="mb-8">
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

              {/* View original link */}
              <div className="mb-8">
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  [ view original source ]
                  <span>→</span>
                </a>
              </div>

              {/* Metadata */}
              <div className="pt-6 border-t border-[var(--panel-border)]">
                <div className="grid grid-cols-2 gap-4 font-mono-ui text-xs text-[var(--foreground-muted)]">
                  {item.published_at && (
                    <div>
                      <span className="uppercase tracking-widest opacity-60">Published</span>
                      <p className="mt-1 text-[var(--foreground)]">{new Date(item.published_at).toLocaleDateString()}</p>
                    </div>
                  )}
                  {item.captured_at && (
                    <div>
                      <span className="uppercase tracking-widest opacity-60">Captured</span>
                      <p className="mt-1 text-[var(--foreground)]">{new Date(item.captured_at).toLocaleDateString()}</p>
                    </div>
                  )}
                  {item.content_type && (
                    <div>
                      <span className="uppercase tracking-widest opacity-60">Type</span>
                      <p className="mt-1 text-[var(--foreground)]">{item.content_type}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Media gallery (vertical scroll) */}
            {hasMedia && (
              <div className="hidden md:flex md:w-3/5 lg:w-3/5 flex-col overflow-hidden border-l border-[var(--panel-border)]">
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-4">
                  {allMedia.map((media, index) => (
                    <div key={index} className="w-full">
                      {media.type === 'video' ? (
                        <video
                          src={media.url}
                          poster={media.thumbnail}
                          controls
                          className="w-full h-auto"
                        />
                      ) : (
                        <img
                          src={media.url}
                          alt={`Image ${index + 1}`}
                          className="w-full h-auto"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
