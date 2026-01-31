import { motion } from 'framer-motion';
import type { FocusWithParsedData } from 'neuropilot-api';
import { formatTime } from '../utils/time';

interface CurrentFocusSectionProps {
  focusData: FocusWithParsedData | null;
  isLoading: boolean;
}

export function CurrentFocusSection({ focusData, isLoading }: CurrentFocusSectionProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg bg-gray-50 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-3"></div>
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    );
  }

  // No active focus state
  if (!focusData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg bg-gray-50 p-6 text-center"
      >
        <p className="text-gray-500 text-base">
          Start focusing to see your progress
        </p>
      </motion.div>
    );
  }

  // Active focus state
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg bg-linear-to-br from-blue-50 to-indigo-50 p-6"
      role="region"
      aria-label="Current Focus"
    >
      <div className="space-y-3">
        {/* Focus item text */}
        <h2 
          className="text-2xl font-semibold text-gray-900 leading-tight truncate"
          title={focusData.focus_item}
        >
          {focusData.focus_item}
        </h2>

        {/* Total focus time with ARIA live region */}
        <div 
          className="flex items-center gap-2"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-sm text-gray-600 font-medium">
            Total Focus Time:
          </span>
          <span className="text-xl font-mono font-semibold text-indigo-700">
            {formatTime(focusData.total_time)}
          </span>
        </div>

        {/* Screen reader description */}
        <span className="sr-only">
          Currently focusing on {focusData.focus_item} for {formatTime(focusData.total_time)}
        </span>
      </div>
    </motion.div>
  );
}
