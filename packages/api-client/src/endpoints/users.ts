import type { HttpClient } from "../http.js";
import type { User } from "../types/index.js";

export interface DeleteAccountResponse {
  success: boolean;
  message: string;
}

export class UsersEndpoint {
  constructor(private http: HttpClient) {}

  async me(): Promise<User> {
    return this.http.get<User>("/users/me", true);
  }

  async sync(data: { email: string; name?: string }): Promise<User> {
    return this.http.post<User>("/users/sync", data, true);
  }

  /**
   * Delete all user data and account
   * This will delete all data from all tables and cancel all scheduled jobs.
   */
  async deleteAccount(): Promise<DeleteAccountResponse> {
    return this.http.delete<DeleteAccountResponse>("/users/me", true);
  }
}
