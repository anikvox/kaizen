import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OpikExporter } from "opik-vercel";
import { env } from "../env.js";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry with Opik exporter for LLM tracing.
 * Must be called at application startup.
 */
export function initTelemetry(): void {
  if (sdk) {
    console.warn("[Telemetry] Already initialized");
    return;
  }

  if (!env.opikApiKey) {
    console.warn("[Telemetry] OPIK_API_KEY not set, tracing disabled");
    return;
  }

  const exporter = new OpikExporter({
    tags: ["kaizen"],
    metadata: {
      environment: process.env.NODE_ENV || "development",
    },
  });

  sdk = new NodeSDK({
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.log("[Telemetry] OpenTelemetry initialized with Opik exporter");
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

  // Enable telemetry when Opik is configured
  return {
    isEnabled: !!env.opikApiKey,
    ...OpikExporter.getSettings({
      name: options?.name,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }),
  };
}

/**
 * Shutdown telemetry gracefully.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
