export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    imagePreview?: string;
    audioName?: string;
    metadata?: any; // Allow any metadata structure from server
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL 
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : "http://localhost:60092/api";

export class DashboardChatService {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    async getSessions(): Promise<ChatSession[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/chat/sessions`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to fetch chat sessions: ${response.status} ${response.statusText}`, errorText);
                return [];
            }

            return response.json();
        } catch (error) {
            console.error("Error fetching chat sessions:", error);
            return [];
        }
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
            const errorText = await response.text();
            console.error("Create session error:", response.status, errorText);
            throw new Error(`Failed to create chat session: ${response.status} ${errorText}`);
        }

        return response.json();
    }

    async getMessages(sessionId: string): Promise<ChatMessage[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to fetch messages: ${response.status} ${response.statusText}`, errorText);
                return [];
            }

            return response.json();
        } catch (error) {
            console.error("Error fetching messages:", error);
            return [];
        }
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
        context?: string,
        image?: File,
        audio?: File
    ): AsyncGenerator<StreamResponse, void, unknown> {
        const formData = new FormData();
        formData.append('content', content);
        if (context) formData.append('context', context);
        if (image) formData.append('image', image);
        if (audio) formData.append('audio', audio);

        const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server error:", response.status, errorText);
            throw new Error(`Failed to send message: ${response.status} ${errorText}`);
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
