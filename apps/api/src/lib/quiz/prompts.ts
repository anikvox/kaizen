/**
 * Quiz generation prompts
 */

import type { QuizGenerationContext } from "./types.js";

/**
 * System prompt for quiz generation
 */
export const QUIZ_SYSTEM_PROMPT = `You are a quiz generator that creates educational quiz questions based on a user's recent learning activity. Your questions should test comprehension and recall of specific content the user has encountered.

Rules:
- Create questions that are specific to the content provided, not generic
- Questions should test understanding, not just memorization
- Keep questions clear and concise
- Each question should have exactly one correct answer
- Distractors (wrong answers) should be plausible but clearly incorrect
- Return ONLY valid JSON, no markdown or explanation`;

/**
 * Generate the quiz creation prompt
 */
export function createQuizPrompt(
  context: QuizGenerationContext,
  optionsCount: number,
  questionCount: number = 10
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
  const selectedStyle = questionStyles[Math.floor(Math.random() * questionStyles.length)];

  return `Generate ${questionCount} UNIQUE quiz questions to test understanding of the user's recent learning activity.

## Learning Data

Focus Topics: ${context.focusTopics.length > 0 ? context.focusTopics.join(", ") : "General browsing"}
Websites Explored: ${context.websiteCount} sites
Total Words Read: ${context.totalWordsRead}

### Key Content

${context.serializedAttention}

## Instructions

Create ${questionCount} quiz questions that:
1. Test specific concepts from the content above
2. Are factual and based on actual content (not generic)
3. Have exactly ${optionsCount} answer options each
4. Are clear and concise
5. Have one correct answer and ${optionsCount - 1} plausible distractor(s)
6. For this quiz, ${selectedStyle}
7. Generate DIFFERENT questions than previous quizzes - vary the topics and angles

## Rules

- Questions should be under 100 characters
- Each option should be under 80 characters
- Make questions specific to the content
- correct_index is 0-based (0 for first option, 1 for second, etc.)
- Variation seed: ${seed} (use this to ensure uniqueness)

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

/**
 * Parse the LLM response into quiz questions
 */
export function parseQuizResponse(
  response: string,
  expectedCount: number,
  expectedOptions: number
): { success: boolean; questions?: Array<{ question: string; options: string[]; correct_index: number }>; error?: string } {
  try {
    // Clean the response - remove markdown code blocks if present
    let cleaned = response.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      return { success: false, error: "Response is not an array" };
    }

    if (parsed.length < expectedCount) {
      return { success: false, error: `Expected ${expectedCount} questions, got ${parsed.length}` };
    }

    // Validate and normalize questions
    const questions: Array<{ question: string; options: string[]; correct_index: number }> = [];

    for (let i = 0; i < expectedCount; i++) {
      const q = parsed[i];

      if (!q.question || typeof q.question !== "string") {
        return { success: false, error: `Question ${i + 1} missing question text` };
      }

      if (!Array.isArray(q.options) || q.options.length !== expectedOptions) {
        return { success: false, error: `Question ${i + 1} has wrong number of options` };
      }

      const correctIndex = q.correct_index ?? q.correctIndex ?? q.correct_answer;
      if (typeof correctIndex !== "number" || correctIndex < 0 || correctIndex >= expectedOptions) {
        return { success: false, error: `Question ${i + 1} has invalid correct_index` };
      }

      questions.push({
        question: q.question.slice(0, 200), // Truncate if too long
        options: q.options.map((o: unknown) => String(o).slice(0, 100)),
        correct_index: correctIndex,
      });
    }

    return { success: true, questions };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to parse response",
    };
  }
}
