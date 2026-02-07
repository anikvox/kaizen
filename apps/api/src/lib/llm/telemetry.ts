import { env } from "../env.js";

let initialized = false;

/**
 * Initialize telemetry for LLM tracing.
 * Uses Opik exporter with Vercel AI SDK's experimental_telemetry.
 */
export async function initTelemetry(): Promise<void> {
  if (initialized) {
    return;
  }

  if (!env.opikApiKey) {
    console.log("[Telemetry] OPIK_API_KEY not set, tracing disabled");
    initialized = true;
    return;
  }

  // Dynamically import opik-vercel only when API key is available
  // This prevents errors when the package tries to validate config on import
  try {
    const { OpikExporter } = await import("opik-vercel");
    new OpikExporter({
      tags: ["kaizen"],
      metadata: {
        environment: process.env.NODE_ENV || "development",
      },
    });
    initialized = true;
    console.log("[Telemetry] Opik tracing initialized");
  } catch (error) {
    console.warn("[Telemetry] Failed to initialize:", error);
    initialized = true;
  }
}

/**
 * Get telemetry settings for a specific request.
 * Use this with experimental_telemetry in generateText/streamText calls.
 */
export function getTelemetrySettings(options?: {
  name?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): { isEnabled: boolean } {
  // If Opik is not configured, just return disabled
  if (!env.opikApiKey) {
    return { isEnabled: false };
  }

  const metadata: Record<string, string> = {};

  if (options?.metadata) {
    for (const [key, value] of Object.entries(options.metadata)) {
      if (value !== undefined && value !== null) {
        metadata[key] = String(value);
      }
    }
  }

  if (options?.userId) {
    metadata.userId = options.userId;
  }

  // Return basic telemetry settings
  // The OpikExporter handles the rest when initialized
  return {
    isEnabled: true,
    functionId: options?.name,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  } as { isEnabled: boolean };
}

/**
 * Shutdown telemetry gracefully.
 */
export async function shutdownTelemetry(): Promise<void> {
  // Opik exporter handles its own cleanup
}
