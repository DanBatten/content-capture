'use client';

import { useEffect, useState } from 'react';
import type { Note } from '@/types/content';

interface NoteModalProps {
  note: Note | null;
  onClose: () => void;
}

// Topic colors (same as ContentModal)
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

function getTagColor(tag: string): typeof topicColors[0] {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return topicColors[Math.abs(hash) % topicColors.length];
}

const GCS_BUCKET = 'web-scrapbook-content-capture-media';

function getBackgroundUrl(backgroundImage: string | null): string {
  if (!backgroundImage) {
    return `https://storage.googleapis.com/${GCS_BUCKET}/note-backgrounds/Photo-01.jpg`;
  }
  // Normalize path (fix lowercase 'photo' to 'Photo')
  const normalized = backgroundImage.replace(/note-backgrounds\/photo-/i, 'note-backgrounds/Photo-');
  return `https://storage.googleapis.com/${GCS_BUCKET}/${normalized}`;
}

export function NoteModal({ note, onClose }: NoteModalProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);

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
    if (note) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [note]);

  if (!note) return null;

  const backgroundUrl = getBackgroundUrl(note.backgroundImage);
  const hasExpanded = !!note.expandedText;
  const hasWarnings = note.llmWarnings && note.llmWarnings.length > 0;
  const displayText = showExpanded && note.expandedText
    ? note.expandedText
    : note.cleanedText || note.rawText;

  const formattedDate = note.createdAt
    ? new Date(note.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-[var(--background)] overflow-hidden flex flex-col animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with background image */}
        <div className="relative h-48 flex-shrink-0">
          <img
            src={backgroundUrl}
            alt="Note background"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Note badge */}
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1 rounded-full bg-amber-500 text-white text-sm font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Note
            </span>
          </div>

          {/* Title overlay */}
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-2xl font-bold text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {note.shortTitle || note.title || 'Note'}
            </h1>
            {note.title && note.title !== note.shortTitle && (
              <p className="text-white/80 text-sm mt-1">{note.title}</p>
            )}
          </div>
        </div>

        {/* Content section - scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary */}
          {note.summary && (
            <div className="text-[var(--foreground-muted)] italic border-l-2 border-[var(--accent)] pl-4">
              {note.summary}
            </div>
          )}

          {/* Warnings (if any) */}
          {hasWarnings && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-600 font-medium text-sm mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                Notes from AI
              </div>
              <ul className="text-sm text-[var(--foreground-muted)] space-y-1">
                {note.llmWarnings!.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Toggle buttons for expanded/original */}
          {(hasExpanded || note.rawText !== note.cleanedText) && (
            <div className="flex gap-2">
              {hasExpanded && (
                <button
                  onClick={() => setShowExpanded(!showExpanded)}
                  className={`
                    px-3 py-1.5 text-sm rounded-lg transition-colors
                    ${showExpanded
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--card-bg)] text-[var(--foreground-muted)] hover:bg-[var(--card-bg-hover)]'
                    }
                  `}
                >
                  {showExpanded ? 'Show Cleaned' : 'Show Expanded'}
                </button>
              )}
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className={`
                  px-3 py-1.5 text-sm rounded-lg transition-colors
                  ${showOriginal
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--card-bg)] text-[var(--foreground-muted)] hover:bg-[var(--card-bg-hover)]'
                  }
                `}
              >
                {showOriginal ? 'Hide Original' : 'Show Original'}
              </button>
            </div>
          )}

          {/* Main text content */}
          <div className="prose prose-sm max-w-none text-[var(--foreground)]">
            <p className="whitespace-pre-wrap leading-relaxed">{displayText}</p>
          </div>

          {/* Original text (collapsible) */}
          {showOriginal && note.rawText !== displayText && (
            <div className="bg-[var(--card-bg)] rounded-lg p-4 mt-4">
              <div className="text-xs text-[var(--foreground-muted)] font-medium uppercase mb-2">
                Original Note
              </div>
              <p className="text-sm text-[var(--foreground-muted)] whitespace-pre-wrap">
                {note.rawText}
              </p>
            </div>
          )}

          {/* Topics */}
          {note.topics && note.topics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {note.topics.map((topic) => {
                const color = getTagColor(topic);
                return (
                  <span
                    key={topic}
                    className={`px-3 py-1 text-sm font-medium rounded ${color.bg} ${color.text}`}
                  >
                    {topic}
                  </span>
                );
              })}
            </div>
          )}

          {/* Metadata footer */}
          <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)] pt-4 border-t border-[var(--card-bg)]">
            <span>{formattedDate}</span>
            {note.status !== 'complete' && (
              <span className={`
                px-2 py-1 rounded
                ${note.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}
              `}>
                {note.status === 'failed' ? `Failed: ${note.errorMessage || 'Unknown error'}` : 'Processing...'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
