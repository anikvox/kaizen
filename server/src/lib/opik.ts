import { Opik } from "opik";

/**
 * Shared Opik client instance for tracing across the application
 */
export const opikClient = new Opik({
  apiKey: process.env.OPIK_API_KEY!,
  projectName: "kaizen",
});

/**
 * Options for tracing a function
 */
export interface TraceOptions {
  name: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a span within an existing trace
 */
export interface SpanOptions {
  name: string;
  type?: "general" | "llm" | "tool" | "retrieval";
  metadata?: Record<string, unknown>;
}

/**
 * Wraps an async function with Opik tracing.
 * Creates a new trace for each function invocation and logs input/output.
 *
 * @param fn - The async function to wrap
 * @param options - Tracing options (name, tags, metadata)
 * @returns The wrapped function with tracing
 */
export function withTrace<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: TraceOptions
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const trace = opikClient.trace({
      name: options.name,
      input: { args: args.length === 1 ? args[0] : args },
      metadata: {
        ...options.metadata,
        tags: options.tags,
      },
    });

    try {
      const result = await fn(...args);
      trace.update({
        output: { result },
      });
      trace.end();
      return result;
    } catch (error) {
      trace.update({
        output: { error: error instanceof Error ? error.message : String(error) },
        metadata: {
          ...options.metadata,
          error: true,
        },
      });
      trace.end();
      throw error;
    }
  };
}

/**
 * Creates a traced span within an existing trace context.
 * Useful for instrumenting sub-operations within a larger traced function.
 *
 * @param parentTrace - The parent trace to attach the span to
 * @param fn - The async function to execute within the span
 * @param options - Span options (name, type, metadata)
 * @returns The result of the function
 */
export async function withSpan<TResult>(
  parentTrace: ReturnType<typeof opikClient.trace>,
  fn: () => Promise<TResult>,
  options: SpanOptions
): Promise<TResult> {
  const span = parentTrace.span({
    name: options.name,
    type: options.type || "general",
    metadata: options.metadata,
  });

  try {
    const result = await fn();
    span.update({
      output: { result },
    });
    span.end();
    return result;
  } catch (error) {
    span.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: {
        ...options.metadata,
        error: true,
      },
    });
    span.end();
    throw error;
  }
}

/**
 * Flushes all pending traces to Opik.
 * Call this before process exit or when you need to ensure traces are sent.
 */
export async function flushTraces(): Promise<void> {
  await opikClient.flush();
}

/**
 * Creates a trace context that can be passed to nested functions.
 * This enables hierarchical tracing with parent-child relationships.
 */
export function createTrace(options: TraceOptions) {
  return opikClient.trace({
    name: options.name,
    metadata: {
      ...options.metadata,
      tags: options.tags,
    },
  });
}

export type Trace = ReturnType<typeof opikClient.trace>;
