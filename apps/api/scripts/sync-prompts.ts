#!/usr/bin/env tsx
/**
 * Sync all local prompts to Opik's prompt library.
 *
 * Usage:
 *   pnpm prompts:sync
 *   # or
 *   npx tsx scripts/sync-prompts.ts
 */

import { syncAllPromptsToOpik, getAllLocalPrompts, isOpikPromptsEnabled } from "../src/lib/llm/index.js";

async function main() {
  console.log("Syncing prompts to Opik...\n");

  if (!isOpikPromptsEnabled()) {
    console.error("Error: Opik is not configured.");
    console.error("Set OPIK_API_KEY environment variable to enable Opik integration.");
    process.exit(1);
  }

  const prompts = getAllLocalPrompts();
  console.log(`Found ${Object.keys(prompts).length} prompts to sync:\n`);

  for (const name of Object.keys(prompts)) {
    console.log(`  - ${name}`);
  }
  console.log();

  const result = await syncAllPromptsToOpik(prompts);

  console.log("\nSync complete:");
  console.log(`  Synced: ${result.synced}`);
  console.log(`  Failed: ${result.failed}`);

  if (result.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
