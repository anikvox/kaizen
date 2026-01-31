import { motion } from 'framer-motion';
import type { FocusWithParsedData } from 'neuropilot-api';
import { FocusHistoryItem as HistoryItem } from './FocusHistoryItem';

interface FocusHistorySectionProps {
  historyItems: FocusWithParsedData[];
  isLoading: boolean;
}

export function FocusHistorySection({ historyItems, isLoading }: FocusHistorySectionProps) {
  // Loading state with skeleton loaders
  if (isLoading) {
    return (
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Recent Focus Activities
        </h3>
        <ul className="space-y-2" aria-label="Recent Focus Activities">
          {[...Array(3)].map((_, index) => (
            <li key={index} className="animate-pulse">
              <div className="h-12 bg-gray-200 rounded"></div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Empty state
  if (historyItems.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg bg-gray-50 p-4 text-center"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Recent Focus Activities
        </h3>
        <p className="text-gray-500 text-sm">
          No focus history yet. Start focusing to build your history!
        </p>
      </motion.div>
    );
  }

  // Render last 5 items with progressive opacity
  const displayItems = historyItems.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="rounded-lg bg-gray-50 p-4"
      role="region"
      aria-label="Recent Focus Activities"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Recent Focus Activities
      </h3>
      <ul className="space-y-2" aria-label="Recent Focus Activities">
        {displayItems.map((item, index) => (
          <HistoryItem
            key={item.id}
            item={item}
            index={index}
          />
        ))}
      </ul>
    </motion.div>
  );
}
