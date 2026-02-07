import { z } from "zod";
import { tool } from "ai";
import { generateText } from "ai";
import { db } from "../db.js";
import { createAgentProvider, getAgentModelId } from "../agent/index.js";
import type { UserSettings } from "@prisma/client";

/**
 * Text manipulation tools for chat agent.
 * These tools provide summarization, proofreading, translation, and rephrasing capabilities.
 */

/**
 * Get user's preferred translation language
 */
async function getPreferredTranslationLanguage(userId: string): Promise<string | null> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { preferredTranslationLanguage: true },
  });
  return settings?.preferredTranslationLanguage || null;
}

/**
 * Set user's preferred translation language
 */
async function setPreferredTranslationLanguage(userId: string, language: string): Promise<void> {
  await db.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      preferredTranslationLanguage: language,
    },
    update: {
      preferredTranslationLanguage: language,
    },
  });
}

/**
 * Create text manipulation tools for the chat agent
 */
export function createTextTools(userId: string, settings: UserSettings | null) {
  const provider = createAgentProvider(settings);
  const modelId = getAgentModelId(settings);

  return {
    /**
     * Summarize text concisely
     */
    summarize_text: tool({
      description: "Summarize a piece of text into a concise version, preserving key information and main points.",
      parameters: z.object({
        text: z.string().describe("The text to summarize"),
        maxLength: z.number().optional().describe("Optional maximum length in words for the summary (default: no limit)"),
      }),
      execute: async ({ text, maxLength }) => {
        const lengthInstruction = maxLength ? `Keep the summary under ${maxLength} words.` : "";

        const { text: summary } = await generateText({
          model: provider(modelId),
          prompt: `Summarize the following text concisely, preserving the key information and main points. ${lengthInstruction}

TEXT:
${text}

SUMMARY:`,
          maxTokens: 1000,
        });

        return {
          summary: summary.trim(),
          originalLength: text.split(/\s+/).length,
          summaryLength: summary.trim().split(/\s+/).length,
        };
      },
    }),

    /**
     * Proofread and correct text
     */
    proofread_text: tool({
      description: "Proofread text for grammar, spelling, punctuation, and style errors. Returns corrected text with explanations.",
      parameters: z.object({
        text: z.string().describe("The text to proofread"),
      }),
      execute: async ({ text }) => {
        const { text: result } = await generateText({
          model: provider(modelId),
          prompt: `Proofread the following text and correct any grammar, spelling, punctuation, or style errors.

Return your response in this format:
CORRECTED TEXT:
[The corrected version]

CHANGES MADE:
- [List each correction made, explaining what was wrong and why it was corrected]

If the text has no errors, just return the original text under CORRECTED TEXT and write "No errors found" under CHANGES MADE.

TEXT:
${text}`,
          maxTokens: 2000,
        });

        // Parse the response
        const correctedMatch = result.match(/CORRECTED TEXT:\s*\n([\s\S]*?)(?=\n\nCHANGES MADE:|$)/);
        const changesMatch = result.match(/CHANGES MADE:\s*\n([\s\S]*)/);

        return {
          correctedText: correctedMatch?.[1]?.trim() || text,
          changesMade: changesMatch?.[1]?.trim() || "No errors found",
          hasErrors: !result.includes("No errors found"),
        };
      },
    }),

    /**
     * Translate text to user's preferred language
     */
    translate_text: tool({
      description: "Translate text to the user's preferred language. If no preferred language is set, ask the user first.",
      parameters: z.object({
        text: z.string().describe("The text to translate"),
        targetLanguage: z.string().optional().describe("Target language (only if user just specified it in this message)"),
      }),
      execute: async ({ text, targetLanguage }) => {
        let language = targetLanguage;

        // If no target language provided, check user settings
        if (!language) {
          language = await getPreferredTranslationLanguage(userId);
        }

        // If still no language, ask user
        if (!language) {
          return {
            needsLanguage: true,
            message: "What language would you like me to translate this to?",
            text,
          };
        }

        // Save the language preference if newly provided
        if (targetLanguage) {
          await setPreferredTranslationLanguage(userId, targetLanguage);
        }

        // Perform translation
        const { text: translation } = await generateText({
          model: provider(modelId),
          prompt: `Translate the following text to ${language}. Only provide the translation, nothing else.

TEXT:
${text}

TRANSLATION:`,
          maxTokens: 2000,
        });

        return {
          needsLanguage: false,
          translatedText: translation.trim(),
          sourceLanguage: "auto-detected",
          targetLanguage: language,
          savedPreference: !!targetLanguage,
        };
      },
    }),

    /**
     * Rephrase text in a different style or tone
     */
    rephrase_text: tool({
      description: "Rephrase text in a different style, tone, or format while preserving the meaning.",
      parameters: z.object({
        text: z.string().describe("The text to rephrase"),
        style: z.string().optional().describe("Optional style/tone to use (e.g., 'professional', 'casual', 'formal', 'simple', 'technical')"),
      }),
      execute: async ({ text, style }) => {
        const styleInstruction = style
          ? `Rephrase it in a ${style} style/tone.`
          : "Rephrase it while preserving the meaning.";

        const { text: rephrased } = await generateText({
          model: provider(modelId),
          prompt: `Rephrase the following text. ${styleInstruction} Keep the core meaning the same but change the wording and sentence structure.

ORIGINAL TEXT:
${text}

REPHRASED TEXT:`,
          maxTokens: 2000,
        });

        return {
          rephrasedText: rephrased.trim(),
          styleUsed: style || "default",
        };
      },
    }),
  };
}
