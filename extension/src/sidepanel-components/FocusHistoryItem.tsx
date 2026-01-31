import { motion } from 'framer-motion';
import { formatDuration } from '../utils/time';
import { getOpacityForIndex } from '../utils/opacity';
import type { FocusWithParsedData } from '~sidepanel/api/focus';

interface FocusHistoryItemProps {
  item: FocusWithParsedData;
  index: number;
}

/**
 * Format timestamp to relative time (e.g., "5 minutes ago", "2 hours ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }
}

export function FocusHistoryItem({ item, index }: FocusHistoryItemProps) {
  const opacity = getOpacityForIndex(index);
  const relativeTime = formatRelativeTime(item.last_updated);
  const duration = formatDuration(item.total_time);

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      style={{ opacity }}
      className="rounded-md bg-white p-3 border border-gray-200 transition-all hover:border-gray-300"
    >
      <div className="flex flex-col gap-1">
        {/* Focus item text */}
        <p 
          className="text-sm font-medium text-gray-900 truncate"
          title={item.focus_item}
        >
          {item.focus_item}
        </p>
        
        {/* Timestamp and duration */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{relativeTime}</span>
          <span className="text-gray-300">•</span>
          <span className="font-mono">{duration}</span>
        </div>

        {/* Screen reader description */}
        <span className="sr-only">
          Focused on {item.focus_item} {relativeTime} for {duration}
        </span>
      </div>
    </motion.li>
  );
}
