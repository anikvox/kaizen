// AI utilities for dashboard

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL 
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : "http://localhost:60092/api";

export class AIService {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    async write(prompt: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/ai/write`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            throw new Error("Failed to generate text");
        }

        const data = await response.json();
        return data.text;
    }

    async rewrite(text: string, context?: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/ai/rewrite`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ text, context }),
        });

        if (!response.ok) {
            throw new Error("Failed to rewrite text");
        }

        const data = await response.json();
        return data.text;
    }

    async summarize(text: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/ai/summarize`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            throw new Error("Failed to summarize text");
        }

        const data = await response.json();
        return data.text;
    }
}
