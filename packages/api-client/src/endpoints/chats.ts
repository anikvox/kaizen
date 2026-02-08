import type { HttpClient } from "../http.js";
import type {
  ChatSessionListItem,
  ChatSessionWithMessages,
  SendMessageRequest,
  SendMessageResponse,
} from "../types/index.js";

export class ChatsEndpoint {
  constructor(private http: HttpClient) {}

  async list(): Promise<ChatSessionListItem[]> {
    return this.http.get<ChatSessionListItem[]>("/chats", true);
  }

  async get(sessionId: string): Promise<ChatSessionWithMessages> {
    return this.http.get<ChatSessionWithMessages>(`/chats/${sessionId}`, true);
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    return this.http.post<SendMessageResponse>("/chats", request, true);
  }

  async delete(sessionId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/chats/${sessionId}`, true);
  }
}
