import { env } from "../env.js";

let initialized = false;
let opikExporter: unknown = null;

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

  try {
    // Import OpenTelemetry SDK and Opik exporter
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-node");
    const { OpikExporter } = await import("opik-vercel");

    // Create the Opik exporter
    const exporter = new OpikExporter({
      tags: ["kaizen"],
      metadata: {
        environment: process.env.NODE_ENV || "development",
      },
    });

    opikExporter = exporter;

    // Initialize the OpenTelemetry SDK with the Opik exporter
    const sdk = new NodeSDK({
      spanProcessors: [new SimpleSpanProcessor(exporter as any)],
    });

    sdk.start();

    initialized = true;
    console.log("[Telemetry] Opik tracing initialized with OpenTelemetry SDK");

    // Handle graceful shutdown
    process.on("SIGTERM", async () => {
      await sdk.shutdown();
    });
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
}): { isEnabled: boolean; functionId?: string; metadata?: Record<string, string> } {
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

  return {
    isEnabled: true,
    functionId: options?.name,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/**
 * Shutdown telemetry gracefully.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (opikExporter && typeof (opikExporter as any).shutdown === "function") {
    await (opikExporter as any).shutdown();
  }
}
