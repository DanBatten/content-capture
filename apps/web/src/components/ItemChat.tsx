'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { UpgradePrompt } from './UpgradePrompt';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  sourcesAnalyzed?: number;
}

interface Source {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
}

interface ItemChatProps {
  itemId: string;
  itemTitle: string;
  itemTopics?: string[];
  userTier?: 'free' | 'pro';
}

// Process content to add links to source references
function linkifySourceReferences(content: string, sources: Source[]): string {
  if (!sources || sources.length === 0) return content;

  let processedContent = content;

  sources.forEach((source) => {
    if (source.author) {
      const authorPatterns = [
        new RegExp(`\\*\\*(${escapeRegex(source.author)}(?:'s)?)\\*\\*`, 'gi'),
        new RegExp(`\\*\\*(${escapeRegex(source.author)})\\*\\*`, 'gi'),
      ];

      authorPatterns.forEach((pattern) => {
        processedContent = processedContent.replace(pattern, (match) => {
          const text = match.slice(2, -2);
          return `**[${text}](${source.url})**`;
        });
      });
    }

    if (source.title) {
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

// Compact markdown components for modal context
const MarkdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-serif font-medium text-[var(--foreground)] mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-serif font-medium text-[var(--foreground)] mt-3 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-serif font-medium text-[var(--foreground)] mt-3 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside ml-4 mb-2 space-y-1 text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside ml-4 mb-2 space-y-1 text-sm">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
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
    <blockquote className="border-l-2 border-[var(--accent)] pl-3 my-2 italic text-[var(--foreground-muted)] text-sm">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-[var(--card-bg)] px-1 py-0.5 rounded text-xs font-mono">
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-[var(--card-bg)] p-2 rounded text-xs font-mono overflow-x-auto my-2">
        {children}
      </code>
    );
  },
};

export function ItemChat({ itemId, itemTitle, itemTopics = [], userTier }: ItemChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 100)}px`;
    }
  }, [input]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          itemId,
          conversationHistory: messages.slice(-6).map((m) => ({
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

  // Generate suggested prompts based on item
  const suggestions = useMemo(() => {
    const baseSuggestions = [
      'Summarize the key points',
      'What can I learn from this?',
      'How does this relate to other things I\'ve saved?',
    ];

    if (itemTopics.includes('AI') || itemTopics.includes('Research')) {
      return [
        'What are the main findings?',
        'What methodology was used?',
        'How can I apply this?',
      ];
    }

    if (itemTopics.includes('Design') || itemTopics.includes('Creative')) {
      return [
        'What design principles are shown here?',
        'How can I apply this to my work?',
        'What makes this effective?',
      ];
    }

    if (itemTopics.includes('Business') || itemTopics.includes('Startups')) {
      return [
        'What are the key takeaways?',
        'What strategy is being discussed?',
        'How can I implement this?',
      ];
    }

    return baseSuggestions;
  }, [itemTopics]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 min-h-[200px]">
        {messages.length === 0 && (
          <div className="py-6">
            <p className="text-[var(--foreground-muted)] font-mono-ui text-sm mb-4">
              Ask questions about &ldquo;{itemTitle.slice(0, 50)}{itemTitle.length > 50 ? '...' : ''}&rdquo;
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-2 py-1 text-xs font-mono-ui text-[var(--foreground-muted)] border border-[var(--panel-border)] rounded hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors"
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
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
                Analyzing content...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {userTier === 'free' ? (
        <div className="mt-3 pt-3 border-t border-[var(--panel-border)]">
          <UpgradePrompt context="item_chat" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 pt-3 border-t border-[var(--panel-border)]">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this content..."
              rows={1}
              className="flex-1 bg-transparent border border-[var(--panel-border)] rounded-lg px-3 py-2 font-mono-ui text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] outline-none focus:border-[var(--foreground)] transition-colors resize-none"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-3 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] font-mono-ui text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              Ask
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const processedContent = useMemo(() => {
    if (message.role === 'user' || !message.sources) {
      return message.content;
    }
    return linkifySourceReferences(message.content, message.sources);
  }, [message.content, message.sources, message.role]);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-[var(--foreground)] text-[var(--background)] rounded-xl rounded-br-sm px-3 py-2">
          <p className="font-mono-ui text-sm whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
          <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
            Response
            {message.sourcesAnalyzed && message.sourcesAnalyzed > 1 && (
              <span className="ml-1">[+{message.sourcesAnalyzed - 1} related]</span>
            )}
          </span>
        </div>

        <div className="font-mono-ui text-[var(--foreground)] prose-sm">
          <ReactMarkdown components={MarkdownComponents}>{processedContent}</ReactMarkdown>
        </div>

        {message.sources && message.sources.length > 1 && (
          <div className="mt-3 pt-2 border-t border-[var(--panel-border)]">
            <p className="font-mono-ui text-xs text-[var(--foreground-muted)] mb-1">Related:</p>
            <div className="space-y-0.5">
              {message.sources.slice(1, 4).map((source, j) => (
                <a
                  key={j}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-mono-ui text-xs text-[var(--accent)] hover:underline truncate"
                >
                  {source.title || source.url}
                </a>
              ))}
              {message.sources.length > 4 && (
                <span className="font-mono-ui text-xs text-[var(--foreground-muted)]">
                  +{message.sources.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
