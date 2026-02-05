import type { BotInterface, BotMessage, BotCallbacks } from "./interface.js";

const TYPING_DURATION_MS = 1000;
const WORD_STREAM_INTERVAL_MS = 1000;

// Sample responses for the fake bot
const FAKE_RESPONSES = [
  "I understand your question. Let me think about this carefully and provide you with a thoughtful response that addresses your concerns.",
  "That's an interesting point you've raised. Based on my analysis, I would suggest considering multiple perspectives before making a decision.",
  "Thank you for sharing that with me. Here are some thoughts that might help you navigate this situation more effectively.",
  "I appreciate you bringing this up. From what I can see, there are several factors we should consider when approaching this topic.",
  "Great question! Let me break this down into smaller parts to give you a comprehensive answer that covers all the important aspects.",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeBot implements BotInterface {
  async generateResponse(
    messages: BotMessage[],
    callbacks: BotCallbacks
  ): Promise<void> {
    try {
      // Start typing
      await callbacks.onTyping();

      // Simulate typing delay
      await sleep(TYPING_DURATION_MS);

      // Pick a random response
      const response = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)];
      const words = response.split(" ");

      // Stream words one by one
      let fullContent = "";
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        fullContent += (i === 0 ? "" : " ") + word;

        await callbacks.onChunk(word, fullContent);
        await sleep(WORD_STREAM_INTERVAL_MS);
      }

      // Finished
      await callbacks.onFinished(fullContent);
    } catch (error) {
      await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const fakeBot = new FakeBot();
