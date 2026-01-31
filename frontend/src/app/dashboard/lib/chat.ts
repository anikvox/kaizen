export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
};

export type ChatSession = {
    id: string;
    title: string;
    updatedAt: string;
    messages?: ChatMessage[];
};

export type StreamResponse = {
    chunk?: string;
    title?: string;
    done?: boolean;
    error?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:60092/api";

export class DashboardChatService {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    async getSessions(): Promise<ChatSession[]> {
        const response = await fetch(`${API_BASE_URL}/chat/sessions`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            throw new Error("Failed to fetch chat sessions");
        }

        return response.json();
    }

    async createSession(title?: string): Promise<ChatSession> {
        const response = await fetch(`${API_BASE_URL}/chat/sessions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ title: title || "New Chat" }),
        });

        if (!response.ok) {
            throw new Error("Failed to create chat session");
        }

        return response.json();
    }

    async getMessages(sessionId: string): Promise<ChatMessage[]> {
        const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            throw new Error("Failed to fetch messages");
        }

        return response.json();
    }

    async deleteSession(sessionId: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            throw new Error("Failed to delete chat session");
        }
    }

    async *sendMessageStreaming(
        sessionId: string,
        content: string,
        context?: string
    ): AsyncGenerator<StreamResponse, void, unknown> {
        const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ content, context }),
        });

        if (!response.ok) {
            throw new Error("Failed to send message");
        }

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        if (data.type === 'title_update') {
                            yield { title: data.title };
                        } else if (data.chunk) {
                            yield { chunk: data.chunk };
                        }

                        if (data.done) {
                            yield { done: true };
                            return;
                        }
                    } catch (e) {
                        console.error("Parse error:", e, line);
                    }
                }
            }
        }
    }
}
