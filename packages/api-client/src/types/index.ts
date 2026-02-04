export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
}

export interface HealthResponse {
  status: string;
  db: "connected" | "disconnected";
}

export interface MessageResponse {
  message: string;
}

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SSETickData {
  time: string;
}

export interface ApiError {
  error: string;
}
