#!/usr/bin/env tsx
/**
 * Inspect an Opik trace by ID to debug data issues.
 *
 * Usage:
 *   npx tsx scripts/inspect-trace.ts <trace-id>
 */

import { Opik } from "opik";
import { env } from "../src/lib/env.js";

async function main() {
  const traceId = process.argv[2];

  if (!traceId) {
    console.error("Usage: npx tsx scripts/inspect-trace.ts <trace-id>");
    process.exit(1);
  }

  if (!env.opikApiKey) {
    console.error("Error: OPIK_API_KEY not set");
    process.exit(1);
  }

  const client = new Opik({
    apiKey: env.opikApiKey,
    workspaceName: env.opikWorkspace,
    projectName: env.opikProjectName,
  });

  console.log(`\nFetching trace: ${traceId}\n`);

  try {
    // Fetch trace via API
    const response = await fetch(
      `https://www.comet.com/opik/api/v1/private/traces/${traceId}`,
      {
        headers: {
          "authorization": env.opikApiKey,
          "comet-workspace": env.opikWorkspace || "",
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch trace: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const trace = await response.json();

    console.log("=== TRACE DATA ===\n");
    console.log(JSON.stringify(trace, null, 2));

    console.log("\n\n=== ANALYSIS ===\n");
    console.log(`Name: ${trace.name}`);
    console.log(`Input keys: ${trace.input ? Object.keys(trace.input).join(", ") : "EMPTY"}`);
    console.log(`Output keys: ${trace.output ? Object.keys(trace.output).join(", ") : "EMPTY"}`);
    console.log(`Metadata keys: ${trace.metadata ? Object.keys(trace.metadata).join(", ") : "EMPTY"}`);

    if (trace.input) {
      console.log("\nInput content:");
      console.log(JSON.stringify(trace.input, null, 2));
    }

    if (trace.output) {
      console.log("\nOutput content:");
      console.log(JSON.stringify(trace.output, null, 2));
    }

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
