import type { HttpClient } from "../http.js";
import type { DeviceToken, DeviceTokenCreated } from "../types/index.js";

export class DeviceTokensEndpoint {
  constructor(private http: HttpClient) {}

  async create(name: string): Promise<DeviceTokenCreated> {
    return this.http.post<DeviceTokenCreated>("/device-tokens", { name }, true);
  }

  async list(): Promise<DeviceToken[]> {
    return this.http.get<DeviceToken[]>("/device-tokens", true);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/device-tokens/${id}`, true);
  }

  async revoke(token: string): Promise<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      "/device-tokens/revoke",
      { token },
      false,
    );
  }
}
