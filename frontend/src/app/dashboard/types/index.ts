// Backend Focus model from the server
export interface BackendFocus {
    id: number
    score: number // 0-100
    category: string // "deep_work", "shallow_work", "distraction", "rest"
    summary: string
    insights?: string
    windowStart: string // ISO date string
    windowEnd: string // ISO date string
    textCount: number
    imageCount: number
    youtubeCount: number
    audioCount: number
    modelUsed: string
    traceId?: string
    timestamp: string // ISO date string
    updatedAt: string // ISO date string
}

// Legacy Focus type - kept for backward compatibility with existing components
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
