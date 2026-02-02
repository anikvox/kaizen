import type { BackendFocus } from "../types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : "http://localhost:60092/api";

export class FocusService {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    async getLatestFocus(): Promise<BackendFocus | null> {
        try {
            const response = await fetch(`${API_BASE_URL}/focus/latest`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // No focus data found yet
                    return null;
                }
                const errorText = await response.text();
                console.error(`Failed to fetch latest focus: ${response.status} ${response.statusText}`, errorText);
                return null;
            }

            return response.json();
        } catch (error) {
            console.error("Error fetching latest focus:", error);
            return null;
        }
    }

    async getFocusHistory(limit = 10, offset = 0): Promise<BackendFocus[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/focus?limit=${limit}&offset=${offset}`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to fetch focus history: ${response.status} ${response.statusText}`, errorText);
                return [];
            }

            return response.json();
        } catch (error) {
            console.error("Error fetching focus history:", error);
            return [];
        }
    }

    async getTodayStats(): Promise<{
        averageScore: number;
        totalRecords: number;
        categoryDistribution: Record<string, number>;
        timeline: Array<{
            id: number;
            score: number;
            category: string;
            timestamp: string;
        }>;
    } | null> {
        try {
            const response = await fetch(`${API_BASE_URL}/focus/stats/today`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to fetch today's stats: ${response.status} ${response.statusText}`, errorText);
                return null;
            }

            return response.json();
        } catch (error) {
            console.error("Error fetching today's stats:", error);
            return null;
        }
    }
}
