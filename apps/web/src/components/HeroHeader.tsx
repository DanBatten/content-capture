'use client';

import { FolderIcon } from './FolderIcon';

interface HeroHeaderProps {
  isVisible?: boolean;
}

export function HeroHeader({ isVisible = true }: HeroHeaderProps) {
  if (!isVisible) return null;

  return (
    <section className="px-6 sm:px-8 lg:px-12 py-12 sm:py-16 lg:py-24">
      <div className="max-w-5xl">
        {/* Main title with folder icon */}
        <div className="flex items-center gap-4 sm:gap-6 lg:gap-8 mb-6">
          <h1 className="font-pixel text-[clamp(3rem,12vw,8rem)] leading-[0.85] tracking-tight text-[var(--foreground)]">
            ARCHIVE
          </h1>
          <FolderIcon size="hero" className="text-[var(--foreground)]" />
        </div>
        
        {/* Decorative arrows */}
        <div className="font-mono-ui text-sm sm:text-base text-[var(--foreground)] opacity-70 mb-2">
          &gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;
        </div>
        
        {/* Tagline */}
        <p className="font-mono-ui text-sm sm:text-base text-[var(--foreground)]">
          An index of interesting things
        </p>
      </div>
    </section>
  );
}

