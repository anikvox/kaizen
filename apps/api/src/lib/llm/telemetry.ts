/**
 * Opik tracing with proper trace/span hierarchy.
 * Uses the Opik SDK directly for full control over trace structure.
 */

import { Opik } from "opik";
import { env } from "../env.js";

let opikClient: Opik | null = null;

/**
 * Get or create the Opik client singleton
 */
export function getOpikClient(): Opik | null {
  if (!env.opikApiKey) {
    return null;
  }

  if (!opikClient) {
    opikClient = new Opik({
      apiKey: env.opikApiKey,
      workspaceName: env.opikWorkspace,
      projectName: env.opikProjectName,
    });
  }

  return opikClient;
}

/**
 * Check if Opik tracing is enabled
 */
export function isTracingEnabled(): boolean {
  return !!env.opikApiKey;
}

export interface TraceContext {
  /** Add a span to the current trace */
  span: (options: SpanOptions) => SpanContext;
  /** End the trace with output */
  end: (output?: Record<string, unknown>) => Promise<void>;
  /** The trace ID */
  traceId: string;
}

export interface SpanContext {
  /** End the span with output */
  end: (output?: Record<string, unknown>) => void;
  /** The span ID */
  spanId: string;
}

export interface SpanOptions {
  name: string;
  type?: "llm" | "tool" | "retrieval" | "general" | "guardrail";
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TraceOptions {
  name: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  /** Thread ID for grouping related traces (e.g., chat conversations) */
  threadId?: string;
}

/**
 * Start a new trace. Returns a context for adding spans.
 * For agents: create one trace, add multiple spans for each step.
 * For one-shot calls: create one trace with one span.
 */
export function startTrace(options: TraceOptions): TraceContext | null {
  const client = getOpikClient();
  if (!client) {
    return null;
  }

  const trace = client.trace({
    name: options.name,
    input: options.input,
    metadata: {
      ...options.metadata,
      environment: process.env.NODE_ENV || "development",
    },
    tags: options.tags || ["kaizen"],
    threadId: options.threadId,
  });

  return {
    traceId: (trace as any).id || "unknown",

    span: (spanOptions: SpanOptions): SpanContext => {
      const span = trace.span({
        name: spanOptions.name,
        type: spanOptions.type || "general",
        input: spanOptions.input,
        metadata: spanOptions.metadata,
      });

      return {
        spanId: (span as any).id || "unknown",
        end: (output?: Record<string, unknown>) => {
          span.end({ output });
        },
      };
    },

    end: async (output?: Record<string, unknown>) => {
      trace.end({ output });
      await client.flush();
    },
  };
}

/**
 * Create a simple one-shot trace (single operation, no nested spans).
 */
export async function traceOperation<T>(
  options: TraceOptions & { operation: () => Promise<T> }
): Promise<T> {
  const client = getOpikClient();

  if (!client) {
    // Tracing disabled, just run the operation
    return options.operation();
  }

  const trace = client.trace({
    name: options.name,
    input: options.input,
    metadata: {
      ...options.metadata,
      environment: process.env.NODE_ENV || "development",
    },
    tags: options.tags || ["kaizen"],
    threadId: options.threadId,
  });

  try {
    const result = await options.operation();
    trace.end({ output: { success: true, result: typeof result === "object" ? result : { value: result } } });
    await client.flush();
    return result;
  } catch (error) {
    trace.end({ output: { success: false, error: String(error) } });
    await client.flush();
    throw error;
  }
}

/**
 * Initialize telemetry (kept for backward compatibility).
 * With the new approach, initialization happens lazily on first use.
 */
export async function initTelemetry(): Promise<void> {
  if (!env.opikApiKey) {
    console.log("[Telemetry] OPIK_API_KEY not set, tracing disabled");
    return;
  }

  // Verify we can create the client
  const client = getOpikClient();
  if (client) {
    console.log("[Telemetry] Opik tracing initialized");
  }
}

/**
 * Shutdown telemetry gracefully.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (opikClient) {
    await opikClient.flush();
  }
}

/**
 * Get telemetry settings for Vercel AI SDK experimental_telemetry.
 * Note: This is now secondary - prefer using startTrace() for proper hierarchy.
 */
export function getTelemetrySettings(options?: {
  name?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  promptName?: string;
  promptVersion?: string;
}): { isEnabled: boolean; functionId?: string; metadata?: Record<string, string> } {
  // Disable OpenTelemetry-based tracing since we're using Opik SDK directly
  return { isEnabled: false };
}
