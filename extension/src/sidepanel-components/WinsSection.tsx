import { motion } from 'framer-motion';
import type { WinItem } from '../types/wins';
import { WinItem as WinItemComponent } from './WinItem';

interface WinsSectionProps {
  wins: WinItem[];
  isLoading: boolean;
}

export function WinsSection({ wins, isLoading }: WinsSectionProps) {
  // Loading state with skeleton loaders
  if (isLoading) {
    return (
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Recent Wins
        </h3>
        <ul className="space-y-2" aria-label="Recent Wins">
          {[...Array(2)].map((_, index) => (
            <li key={index} className="animate-pulse">
              <div className="h-16 bg-gray-200 rounded-lg"></div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Empty state with encouraging message
  if (wins.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg bg-gray-50 p-4 text-center"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Recent Wins
        </h3>
        <p className="text-gray-500 text-sm">
          Keep focusing to earn your first win!
        </p>
      </motion.div>
    );
  }

  // Display 2-3 recent wins in compact format
  const displayWins = wins.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="rounded-lg bg-gray-50 p-4"
      role="region"
      aria-label="Recent Wins"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Recent Wins
      </h3>
      <ul className="space-y-2" aria-label="Recent Wins">
        {displayWins.map((win, index) => (
          <WinItemComponent
            key={win.id}
            item={win}
            index={index}
          />
        ))}
      </ul>
    </motion.div>
  );
}
