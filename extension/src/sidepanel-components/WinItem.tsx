import { motion } from 'framer-motion';
import { Trophy, Flame, Award } from 'lucide-react';
import type { WinItem as WinItemType } from '../types/wins';

interface WinItemProps {
  item: WinItemType;
  index: number;
}

/**
 * Get icon component based on win type
 */
function getWinIcon(type: WinItemType['type']) {
  switch (type) {
    case 'milestone':
      return Trophy;
    case 'streak':
      return Flame;
    case 'achievement':
      return Award;
    default:
      return Award;
  }
}

/**
 * Get badge color based on win type
 */
function getBadgeColor(type: WinItemType['type']) {
  switch (type) {
    case 'milestone':
      return 'bg-yellow-100 text-yellow-800';
    case 'streak':
      return 'bg-orange-100 text-orange-800';
    case 'achievement':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get descriptive label for win type
 */
function getWinTypeLabel(type: WinItemType['type']) {
  switch (type) {
    case 'milestone':
      return 'Milestone';
    case 'streak':
      return 'Streak';
    case 'achievement':
      return 'Achievement';
    default:
      return 'Win';
  }
}

/**
 * Format timestamp to relative time
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function WinItem({ item, index }: WinItemProps) {
  const Icon = getWinIcon(item.type);
  const badgeColor = getBadgeColor(item.type);
  const typeLabel = getWinTypeLabel(item.type);
  const timeAgo = formatTimeAgo(item.timestamp);

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="flex items-start gap-3 p-2 rounded-lg hover:bg-white transition-colors"
    >
      {/* Icon with badge color */}
      <div className={`shrink-0 p-2 rounded-full ${badgeColor}`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
      </div>

      {/* Win content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {item.text}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}
            aria-label={`Win type: ${typeLabel}`}
          >
            {typeLabel}
          </span>
          <span className="text-xs text-gray-500" aria-label={`Earned ${timeAgo}`}>
            {timeAgo}
          </span>
        </div>
      </div>
    </motion.li>
  );
}
