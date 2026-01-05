'use client';

import type { Note } from '@/types/content';
import { getTopicColor } from './ContentCard';

interface NoteCardProps {
  note: Note;
  onClick?: () => void;
  index?: number;
}

// GCS bucket for note backgrounds
const GCS_BUCKET = 'web-scrapbook-content-capture-media';

function getBackgroundUrl(backgroundImage: string | null): string {
  if (!backgroundImage) {
    // Fallback to first background
    return `https://storage.googleapis.com/${GCS_BUCKET}/note-backgrounds/Photo-01.jpg`;
  }
  return `https://storage.googleapis.com/${GCS_BUCKET}/${backgroundImage}`;
}

export function NoteCard({ note, onClick, index = 0 }: NoteCardProps) {
  const backgroundUrl = getBackgroundUrl(note.backgroundImage);
  const displayTitle = note.shortTitle || note.title?.slice(0, 32) || 'Note';

  // Stagger class for animation
  const staggerClass = `stagger-${Math.min(index % 8 + 1, 8)}`;

  // Status indicator for pending/failed notes
  const isPending = note.status === 'pending' || note.status === 'processing';
  const isFailed = note.status === 'failed';

  return (
    <article
      className={`
        group flex flex-col overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        hover:-translate-y-1 hover:shadow-xl
        bg-[var(--card-bg)]
        opacity-0 animate-fade-in-up ${staggerClass}
        col-span-1 row-span-1
      `}
      onClick={onClick}
    >
      {/* Image section with text overlay */}
      <div className="relative w-full aspect-[4/3] flex-shrink-0 overflow-hidden">
        {/* Background image */}
        <img
          src={backgroundUrl}
          alt="Note background"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        {/* Note badge */}
        <div className="absolute top-3 left-3">
          <span className="
            w-7 h-7 rounded-full flex items-center justify-center
            bg-amber-500 text-white text-xs font-medium
            shadow-sm
          ">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </span>
        </div>

        {/* Status indicator */}
        {(isPending || isFailed) && (
          <div className="absolute top-3 right-3">
            <span className={`
              px-2 py-1 rounded text-xs font-medium
              ${isPending ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'}
            `}>
              {isPending ? 'Processing...' : 'Failed'}
            </span>
          </div>
        )}

        {/* Short title overlay */}
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="
            text-xl font-bold text-yellow-300
            drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]
            line-clamp-2 leading-tight
          ">
            {displayTitle}
          </h3>
        </div>
      </div>

      {/* Text content section */}
      <div className="flex flex-col p-4 gap-1.5 flex-grow">
        {/* Full title if different from short title */}
        {note.title && note.title !== note.shortTitle && (
          <h4 className="text-[var(--foreground)] font-medium text-sm leading-snug line-clamp-2">
            {note.title}
          </h4>
        )}

        {/* Summary or cleaned text preview */}
        {(note.summary || note.cleanedText) && (
          <p className="text-[var(--foreground-muted)] text-xs line-clamp-2">
            {note.summary || note.cleanedText?.slice(0, 150)}
          </p>
        )}

        {/* Topics */}
        {note.topics && note.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
            {note.topics.slice(0, 2).map((topic) => (
              <span
                key={topic}
                className={`px-2 py-0.5 text-xs font-mono-ui ${getTopicColor(topic)}`}
              >
                {topic}
              </span>
            ))}
            {note.topics.length > 2 && (
              <span className="px-2 py-0.5 text-[var(--foreground-muted)] text-xs font-mono-ui">
                +{note.topics.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
