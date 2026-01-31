/**
 * Calculate tree growth stage based on total focus time
 * Uses exponential growth formula to map minutes to growth range
 * 
 * Formula: Y = R * (1 - e^(-k*x))
 * Where:
 * - x = minutes of focus time
 * - R = maximum growth value (100)
 * - k = growth rate constant (controls how fast tree grows)
 * - Y = growth stage value
 * 
 * This maps minutes [0...∞] to growth range [0, R]
 * 
 * @param totalTimeMs - Total focus time in milliseconds
 * @returns Growth stage value between 0 and 100
 */
export function getTreeGrowthStage(totalTimeMs: number): number {
  const minutes = totalTimeMs / (1000 * 60);

  // Maximum growth value
  const R = 100;

  // Growth rate constant - adjust this to control growth speed
  // Lower k = slower growth, Higher k = faster growth
  // k = 0.02 means ~50% growth at 35 minutes, ~95% at 150 minutes
  const k = 0.08;

  // Exponential growth formula: Y = R * (1 - e^(-k*x))
  const growthStage = R * (1 - Math.exp(-k * minutes));

  return growthStage + 10;
}
