'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import type { ContentItem } from '@/types/content';

const RAW_CONTENT_CHAR_LIMIT = 300;

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

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}

// Visual share card component - like iMessage/social media previews
function LinkShareCard({ 
  url, 
  title, 
  description,
  screenshot,
  size = 'default' 
}: { 
  url: string; 
  title?: string | null;
  description?: string | null;
  screenshot?: string | null;
  size?: 'default' | 'compact';
}) {
  const domain = getDomain(url);
  const faviconUrl = getFaviconUrl(url);
  const isCompact = size === 'compact';
  
  if (isCompact) {
    // Compact version for link lists
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--card-hover)] border border-[var(--panel-border)] hover:border-[var(--accent)]/50 transition-all duration-200"
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 flex items-center justify-center flex-shrink-0">
          {faviconUrl && (
            <img 
              src={faviconUrl} 
              alt={domain}
              className="w-5 h-5 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)] truncate group-hover:text-[var(--accent-dark)] transition-colors">
            {domain}
          </p>
          <p className="text-xs text-[var(--foreground-muted)] truncate">{url}</p>
        </div>
        <svg className="w-4 h-4 text-[var(--foreground-muted)] group-hover:text-[var(--accent-dark)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    );
  }
  
  // Full visual share card - like iMessage/social previews
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-2xl border border-[var(--panel-border)] hover:border-[var(--accent)]/50 hover:shadow-xl transition-all duration-300"
    >
      {/* Screenshot or visual header */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a] overflow-hidden">
        {screenshot ? (
          // Show screenshot if available
          <img 
            src={screenshot}
            alt={`Screenshot of ${domain}`}
            className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
          />
        ) : (
          // Fallback: pattern + favicon
          <>
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300">
                {faviconUrl ? (
                  <img 
                    src={faviconUrl} 
                    alt={domain}
                    className="w-10 h-10 object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <svg className="w-10 h-10 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                )}
              </div>
            </div>
          </>
        )}
        
        {/* Gradient overlay at bottom for text readability */}
        {screenshot && (
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
        )}
      </div>
      
      {/* Content area */}
      <div className="p-4 bg-[var(--card-bg)]">
        <div className="flex items-center gap-2 mb-2">
          {faviconUrl && (
            <img 
              src={faviconUrl} 
              alt=""
              className="w-4 h-4 object-contain"
            />
          )}
          <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
            {domain}
          </span>
          <svg className="w-3.5 h-3.5 text-[var(--foreground-muted)] group-hover:text-[var(--accent-dark)] transition-colors ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        {title && (
          <h4 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--accent-dark)] transition-colors line-clamp-2 mb-1">
            {title}
          </h4>
        )}
        {description && (
          <p className="text-sm text-[var(--foreground-muted)] line-clamp-2">{description}</p>
        )}
      </div>
    </a>
  );
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

// Horizontal swipeable gallery for mobile
function MobileGallery({ media }: { media: Array<{ type: 'video' | 'image'; url: string; thumbnail?: string }> }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const itemWidth = scrollRef.current.offsetWidth;
      const newIndex = Math.round(scrollLeft / itemWidth);
      setCurrentIndex(newIndex);
    }
  };

  if (media.length === 0) return null;

  return (
    <div className="w-full flex-shrink-0">
      {/* Scrollable gallery */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {media.map((item, index) => (
          <div
            key={index}
            className="w-full flex-shrink-0 snap-center"
          >
            {item.type === 'video' ? (
              <video
                src={item.url}
                poster={item.thumbnail}
                controls
                className="w-full h-auto max-h-[40vh] object-contain bg-black"
              />
            ) : (
              <img
                src={item.url}
                alt={`Image ${index + 1}`}
                className="w-full h-auto max-h-[40vh] object-contain bg-black"
              />
            )}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {media.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3 bg-[#E8DED0]">
          {media.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                scrollRef.current?.scrollTo({
                  left: index * (scrollRef.current?.offsetWidth || 0),
                  behavior: 'smooth'
                });
              }}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-[var(--foreground)] w-4'
                  : 'bg-[var(--foreground)]/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ContentModal({ item, onClose }: ContentModalProps) {
  const [isRawContentExpanded, setIsRawContentExpanded] = useState(false);

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
      setIsRawContentExpanded(false); // Reset when item changes
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

  // Check if content needs truncation
  const rawContentNeedsTruncation = useMemo(() => {
    return item?.body_text && item.body_text.length > RAW_CONTENT_CHAR_LIMIT;
  }, [item?.body_text]);

  const truncatedRawContent = useMemo(() => {
    if (!item?.body_text) return '';
    if (!rawContentNeedsTruncation || isRawContentExpanded) return item.body_text;
    return item.body_text.slice(0, RAW_CONTENT_CHAR_LIMIT) + '...';
  }, [item?.body_text, rawContentNeedsTruncation, isRawContentExpanded]);

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
  const isSocialWithoutMedia = ['twitter', 'instagram'].includes(item.source_type) && !hasMedia;
  
  // Extract tweet ID from URL for embedding
  const getTweetId = (url: string): string | null => {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
  };
  
  // Extract Instagram post ID/URL for embedding
  const getInstagramEmbedUrl = (url: string): string | null => {
    // Instagram URLs: instagram.com/p/{id}/ or instagram.com/reel/{id}/
    const match = url.match(/instagram\.com\/(p|reel)\/([^/?]+)/);
    if (match) {
      return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
    }
    return null;
  };
  
  const tweetId = item.source_type === 'twitter' ? getTweetId(item.source_url) : null;
  const instagramEmbedUrl = item.source_type === 'instagram' ? getInstagramEmbedUrl(item.source_url) : null;
  
  const hasEmbed = tweetId || instagramEmbedUrl;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#1a1a1a]/40"
        onClick={onClose}
      />

      {/* Modal container - fullscreen on mobile/tablet, padded on desktop (lg+) */}
      <div className="relative w-full h-full pt-0 lg:pt-[73px] px-0 lg:px-12 pb-0 lg:pb-12">
        {/* Modal card */}
        <div className="w-full h-full flex flex-col bg-[var(--panel-bg)] overflow-hidden">
          {/* Full-width header */}
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-[var(--panel-border)]">
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

          {/* Content area - stacked on mobile, side-by-side on desktop */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Mobile horizontal gallery - shown on mobile/tablet only */}
            {hasMedia && (
              <div className="lg:hidden">
                <MobileGallery media={allMedia} />
              </div>
            )}

            {/* Text content */}
            <div className={`flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 ${hasMedia || isSocialWithoutMedia ? 'lg:w-2/5' : 'w-full'}`}>
              {/* Title */}
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-medium text-[var(--foreground)] mb-4 sm:mb-6 leading-tight">
                {item.title || 'Untitled'}
              </h2>

              {/* Summary - Primary content */}
              {item.summary && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Summary</h3>
                  <p className="text-[var(--foreground)] leading-relaxed text-base sm:text-lg">{item.summary}</p>
                </div>
              )}

              {/* Source Link - Prominent visual card for web content */}
              {item.source_type === 'web' && item.source_url && (
                <div className="mb-6 sm:mb-8">
                  <LinkShareCard 
                    url={item.source_url} 
                    title={item.title}
                    description={item.description}
                    screenshot={
                      // Use screenshot if available, otherwise fall back to first OG image
                      (item.platform_data?.screenshot as string | undefined) ||
                      (item.images?.[0]?.publicUrl || item.images?.[0]?.originalUrl || item.images?.[0]?.url)
                    }
                  />
                </div>
              )}

              {/* Raw content - Only for social posts without embeds */}
              {item.body_text && item.source_type !== 'web' && !hasEmbed && (
                <div className="mb-6 sm:mb-8">
                  <button
                    onClick={() => setIsRawContentExpanded(!isRawContentExpanded)}
                    className="flex items-center gap-2 font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-2 sm:mb-3"
                  >
                    <svg 
                      className={`w-3 h-3 transition-transform ${isRawContentExpanded ? 'rotate-90' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Original Post
                    {rawContentNeedsTruncation && !isRawContentExpanded && (
                      <span className="opacity-60">({item.body_text.length} chars)</span>
                    )}
                  </button>
                  <div className={`overflow-hidden transition-all duration-200 ${isRawContentExpanded ? 'max-h-none' : 'max-h-24'}`}>
                    <p className="text-[var(--foreground-muted)] whitespace-pre-wrap leading-relaxed text-sm">
                      <TextWithLinks text={truncatedRawContent} />
                    </p>
                  </div>
                  {rawContentNeedsTruncation && (
                    <button
                      onClick={() => setIsRawContentExpanded(!isRawContentExpanded)}
                      className="mt-2 font-mono-ui text-xs text-[var(--accent-dark)] hover:text-[var(--foreground)] transition-colors"
                    >
                      {isRawContentExpanded ? '[ collapse ]' : '[ show more ]'}
                    </button>
                  )}
                </div>
              )}

              {/* Extracted links - as share cards */}
              {extractedLinks.length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">
                    Links Mentioned ({extractedLinks.length})
                  </h3>
                  <div className="space-y-3">
                    {extractedLinks.map((url, index) => (
                      <LinkShareCard 
                        key={index}
                        url={url}
                        size="compact"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Topics */}
              {item.topics && item.topics.length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-2 sm:mb-3">Topics</h3>
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
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-2 sm:mb-3">Use Cases</h3>
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

              {/* Original Post - Embeds for Twitter/Instagram/LinkedIn, Link card for others */}
              {item.source_type === 'twitter' && tweetId && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Original Post</h3>
                  <div className="rounded-xl overflow-hidden bg-white">
                    <iframe
                      src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=light`}
                      className="w-full min-h-[300px] border-0"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
              {item.source_type === 'instagram' && instagramEmbedUrl && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Original Post</h3>
                  <div className="rounded-xl overflow-hidden bg-white">
                    <iframe
                      src={instagramEmbedUrl}
                      className="w-full min-h-[500px] border-0"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
              {item.source_type !== 'web' && !hasEmbed && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Original Post</h3>
                  <LinkShareCard 
                    url={item.source_url}
                    title={`View on ${item.source_type.charAt(0).toUpperCase() + item.source_type.slice(1)}`}
                    size="compact"
                  />
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 sm:pt-6 border-t border-[var(--panel-border)]">
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

            {/* Desktop vertical gallery - shown on lg+ only */}
            {hasMedia && (
              <div className="hidden lg:flex lg:w-3/5 flex-col overflow-hidden border-l border-[var(--panel-border)]">
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-4">
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

            {/* Embedded post for social posts without media */}
            {isSocialWithoutMedia && hasEmbed && (
              <div className="hidden lg:flex lg:w-3/5 flex-col overflow-hidden border-l border-[var(--panel-border)] bg-[var(--card-bg)]">
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex items-center justify-center">
                  <div className="w-full max-w-lg">
                    {tweetId && (
                      <iframe
                        src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=light`}
                        className="w-full min-h-[400px] border-0 rounded-xl bg-white"
                        allowFullScreen
                      />
                    )}
                    {instagramEmbedUrl && (
                      <iframe
                        src={instagramEmbedUrl}
                        className="w-full min-h-[600px] border-0 rounded-xl bg-white"
                        allowFullScreen
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
