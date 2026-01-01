'use client';

interface TopicCardProps {
  topic: string;
  itemCount: number;
  representativeImage: string | null;
  isPinned: boolean;
  onClick: () => void;
  onPinToggle: () => void;
}

// Deterministic colors based on topic name
const topicColors = [
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-green-600',
  'from-orange-500 to-red-600',
];

function getTopicColor(topic: string): string {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = ((hash << 5) - hash) + topic.charCodeAt(i);
    hash |= 0;
  }
  return topicColors[Math.abs(hash) % topicColors.length];
}

export function TopicCard({
  topic,
  itemCount,
  representativeImage,
  isPinned,
  onClick,
  onPinToggle,
}: TopicCardProps) {
  const gradientColor = getTopicColor(topic);

  return (
    <div
      onClick={onClick}
      className="group relative aspect-[4/3] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
    >
      {/* Background */}
      {representativeImage ? (
        <img
          src={representativeImage}
          alt={topic}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradientColor}`} />
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Pin button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPinToggle();
        }}
        className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
          isPinned
            ? 'bg-[var(--accent)] text-white'
            : 'bg-white/20 text-white/70 hover:bg-white/30 hover:text-white'
        }`}
        title={isPinned ? 'Unpin topic' : 'Pin topic'}
      >
        <svg
          className="w-4 h-4"
          fill={isPinned ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
      </button>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3 className="text-white font-medium text-lg mb-1">{topic}</h3>
        <p className="text-white/70 font-mono-ui text-sm">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* Hover effect */}
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors" />
    </div>
  );
}

// Smaller version for "all topics" grid
export function TopicCardSmall({
  topic,
  itemCount,
  onClick,
}: {
  topic: string;
  itemCount: number;
  onClick: () => void;
}) {
  const gradientColor = getTopicColor(topic);

  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 rounded-lg bg-gradient-to-br ${gradientColor} text-white text-left transition-all hover:scale-[1.02] hover:shadow-md`}
    >
      <p className="font-medium text-sm truncate">{topic}</p>
      <p className="text-white/70 font-mono-ui text-xs mt-0.5">{itemCount}</p>
    </button>
  );
}
