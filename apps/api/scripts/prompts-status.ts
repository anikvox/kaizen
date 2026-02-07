#!/usr/bin/env tsx
/**
 * Show the status of Opik prompt integration.
 *
 * Usage:
 *   pnpm prompts:status
 *   # or
 *   npx tsx scripts/prompts-status.ts
 */

import { getAllLocalPrompts, isOpikPromptsEnabled, PROMPT_NAMES } from "../src/lib/llm/index.js";

async function main() {
  console.log("Opik Prompt Integration Status\n");
  console.log("================================\n");

  const opikEnabled = isOpikPromptsEnabled();
  console.log(`Opik Enabled: ${opikEnabled ? "Yes" : "No"}`);

  if (!opikEnabled) {
    console.log("\nNote: Set OPIK_API_KEY to enable Opik prompt management.");
    console.log("Without Opik, local prompts are used as fallback.\n");
  }

  const prompts = getAllLocalPrompts();
  console.log(`\nLocal Prompts (${Object.keys(prompts).length}):\n`);

  for (const [name, content] of Object.entries(prompts)) {
    const preview = content.slice(0, 60).replace(/\n/g, " ");
    console.log(`  ${name}`);
    console.log(`    "${preview}..."\n`);
  }

  console.log("\nPrompt Name Constants:");
  for (const [key, value] of Object.entries(PROMPT_NAMES)) {
    console.log(`  PROMPT_NAMES.${key} = "${value}"`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
