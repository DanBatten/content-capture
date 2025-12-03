'use client';

import { useState } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onFilterClick: () => void;
  placeholder?: string;
  hasActiveFilters?: boolean;
}

export function SearchBar({ 
  value, 
  onChange, 
  onFilterClick, 
  placeholder = 'Search archive...',
  hasActiveFilters = false
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="flex items-center gap-4">
      {/* Filter toggle button */}
      <button
        onClick={onFilterClick}
        className={`
          font-mono-ui text-sm transition-colors flex items-center gap-2
          ${hasActiveFilters 
            ? 'text-[var(--foreground)]' 
            : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
          }
        `}
      >
        <span>{hasActiveFilters ? '[+]' : '[ ]'}</span>
        <span>Filters</span>
        {hasActiveFilters && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
        )}
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-[var(--panel-border)]" />

      {/* Search input */}
      <div className={`flex-1 relative transition-all duration-200`}>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className={`w-4 h-4 transition-colors ${isFocused ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className={`
            w-full pl-10 pr-4 py-2.5
            bg-transparent
            border-b border-transparent
            text-[var(--foreground)]
            placeholder-[var(--foreground-muted)]
            font-mono-ui text-sm
            outline-none
            transition-all duration-200
            ${isFocused ? 'border-[var(--foreground)]' : 'hover:border-[var(--panel-border)]'}
          `}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <span className="font-mono-ui text-xs">[ clear ]</span>
          </button>
        )}
      </div>
    </div>
  );
}
