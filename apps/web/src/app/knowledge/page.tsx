'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopicCard, TopicCardSmall } from '@/components/TopicCard';
import { TagSelector } from '@/components/TagSelector';
import { ChatInterface } from '@/components/ChatInterface';

interface TopicStat {
  topic_name: string;
  item_count: number;
  representative_image: string | null;
  latest_item_date: string | null;
}

export default function KnowledgePage() {
  const router = useRouter();
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [pinnedTopics, setPinnedTopics] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllTopics, setShowAllTopics] = useState(false);

  // Fetch topic data
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/knowledge');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setTopics(data.topics || []);
        setPinnedTopics(data.pinnedTopics || []);
      } catch (error) {
        console.error('Failed to fetch knowledge data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Top 4 topics: pinned first, then by count
  const topTopics = useMemo(() => {
    const pinned = pinnedTopics
      .map((name) => topics.find((t) => t.topic_name === name))
      .filter(Boolean) as TopicStat[];
    const unpinned = topics
      .filter((t) => !pinnedTopics.includes(t.topic_name))
      .slice(0, 4 - pinned.length);
    return [...pinned, ...unpinned].slice(0, 4);
  }, [topics, pinnedTopics]);

  // Remaining topics for "all topics" grid
  const remainingTopics = useMemo(() => {
    const topNames = new Set(topTopics.map((t) => t.topic_name));
    return topics.filter((t) => !topNames.has(t.topic_name));
  }, [topics, topTopics]);

  // Handle pin toggle
  const handlePinToggle = async (topicName: string) => {
    const newPinned = pinnedTopics.includes(topicName)
      ? pinnedTopics.filter((t) => t !== topicName)
      : [...pinnedTopics, topicName].slice(0, 4); // Max 4 pinned

    setPinnedTopics(newPinned);

    // Update server
    try {
      await fetch('/api/knowledge/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinnedTopics: newPinned }),
      });
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  };

  // Handle tag selection
  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Navigate to topic or create custom view
  const handleTopicClick = (topicName: string) => {
    router.push(`/knowledge/${encodeURIComponent(topicName)}`);
  };

  // Handle create knowledge base
  const handleCreateKnowledgeBase = async (name: string, tags: string[]) => {
    // For now, navigate to a combined view
    // In future, could save as custom knowledge base
    const encodedTags = tags.map((t) => encodeURIComponent(t)).join(',');
    router.push(`/knowledge/custom?name=${encodeURIComponent(name)}&topics=${encodedTags}`);
  };

  // Tags for selector
  const tagOptions = useMemo(() => {
    return topics.map((t) => ({ name: t.topic_name, count: t.item_count }));
  }, [topics]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-10 bg-[var(--card-bg)] rounded w-48" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[4/3] bg-[var(--card-bg)] rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--panel-border)] bg-[var(--panel-bg)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/archive"
              className="font-mono-ui text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              ← Archive
            </Link>
            <h1 className="font-serif text-2xl text-[var(--foreground)]">Knowledge</h1>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Topics Section */}
        <section className="mb-12">
          <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
            Top Knowledge Bases
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {topTopics.map((topic) => (
              <TopicCard
                key={topic.topic_name}
                topic={topic.topic_name}
                itemCount={topic.item_count}
                representativeImage={topic.representative_image}
                isPinned={pinnedTopics.includes(topic.topic_name)}
                onClick={() => handleTopicClick(topic.topic_name)}
                onPinToggle={() => handlePinToggle(topic.topic_name)}
              />
            ))}
          </div>
        </section>

        {/* Tag Selector Section */}
        <section className="mb-12">
          <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
            Explore by Topic
          </h2>
          <TagSelector
            availableTags={tagOptions}
            selectedTags={selectedTags}
            onTagToggle={handleTagToggle}
            onCreateKnowledgeBase={handleCreateKnowledgeBase}
          />

          {/* Navigate to selected tag if only one is selected */}
          {selectedTags.length === 1 && (
            <button
              onClick={() => handleTopicClick(selectedTags[0])}
              className="mt-4 px-4 py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg font-mono-ui text-sm hover:opacity-90 transition-opacity"
            >
              Open {selectedTags[0]} Knowledge Base →
            </button>
          )}
        </section>

        {/* All Topics Section (collapsed by default) */}
        {remainingTopics.length > 0 && (
          <section className="mb-12">
            <button
              onClick={() => setShowAllTopics(!showAllTopics)}
              className="flex items-center gap-2 font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-4"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showAllTopics ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              All Topics ({remainingTopics.length})
            </button>

            {showAllTopics && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {remainingTopics.map((topic) => (
                  <TopicCardSmall
                    key={topic.topic_name}
                    topic={topic.topic_name}
                    itemCount={topic.item_count}
                    onClick={() => handleTopicClick(topic.topic_name)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Generic Chat Section */}
        <section>
          <div className="border-t border-[var(--panel-border)] pt-8">
            <h2 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-4">
              Chat with Your Entire Archive
            </h2>
            <div className="bg-[var(--panel-bg)] rounded-xl p-6">
              <ChatInterface />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
