'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  mode?: 'standard' | 'deep_research';
  sourcesAnalyzed?: number;
}

interface Source {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    const currentDeepResearch = deepResearch;
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          deepResearch: currentDeepResearch,
          conversationHistory: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
          mode: data.mode,
          sourcesAnalyzed: data.sourcesAnalyzed,
        },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[400px] max-h-[800px]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <h3 className="font-serif text-xl text-[var(--foreground)] mb-2">
              Ask your knowledge base
            </h3>
            <p className="text-[var(--foreground-muted)] font-mono-ui text-sm max-w-md mx-auto">
              I can search through your saved content and answer questions based on what you&apos;ve
              archived. Try asking about topics, finding specific articles, or exploring themes
              across your saved content.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                'What are the key insights from my AI research?',
                'Synthesize learnings from my saved design articles',
                'What action items can I extract from my archive?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-1.5 text-xs font-mono-ui text-[var(--foreground-muted)] border border-[var(--panel-border)] rounded hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] ${
                msg.role === 'user'
                  ? 'bg-[var(--foreground)] text-[var(--background)] rounded-2xl rounded-br-sm px-4 py-3'
                  : ''
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
                    Archive
                    {msg.mode === 'deep_research' && (
                      <span className="ml-2 text-[var(--accent)]">
                        [Deep Research - {msg.sourcesAnalyzed} sources analyzed]
                      </span>
                    )}
                    {msg.mode === 'standard' && msg.sourcesAnalyzed && (
                      <span className="ml-2">
                        [{msg.sourcesAnalyzed} sources]
                      </span>
                    )}
                  </span>
                </div>
              )}
              <p className="font-mono-ui text-sm whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--panel-border)]">
                  <p className="font-mono-ui text-xs text-[var(--foreground-muted)] mb-2">
                    Sources:
                  </p>
                  <div className="space-y-1">
                    {msg.sources.map((source, j) => (
                      <a
                        key={j}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block font-mono-ui text-xs text-[var(--accent)] hover:underline truncate"
                      >
                        {source.title || source.url}
                        {source.author && (
                          <span className="text-[var(--foreground-muted)]">
                            {' '}
                            — {source.author}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
                  {deepResearch
                    ? 'Conducting deep research across your archive...'
                    : 'Searching and synthesizing...'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-[var(--panel-border)]">
        {/* Deep Research Toggle */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setDeepResearch(!deepResearch)}
            className={`flex items-center gap-2 font-mono-ui text-xs transition-colors ${
              deepResearch
                ? 'text-[var(--accent)]'
                : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <span className="w-4 h-4 border rounded flex items-center justify-center">
              {deepResearch && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </span>
            <span>Deep Research Mode</span>
          </button>
          {deepResearch && (
            <span className="font-mono-ui text-xs text-[var(--accent)]">
              Analyzes 20+ sources with comprehensive synthesis
            </span>
          )}
        </div>

        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              deepResearch
                ? 'Ask for deep analysis, synthesis, or action items...'
                : 'Ask about your saved content...'
            }
            rows={1}
            className={`flex-1 bg-transparent border rounded-lg px-4 py-3 font-mono-ui text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none transition-colors resize-none ${
              deepResearch
                ? 'border-[var(--accent)] focus:border-[var(--accent)]'
                : 'border-[var(--panel-border)] focus:border-[var(--foreground)]'
            }`}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`px-4 py-3 rounded-lg font-mono-ui text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity ${
              deepResearch
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--foreground)] text-[var(--background)]'
            }`}
          >
            {deepResearch ? 'Research' : 'Send'}
          </button>
        </div>
        <p className="mt-2 font-mono-ui text-xs text-[var(--foreground-muted)]">
          {deepResearch
            ? 'Deep research takes longer but provides comprehensive analysis'
            : 'Press Enter to send, Shift+Enter for new line'}
        </p>
      </form>
    </div>
  );
}
