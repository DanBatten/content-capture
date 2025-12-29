'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

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

// Process content to add links to source references
function linkifySourceReferences(content: string, sources: Source[]): string {
  if (!sources || sources.length === 0) return content;

  let processedContent = content;

  // Create patterns for each source
  sources.forEach((source) => {
    // Link author names (e.g., **Clem's observation** or Carlos Perez's finding)
    if (source.author) {
      // Match author name with possessive or standalone, with or without bold
      const authorPatterns = [
        // Bold with possessive: **Author's**
        new RegExp(`\\*\\*(${escapeRegex(source.author)}(?:'s)?)\\*\\*`, 'gi'),
        // Bold standalone: **Author**
        new RegExp(`\\*\\*(${escapeRegex(source.author)})\\*\\*`, 'gi'),
        // Non-bold with possessive at start of sentence or after space
        new RegExp(`(^|\\s)(${escapeRegex(source.author)}'s)`, 'gi'),
      ];

      authorPatterns.forEach((pattern) => {
        processedContent = processedContent.replace(pattern, (match, p1, p2) => {
          // Handle different capture groups based on pattern
          if (match.startsWith('**')) {
            const text = match.slice(2, -2); // Remove ** from both ends
            return `**[${text}](${source.url})**`;
          } else {
            // Non-bold match - p1 is whitespace/start, p2 is the name
            return `${p1}[${p2}](${source.url})`;
          }
        });
      });
    }

    // Link article/source titles when mentioned in quotes or as references
    if (source.title) {
      // Match quoted titles
      const titlePattern = new RegExp(`"(${escapeRegex(source.title.slice(0, 50))}[^"]*)"`, 'gi');
      processedContent = processedContent.replace(titlePattern, (match, p1) => {
        return `"[${p1}](${source.url})"`;
      });
    }
  });

  return processedContent;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Custom components for markdown rendering
const MarkdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-serif font-medium text-[var(--foreground)] mt-6 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-serif font-medium text-[var(--foreground)] mt-5 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-serif font-medium text-[var(--foreground)] mt-4 mb-2 first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-3 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside ml-5 mb-3 space-y-1 text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside ml-5 mb-3 space-y-1 text-sm">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent)] hover:underline"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-[var(--accent)] pl-4 my-3 italic text-[var(--foreground-muted)]">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-[var(--card-bg)] px-1.5 py-0.5 rounded text-xs font-mono">
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-[var(--card-bg)] p-3 rounded text-xs font-mono overflow-x-auto my-3">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-[var(--card-bg)] p-3 rounded overflow-x-auto my-3 text-xs">
      {children}
    </pre>
  ),
};

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
          <MessageBubble key={i} message={msg} />
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

// Separate component for message bubble to use useMemo effectively
function MessageBubble({ message }: { message: Message }) {
  // Process content to add source links
  const processedContent = useMemo(() => {
    if (message.role === 'user' || !message.sources) {
      return message.content;
    }
    return linkifySourceReferences(message.content, message.sources);
  }, [message.content, message.sources, message.role]);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-[var(--foreground)] text-[var(--background)] rounded-2xl rounded-br-sm px-4 py-3">
          <p className="font-mono-ui text-sm whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
          <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
            Archive
            {message.mode === 'deep_research' && (
              <span className="ml-2 text-[var(--accent)]">
                [Deep Research - {message.sourcesAnalyzed} sources analyzed]
              </span>
            )}
            {message.mode === 'standard' && message.sourcesAnalyzed && (
              <span className="ml-2">[{message.sourcesAnalyzed} sources]</span>
            )}
          </span>
        </div>

        {/* Markdown rendered content */}
        <div className="font-mono-ui text-[var(--foreground)] prose-sm">
          <ReactMarkdown components={MarkdownComponents}>{processedContent}</ReactMarkdown>
        </div>

        {/* Sources section */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[var(--panel-border)]">
            <p className="font-mono-ui text-xs text-[var(--foreground-muted)] mb-2">Sources:</p>
            <div className="space-y-1">
              {message.sources.map((source, j) => (
                <a
                  key={j}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-mono-ui text-xs text-[var(--accent)] hover:underline truncate"
                >
                  {source.title || source.url}
                  {source.author && (
                    <span className="text-[var(--foreground-muted)]"> — {source.author}</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
