import type { HttpClient } from "../http.js";
import type { User } from "../types/index.js";

export class UsersEndpoint {
  constructor(private http: HttpClient) {}

  async me(): Promise<User> {
    return this.http.get<User>("/users/me", true);
  }

  async sync(data: { email: string; name?: string }): Promise<User> {
    return this.http.post<User>("/users/sync", data, true);
  }
}
