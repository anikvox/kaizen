import type { ApiClientConfig, AuthProvider, RequestOptions } from "./types"

/**
 * Base API client with configurable authentication.
 *
 * Usage:
 * ```ts
 * // Extension
 * const client = new ApiClient({
 *   baseUrl: "http://localhost:60092",
 *   authProvider: extensionAuthProvider
 * })
 *
 * // Frontend
 * const client = new ApiClient({
 *   baseUrl: "http://localhost:60092",
 *   authProvider: clerkAuthProvider
 * })
 * ```
 */
export class ApiClient {
  private baseUrl: string
  private authProvider: AuthProvider

  constructor(config: ApiClientConfig) {
    // Remove trailing slash from baseUrl
    this.baseUrl = config.baseUrl.replace(/\/$/, "")
    this.authProvider = config.authProvider
  }

  /**
   * Get auth token from the configured provider
   */
  async getToken(): Promise<string | null> {
    return this.authProvider.getToken()
  }

  /**
   * Build headers for a request
   */
  private async buildHeaders(options?: RequestOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      ...options?.headers
    }

    // Add auth header if token available
    const token = await this.getToken()
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    // Add content-type for JSON bodies (unless skipped, e.g., for FormData)
    if (!options?.skipContentType && options?.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json"
    }

    return headers
  }

  /**
   * Make an authenticated request
   */
  async request<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
    const headers = await this.buildHeaders(options)

    const response = await fetch(url, {
      method: options?.method || "GET",
      headers,
      body: options?.body instanceof FormData
        ? options.body
        : options?.body
          ? JSON.stringify(options.body)
          : undefined
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new ApiError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      )
    }

    return response.json()
  }

  /**
   * Make an authenticated request that returns a streaming response
   */
  async requestStream(endpoint: string, options?: RequestOptions): Promise<Response> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
    const headers = await this.buildHeaders(options)

    const response = await fetch(url, {
      method: options?.method || "POST",
      headers,
      body: options?.body instanceof FormData
        ? options.body
        : options?.body
          ? JSON.stringify(options.body)
          : undefined
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new ApiError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      )
    }

    return response
  }

  /**
   * GET request helper
   */
  async get<T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" })
  }

  /**
   * POST request helper
   */
  async post<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "POST", body })
  }

  /**
   * DELETE request helper
   */
  async delete<T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" })
  }
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/**
 * Create a simple auth provider from a static token
 */
export function createStaticAuthProvider(token: string): AuthProvider {
  return {
    getToken: async () => token
  }
}

/**
 * Create an auth provider from a token getter function
 */
export function createAuthProvider(getToken: () => Promise<string | null>): AuthProvider {
  return { getToken }
}
