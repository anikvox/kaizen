/**
 * Quiz generation prompts and utilities.
 * System prompt is centralized in llm/system-prompts.ts
 */

import type { QuizGenerationContext } from "./types.js";
import {
  QUIZ_GENERATION_SYSTEM_PROMPT,
  validateQuizResponse as validateQuiz,
} from "../llm/index.js";

// Re-export for backward compatibility
export const QUIZ_SYSTEM_PROMPT = QUIZ_GENERATION_SYSTEM_PROMPT;

// Re-export validator
export const parseQuizResponse = validateQuiz;

/**
 * Generate the quiz creation prompt
 */
export function createQuizPrompt(
  context: QuizGenerationContext,
  optionsCount: number,
  questionCount: number = 10,
): string {
  // Add randomness to encourage different questions each time
  const seed = Math.random().toString(36).slice(2, 8);
  const questionStyles = [
    "focus on definitions and concepts",
    "focus on relationships between ideas",
    "focus on practical applications",
    "focus on key facts and details",
    "focus on comparisons and contrasts",
  ];
  const selectedStyle =
    questionStyles[Math.floor(Math.random() * questionStyles.length)];

  // Build previous questions section for deduplication
  let previousQuestionsSection = "";
  if (context.previousQuestions.length > 0) {
    previousQuestionsSection = `
## IMPORTANT: Previous Questions to Avoid

The following questions have already been asked in recent quizzes. DO NOT repeat these or create very similar questions:

${context.previousQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Generate COMPLETELY DIFFERENT questions that test different aspects of the content.
`;
  }

  return `Generate ${questionCount} UNIQUE quiz questions to test understanding of the user's recent learning activity.

## Learning Data

Focus Topics: ${context.focusTopics.length > 0 ? context.focusTopics.join(", ") : "General browsing"}
Websites Explored: ${context.websiteCount} sites
Total Words Read: ${context.totalWordsRead}

### Key Content

${context.serializedAttention}
${previousQuestionsSection}
## Instructions

Create ${questionCount} quiz questions that:
1. Test specific concepts from the content above
2. Are factual and based on actual content (not generic)
3. Have exactly ${optionsCount} answer options each
4. Are clear and concise
5. Have one correct answer and ${optionsCount - 1} plausible distractor(s)
6. For this quiz, ${selectedStyle}
7. Generate DIFFERENT questions than previous quizzes - vary the topics and angles
8. Cover different topics/sections from the content - don't cluster questions on one topic

## Rules

- Questions should be under 100 characters
- Each option should be under 80 characters
- Make questions specific to the content
- correct_index is 0-based (0 for first option, 1 for second, etc.)
- Variation seed: ${seed} (use this to ensure uniqueness)
- NEVER repeat a question from the "Previous Questions to Avoid" section

## Response Format

Return ONLY a valid JSON array with no additional text:
[
  {
    "question": "What is...?",
    "options": [${Array.from({ length: optionsCount }, (_, i) => `"Option ${i + 1}"`).join(", ")}],
    "correct_index": 0
  }
]`;
}
