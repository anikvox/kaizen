import type { ApiClient } from "../client"

export interface DeviceTokenStatus {
  linked: boolean
  token?: string | null
  user?: {
    email: string
    name: string
    image?: string
  } | null
}

export interface LinkDeviceTokenRequest {
  installationId: string
  deviceName: string
  userEmail: string
  userName: string
  userImage?: string
}

export interface LinkDeviceTokenResponse {
  token: string
  user: {
    email: string
    name: string
    image?: string
  }
}

/**
 * Device token service for managing extension authentication.
 * Handles linking, unlinking, and checking device token status.
 */
export class DeviceTokenService {
  constructor(private client: ApiClient) {}

  /**
   * Check if an installation ID is linked to a user account.
   * This endpoint doesn't require authentication.
   */
  async getStatus(installationId: string): Promise<DeviceTokenStatus> {
    return this.client.get<DeviceTokenStatus>(`/device-tokens/status/${installationId}`)
  }

  /**
   * Link a device to a user account.
   * Requires authentication (Clerk JWT token).
   */
  async link(request: LinkDeviceTokenRequest): Promise<LinkDeviceTokenResponse> {
    return this.client.post<LinkDeviceTokenResponse>("/device-tokens/link", request)
  }

  /**
   * Unlink a device from a user account.
   * Requires authentication (device token).
   */
  async unlink(): Promise<void> {
    await this.client.post("/device-tokens/unlink", {})
  }
}
