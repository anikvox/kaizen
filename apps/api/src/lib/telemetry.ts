import { env } from "./env.js";

let sdk: any = null;
let initialized = false;

/**
 * Initialize OpenTelemetry with Opik exporter for tracing.
 * Only initializes if OPIK_API_KEY is set.
 */
export async function initTelemetry(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!env.opikApiKey) {
    console.log("[Telemetry] OPIK_API_KEY not set, tracing disabled");
    return;
  }

  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OpikExporter } = await import("opik-vercel");

    sdk = new NodeSDK({
      traceExporter: new OpikExporter({
        tags: ["kaizen", "focus-agent"],
        metadata: {
          service: "kaizen-api",
          component: "focus-agent",
        },
      }),
    });

    sdk.start();
    console.log("[Telemetry] Opik tracing initialized");
  } catch (error) {
    console.warn("[Telemetry] Failed to initialize Opik tracing:", error);
  }
}

/**
 * Shutdown telemetry and flush any pending traces.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log("[Telemetry] Opik tracing shutdown complete");
    } catch (error) {
      console.warn("[Telemetry] Error shutting down telemetry:", error);
    }
  }
}

/**
 * Telemetry settings type for Vercel AI SDK
 */
export interface TelemetryConfig {
  isEnabled?: boolean;
  recordInputs?: boolean;
  recordOutputs?: boolean;
  functionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get telemetry settings for a generateText/generateObject call.
 * Returns undefined if telemetry is not initialized.
 */
export async function getTelemetrySettings(
  name: string,
  metadata?: Record<string, string>
): Promise<TelemetryConfig | undefined> {
  if (!env.opikApiKey) {
    return undefined;
  }

  try {
    const { OpikExporter } = await import("opik-vercel");
    return OpikExporter.getSettings({
      name,
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      metadata,
    }) as TelemetryConfig;
  } catch {
    return undefined;
  }
}
