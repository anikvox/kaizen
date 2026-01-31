export interface Focus {
    id?: number
    focus_item?: string // some versions use focus_item
    item: string
    keywords: string[]
    time_spent: {
        start: number
        end: number | null
    }[]
    last_updated: number
}

export interface FocusWithParsedData extends Focus {
    duration?: number
    formattedDuration?: string
}

export type Pulse = {
    message: string
    timestamp: number
}

export type ActivitySummary = {
    summary: string
    timestamp: number
}

export type PastWin = {
    id?: number
    focus_item: string
    time_spent: number
    time_spent_hours: number
    recorded_at: number
}

export type WinWithParsedData = PastWin & {
    formattedTime?: string
}

export type QuizQuestion = {
    question: string
    option_1: string
    option_2: string
    correct_answer: number
    timestamp: number
}

export type QuizQuestionWithId = QuizQuestion & {
    id: number
    isAnswered?: boolean
}

export interface ChatMessage {
    id?: number
    chatId?: string
    by: "user" | "bot"
    type: "text" | "image" | "audio"
    content: string
    timestamp?: number
}

export interface StatsData {
    primeActivity: {
        name: string;
        totalTime: number;
        percentage: number;
    } | null;
    dailyTotal: number;
    weeklyTotal: number;
    topActivities: Array<{
        name: string;
        time: number;
    }>;
    dailyWins: number;
    weeklyWins: number;
}

export type FocusState = 'no-focus' | 'active-focus' | 'wind-down';
