'use client';

import { useState, useEffect } from 'react';

interface CaptureStatus {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  sourceType: string;
  title?: string;
  summary?: string;
  topics?: string[];
  errorMessage?: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentCapture, setCurrentCapture] = useState<CaptureStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll for status updates
  useEffect(() => {
    if (
      !currentCapture ||
      currentCapture.status === 'complete' ||
      currentCapture.status === 'failed'
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${currentCapture.id}`);
        const data = await res.json();
        setCurrentCapture(data);

        if (data.status === 'complete' || data.status === 'failed') {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Status poll error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentCapture]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    setCurrentCapture(null);

    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, notes: notes || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to capture');
      }

      setCurrentCapture(data);
      setUrl('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  function getSourceIcon(sourceType: string) {
    switch (sourceType) {
      case 'twitter':
        return '𝕏';
      case 'instagram':
        return '📷';
      case 'linkedin':
        return '💼';
      case 'pinterest':
        return '📌';
      default:
        return '🌐';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Content Capture</h1>
          <p className="text-gray-600">Save and categorize content from around the web</p>
        </div>

        {/* Capture Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="mb-4">
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
              URL to capture
            </label>
            <input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://twitter.com/... or any URL"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why you're saving this..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !url}
            className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Capturing...
              </span>
            ) : (
              'Capture'
            )}
          </button>
        </form>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Current Capture Status */}
        {currentCapture && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getSourceIcon(currentCapture.sourceType)}</span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(currentCapture.status)}`}
                >
                  {currentCapture.status}
                </span>
              </div>
              {(currentCapture.status === 'pending' ||
                currentCapture.status === 'processing') && (
                <svg
                  className="animate-spin h-5 w-5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
            </div>

            {currentCapture.status === 'complete' && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  {currentCapture.title || 'Untitled'}
                </h3>
                {currentCapture.summary && (
                  <p className="text-gray-600 text-sm mb-3">{currentCapture.summary}</p>
                )}
                {currentCapture.topics && currentCapture.topics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {currentCapture.topics.map((topic) => (
                      <span
                        key={topic}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentCapture.status === 'failed' && currentCapture.errorMessage && (
              <p className="text-red-600 text-sm">{currentCapture.errorMessage}</p>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="text-center text-gray-500 text-sm">
          <p>Supports Twitter/X, Instagram, LinkedIn, Pinterest, and general web pages</p>
          <p className="mt-1">Content will be automatically categorized using AI</p>
        </div>
      </div>
    </main>
  );
}
