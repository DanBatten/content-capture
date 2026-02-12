'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { KnowledgeOverview } from '@/components/KnowledgeOverview';
import { ChatInterface } from '@/components/ChatInterface';
import { useAuth } from '@/components/AuthProvider';
import { ContentCard } from '@/components/ContentCard';
import { ContentModal } from '@/components/ContentModal';
import type { ContentItem } from '@/types/content';

interface TopicPageProps {
  params: Promise<{ topic: string }>;
}

interface TopicData {
  topic: string;
  itemCount: number;
  items: ContentItem[];
  overview: {
    text: string;
    suggestedPrompts: string[];
    generatedAt: string;
  } | null;
  relatedTopics: Array<{ name: string; count: number }>;
}

export default function TopicPage({ params }: TopicPageProps) {
  const { userTier } = useAuth();
  const { topic } = use(params);
  const decodedTopic = decodeURIComponent(topic);

  const [data, setData] = useState<TopicData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingOverview, setIsGeneratingOverview] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [chatPrompt, setChatPrompt] = useState('');

  // Fetch topic data
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/knowledge/${encodeURIComponent(decodedTopic)}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const topicData = await response.json();
        setData(topicData);

        // Auto-generate overview if not available
        if (!topicData.overview) {
          generateOverview(false);
        }
      } catch (error) {
        console.error('Failed to fetch topic data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [decodedTopic]);

  // Generate AI overview
  const generateOverview = useCallback(
    async (forceRefresh: boolean) => {
      setIsGeneratingOverview(true);
      try {
        const response = await fetch('/api/knowledge/overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: decodedTopic, forceRefresh }),
        });

        if (!response.ok) throw new Error('Failed to generate overview');
        const result = await response.json();

        setData((prev) =>
          prev
            ? {
                ...prev,
                overview: {
                  text: result.overview,
                  suggestedPrompts: result.suggestedPrompts,
                  generatedAt: result.generatedAt,
                },
              }
            : null
        );
      } catch (error) {
        console.error('Failed to generate overview:', error);
      } finally {
        setIsGeneratingOverview(false);
      }
    },
    [decodedTopic]
  );

  // Handle prompt click
  const handlePromptClick = (prompt: string) => {
    setChatPrompt(prompt);
    // Scroll to chat
    document.getElementById('topic-chat')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-10 bg-[var(--card-bg)] rounded w-64" />
            <div className="h-48 bg-[var(--card-bg)] rounded-xl" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[4/3] bg-[var(--card-bg)] rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/knowledge"
            className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            ← Back to Knowledge
          </Link>
          <div className="mt-8 text-center">
            <h1 className="font-serif text-2xl text-[var(--foreground)] mb-4">
              Topic not found
            </h1>
            <p className="text-[var(--foreground-muted)]">
              No content found for &ldquo;{decodedTopic}&rdquo;
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--panel-border)] bg-[var(--panel-bg)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4 mb-2">
            <Link
              href="/knowledge"
              className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              ← Knowledge
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-3xl text-[var(--foreground)]">{decodedTopic}</h1>
              <p className="font-mono-ui text-sm text-[var(--foreground-muted)] mt-1">
                {data.itemCount} {data.itemCount === 1 ? 'item' : 'items'} saved
              </p>
            </div>
            {data.relatedTopics.length > 0 && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
                  Related:
                </span>
                {data.relatedTopics.slice(0, 3).map((t) => (
                  <Link
                    key={t.name}
                    href={`/knowledge/${encodeURIComponent(t.name)}`}
                    className="px-2 py-1 text-xs font-mono-ui border border-[var(--panel-border)] rounded hover:border-[var(--foreground)] transition-colors"
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* AI Overview Section */}
        <section className="mb-8">
          <KnowledgeOverview
            topic={decodedTopic}
            overview={data.overview?.text || null}
            suggestedPrompts={data.overview?.suggestedPrompts || []}
            isLoading={isGeneratingOverview}
            onPromptClick={handlePromptClick}
            onRegenerateClick={() => generateOverview(true)}
          />
        </section>

        {/* Scoped Chat Section */}
        <section id="topic-chat" className="mb-12">
          <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
            Chat about {decodedTopic}
          </h2>
          <div className="bg-[var(--panel-bg)] rounded-xl p-6">
            <ChatInterface
              topicFilter={decodedTopic}
              initialPrompt={chatPrompt}
              userTier={userTier}
            />
          </div>
        </section>

        {/* Items Grid */}
        <section>
          <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
            Saved Content ({data.itemCount})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.items.map((item, index) => (
              <ContentCard
                key={item.id}
                item={item}
                onClick={() => setSelectedItem(item)}
                size={index % 7 === 0 ? 'large' : 'medium'}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Content Modal */}
      <ContentModal item={selectedItem} onClose={() => setSelectedItem(null)} userTier={userTier} />
    </main>
  );
}
