/**
 * Calculate progressive opacity for focus history items
 * Creates a fading effect where recent items are more visible
 * 
 * @param index - Zero-based index of the item (0 = most recent)
 * @returns Opacity value between 0.2 and 1.0 (100% → 80% → 60% → 40% → 20%)
 */
export function getOpacityForIndex(index: number): number {
  return 1 - (index * 0.2);
}
