'use client';

import { useState, useCallback } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onMenuClick: () => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, onMenuClick, placeholder = 'Search your archive...' }: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="flex items-center gap-3">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
      >
        <svg className="w-6 h-6 text-neutral-700 dark:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Search input */}
      <div className={`flex-1 relative transition-all duration-200 ${isFocused ? 'scale-[1.01]' : ''}`}>
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg
            className={`w-5 h-5 transition-colors ${isFocused ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
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
            w-full pl-12 pr-4 py-3
            bg-neutral-100 dark:bg-neutral-800
            border-2 border-transparent
            rounded-xl
            text-neutral-900 dark:text-white
            placeholder-neutral-500
            outline-none
            transition-all duration-200
            ${isFocused ? 'bg-white dark:bg-neutral-900 border-neutral-900 dark:border-white shadow-lg' : 'hover:bg-neutral-200/70 dark:hover:bg-neutral-700/70'}
          `}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
