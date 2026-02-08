import type { HttpClient } from "../http.js";
import type {
  UserSettings,
  UserSettingsUpdateRequest,
  LLMModels,
  LLMProviderType,
  ModelInfo,
} from "../types/index.js";

export class SettingsEndpoint {
  constructor(private http: HttpClient) {}

  async get(deviceToken?: string): Promise<UserSettings> {
    if (deviceToken) {
      // Use device token auth
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deviceToken}`,
      };
      const response = await fetch(`${this.http.getBaseUrl()}/settings`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
    return this.http.get<UserSettings>("/settings", true);
  }

  async update(settings: UserSettingsUpdateRequest, deviceToken?: string): Promise<UserSettings> {
    if (deviceToken) {
      // Use device token auth
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deviceToken}`,
      };
      const response = await fetch(`${this.http.getBaseUrl()}/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
    return this.http.post<UserSettings>("/settings", settings, true);
  }

  async getLLMModels(deviceToken?: string): Promise<LLMModels> {
    if (deviceToken) {
      // Use device token auth
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deviceToken}`,
      };
      const response = await fetch(`${this.http.getBaseUrl()}/settings/llm/models`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
    return this.http.get<LLMModels>("/settings/llm/models", true);
  }

  async getModelsForProvider(provider: LLMProviderType, deviceToken?: string): Promise<ModelInfo[]> {
    if (deviceToken) {
      // Use device token auth
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deviceToken}`,
      };
      const response = await fetch(`${this.http.getBaseUrl()}/settings/llm/models/${provider}`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
    return this.http.get<ModelInfo[]>(`/settings/llm/models/${provider}`, true);
  }
}
