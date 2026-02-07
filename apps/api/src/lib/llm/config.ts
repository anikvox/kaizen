/**
 * Centralized LLM configuration for temperature, maxTokens, and other settings.
 * All LLM calls should use these presets for consistency.
 */

export interface LLMCallConfig {
  temperature: number;
  maxTokens: number;
}

/**
 * LLM configuration presets for different use cases.
 */
export const LLM_CONFIG = {
  // High precision, deterministic outputs (summaries, analysis)
  summarization: {
    temperature: 0.3,
    maxTokens: 200,
  },

  // Image description (slightly longer output allowed)
  imageDescription: {
    temperature: 0.3,
    maxTokens: 150,
  },

  // Title generation (very short, creative)
  titleGeneration: {
    temperature: 0.7,
    maxTokens: 20,
  },

  // Quiz generation (high variety, structured JSON output)
  quizGeneration: {
    temperature: 0.9,
    maxTokens: 2000,
  },

  // Focus analysis (concise, deterministic)
  focusAnalysis: {
    temperature: 0.3,
    maxTokens: 50,
  },

  // Agent/chat (balanced creativity and coherence)
  agent: {
    temperature: 0.7,
    maxTokens: 4096,
  },

  // Yes/no decisions (very deterministic)
  decision: {
    temperature: 0.1,
    maxTokens: 10,
  },
} as const;

export type LLMConfigKey = keyof typeof LLM_CONFIG;
