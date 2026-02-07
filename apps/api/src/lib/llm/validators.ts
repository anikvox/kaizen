/**
 * Response validators for LLM outputs.
 * Provides robust parsing and validation for different response types.
 */

// =============================================================================
// YES/NO VALIDATION
// =============================================================================

/**
 * Validate and parse a yes/no response from LLM.
 * Returns true for "yes", false for "no", null for invalid.
 */
export function validateYesNo(response: string): boolean | null {
  const cleaned = response.trim().toLowerCase();

  if (cleaned === "yes" || cleaned === "y" || cleaned === "true") {
    return true;
  }
  if (cleaned === "no" || cleaned === "n" || cleaned === "false") {
    return false;
  }

  // Check if it starts with yes/no (sometimes LLM adds explanation)
  if (cleaned.startsWith("yes")) return true;
  if (cleaned.startsWith("no")) return false;

  return null;
}

// =============================================================================
// FOCUS ITEM VALIDATION
// =============================================================================

/**
 * Validate and clean a focus item response.
 * Returns null if the response indicates no focus or is invalid.
 */
export function validateFocusItem(response: string): string | null {
  const cleaned = response.trim();

  // Check for null/none indicators
  if (
    cleaned.toLowerCase() === "null" ||
    cleaned.toLowerCase() === "none" ||
    cleaned.toLowerCase() === "n/a" ||
    cleaned === ""
  ) {
    return null;
  }

  // Remove quotes if present
  let result = cleaned.replace(/^["']|["']$/g, "");

  // Limit to reasonable length (2-3 words, ~50 chars max)
  const words = result.split(/\s+/).slice(0, 4);
  result = words.join(" ");

  if (result.length > 50) {
    result = result.slice(0, 50).trim();
  }

  // Remove trailing punctuation
  result = result.replace(/[.!?,;:]+$/, "");

  return result || null;
}

// =============================================================================
// TITLE VALIDATION
// =============================================================================

/**
 * Validate and clean a title response.
 * Ensures max word count and cleans formatting.
 */
export function validateTitle(response: string, maxWords: number = 4): string {
  let cleaned = response.trim();

  // Remove quotes if present
  cleaned = cleaned.replace(/^["']|["']$/g, "");

  // Remove trailing punctuation
  cleaned = cleaned.replace(/[.!?,;:]+$/, "");

  // Limit words
  const words = cleaned.split(/\s+/).slice(0, maxWords);

  return words.join(" ") || "New Chat";
}

// =============================================================================
// JSON VALIDATION
// =============================================================================

export interface JsonValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Validate and parse a JSON response from LLM.
 * Handles markdown code blocks and common formatting issues.
 */
export function validateJson<T>(
  response: string,
  validator?: (data: unknown) => data is T
): JsonValidationResult<T> {
  try {
    // Clean the response - remove markdown code blocks
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

    // Try to find JSON in the response if it's embedded in text
    if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
      const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        cleaned = jsonMatch[1];
      }
    }

    const parsed = JSON.parse(cleaned);

    // Run custom validator if provided
    if (validator && !validator(parsed)) {
      return { success: false, error: "Data failed validation" };
    }

    return { success: true, data: parsed as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to parse JSON",
    };
  }
}

// =============================================================================
// QUIZ RESPONSE VALIDATION
// =============================================================================

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
}

export interface QuizValidationResult {
  success: boolean;
  questions?: QuizQuestion[];
  error?: string;
}

/**
 * Validate and parse a quiz response from LLM.
 */
export function validateQuizResponse(
  response: string,
  expectedCount: number,
  expectedOptions: number
): QuizValidationResult {
  const jsonResult = validateJson<unknown[]>(response);

  if (!jsonResult.success || !jsonResult.data) {
    return { success: false, error: jsonResult.error || "Failed to parse JSON" };
  }

  const parsed = jsonResult.data;

  if (!Array.isArray(parsed)) {
    return { success: false, error: "Response is not an array" };
  }

  if (parsed.length < expectedCount) {
    return { success: false, error: `Expected ${expectedCount} questions, got ${parsed.length}` };
  }

  const questions: QuizQuestion[] = [];

  for (let i = 0; i < expectedCount; i++) {
    const q = parsed[i] as Record<string, unknown>;

    if (!q.question || typeof q.question !== "string") {
      return { success: false, error: `Question ${i + 1} missing question text` };
    }

    if (!Array.isArray(q.options) || q.options.length !== expectedOptions) {
      return { success: false, error: `Question ${i + 1} has wrong number of options` };
    }

    const correctIndex = (q.correct_index ?? q.correctIndex ?? q.correct_answer) as number;
    if (typeof correctIndex !== "number" || correctIndex < 0 || correctIndex >= expectedOptions) {
      return { success: false, error: `Question ${i + 1} has invalid correct_index` };
    }

    questions.push({
      question: String(q.question).slice(0, 200),
      options: (q.options as unknown[]).map((o) => String(o).slice(0, 100)),
      correct_index: correctIndex,
    });
  }

  return { success: true, questions };
}

// =============================================================================
// SUMMARY VALIDATION
// =============================================================================

/**
 * Validate and clean a summary response.
 * Ensures reasonable length and removes common LLM artifacts.
 */
export function validateSummary(
  response: string,
  maxLength: number = 500
): string {
  let cleaned = response.trim();

  // Remove common prefixes LLMs add
  const prefixes = [
    "Here is a summary:",
    "Here's a summary:",
    "Summary:",
    "Here is the summary:",
  ];

  for (const prefix of prefixes) {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleaned = cleaned.slice(prefix.length).trim();
      break;
    }
  }

  // Truncate if too long
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).trim();
    // Try to end at a sentence
    const lastSentence = cleaned.lastIndexOf(".");
    if (lastSentence > maxLength * 0.7) {
      cleaned = cleaned.slice(0, lastSentence + 1);
    } else {
      cleaned += "...";
    }
  }

  return cleaned;
}
