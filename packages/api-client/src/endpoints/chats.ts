import type { HttpClient } from "../http.js";
import type {
  ChatSessionListItem,
  ChatSessionWithMessages,
  SendMessageRequest,
  SendMessageResponse,
  SSEChatConnectedData,
  SSEChatSessionCreatedData,
  SSEChatSessionUpdatedData,
  SSEChatSessionDeletedData,
  SSEChatMessageCreatedData,
  SSEChatMessageUpdatedData,
} from "../types/index.js";

export interface ChatSSECallbacks {
  onConnected?: (data: SSEChatConnectedData) => void;
  onSessionCreated?: (data: SSEChatSessionCreatedData) => void;
  onSessionUpdated?: (data: SSEChatSessionUpdatedData) => void;
  onSessionDeleted?: (data: SSEChatSessionDeletedData) => void;
  onMessageCreated?: (data: SSEChatMessageCreatedData) => void;
  onMessageUpdated?: (data: SSEChatMessageUpdatedData) => void;
  onError?: (error: Event) => void;
}

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

  subscribeToAllChats(
    callbacks: ChatSSECallbacks,
    token?: string
  ): EventSource {
    const url = new URL(`${this.http.getBaseUrl()}/sse/chats`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onConnected?.(data);
    });

    eventSource.addEventListener("chat-session-created", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onSessionCreated?.(data);
    });

    eventSource.addEventListener("chat-session-updated", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onSessionUpdated?.(data);
    });

    eventSource.addEventListener("chat-session-deleted", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onSessionDeleted?.(data);
    });

    eventSource.addEventListener("chat-message-created", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onMessageCreated?.(data);
    });

    eventSource.addEventListener("chat-message-updated", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onMessageUpdated?.(data);
    });

    if (callbacks.onError) {
      eventSource.onerror = callbacks.onError;
    }

    return eventSource;
  }

  subscribeToChat(
    sessionId: string,
    callbacks: ChatSSECallbacks,
    token?: string
  ): EventSource {
    const url = new URL(`${this.http.getBaseUrl()}/sse/chats/${sessionId}`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onConnected?.(data);
    });

    eventSource.addEventListener("chat-session-updated", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onSessionUpdated?.(data);
    });

    eventSource.addEventListener("chat-session-deleted", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onSessionDeleted?.(data);
    });

    eventSource.addEventListener("chat-message-created", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onMessageCreated?.(data);
    });

    eventSource.addEventListener("chat-message-updated", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      callbacks.onMessageUpdated?.(data);
    });

    if (callbacks.onError) {
      eventSource.onerror = callbacks.onError;
    }

    return eventSource;
  }
}
