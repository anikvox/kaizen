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

export interface SSEDeviceTokenRevokedData {
  token: string;
}

export interface SSEDeviceListChangedData {
  action: "created" | "deleted";
  deviceId: string;
}

export interface ApiError {
  error: string;
}

export interface DeviceToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DeviceTokenCreated {
  id: string;
  token: string;
  name: string;
  createdAt: string;
}

export interface DeviceTokenVerifyResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}
