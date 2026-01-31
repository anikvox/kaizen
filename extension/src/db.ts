// Mock database with dummy data - will be replaced with API calls to kaizen backend

import type { UserActivity } from "~utils"

export type Focus = {
  id?: number
  item: string
  keywords: string[]
  time_spent: {
    start: number
    end: number | null
  }[]
  last_updated: number
}

export type Pulse = {
  message: string
  timestamp: number
}

export type QuizQuestion = {
  question: string
  option_1: string
  option_2: string
  correct_answer: number
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

export type PomodoroStateType = "idle" | "focus" | "break"

export type PomodoroState = {
  id: string
  isActive: boolean
  remainingTime: number // seconds
  state: PomodoroStateType
  startTime: number | null // timestamp when timer started
  totalPomodoros: number
  lastUpdated: number
}

export type Chat = {
  id: string
  title?: string
  userActivity: UserActivity[]
  timestamp: number
}

export type ChatMessage = {
  id?: number
  chatId: string
  by: "user" | "bot"
  type: "text" | "image" | "audio"
  content: string
}

export type ProcessedIntent = {
  id?: number
  intentId: number
  intentType: string
  originalText: string
  result: string
  timestamp: number
}

export type WebsiteVisit = {
  url: string
  title: string
  opened_at: number
  closed_at: number | null
  favicon?: string
}

export type TextAttention = {
  id?: number
  url: string
  title: string
  text: string
  timestamp: number
}

export type ImageAttention = {
  id?: number
  url: string
  src: string
  alt: string
  timestamp: number
}

export type AudioAttention = {
  id?: number
  url: string
  title: string
  timestamp: number
}

export type YoutubeAttention = {
  id: string
  title: string
  url: string
  timestamp: number
}

// Dummy data store
const dummyData = {
  focus: [
    {
      id: 1,
      item: "Building Chrome Extension",
      keywords: ["chrome", "extension", "development"],
      time_spent: [{ start: Date.now() - 3600000, end: null }],
      last_updated: Date.now()
    },
    {
      id: 2,
      item: "Learning React",
      keywords: ["react", "javascript", "frontend"],
      time_spent: [{ start: Date.now() - 7200000, end: Date.now() - 3600000 }],
      last_updated: Date.now() - 3600000
    }
  ] as Focus[],

  pulse: [
    { message: "Started new focus session", timestamp: Date.now() - 3600000 },
    { message: "Completed reading documentation", timestamp: Date.now() - 1800000 },
    { message: "Took a short break", timestamp: Date.now() - 900000 }
  ] as Pulse[],

  activitySummary: [
    {
      summary: "You spent most of your time working on the Chrome extension, with a focus on React components.",
      timestamp: Date.now() - 3600000
    }
  ] as ActivitySummary[],

  quizQuestions: [] as QuizQuestion[],

  chat: [] as Chat[],

  chatMessages: [] as ChatMessage[],

  pastWins: [
    {
      id: 1,
      focus_item: "Deep Work Session",
      time_spent: 7200000,
      time_spent_hours: 2,
      recorded_at: Date.now() - 86400000
    },
    {
      id: 2,
      focus_item: "Code Review",
      time_spent: 3600000,
      time_spent_hours: 1,
      recorded_at: Date.now() - 172800000
    }
  ] as PastWin[],

  pomodoro: [
    {
      id: "default",
      isActive: false,
      remainingTime: 25 * 60,
      state: "idle" as PomodoroStateType,
      startTime: null,
      totalPomodoros: 0,
      lastUpdated: Date.now()
    }
  ] as PomodoroState[],

  processedIntents: [] as ProcessedIntent[],
  intentQueue: [] as any[],

  websiteVisits: [] as WebsiteVisit[],
  textAttention: [] as TextAttention[],
  imageAttention: [] as ImageAttention[],
  audioAttention: [] as AudioAttention[],
  youtubeAttention: [] as YoutubeAttention[]
}

// Mock table class to mimic Dexie API
class MockTable<T> {
  private data: T[]

  constructor(data: T[]) {
    this.data = data
  }

  async toArray(): Promise<T[]> {
    return Promise.resolve([...this.data])
  }

  async count(): Promise<number> {
    return Promise.resolve(this.data.length)
  }

  async get(id: any): Promise<T | undefined> {
    return Promise.resolve(
      this.data.find((item: any) => item.id === id)
    )
  }

  async add(item: T): Promise<any> {
    this.data.push(item)
    return Promise.resolve((item as any).id || this.data.length)
  }

  async bulkAdd(items: T[]): Promise<any> {
    this.data.push(...items)
    return Promise.resolve(items.length)
  }

  async put(item: T): Promise<any> {
    const index = this.data.findIndex((d: any) => d.id === (item as any).id)
    if (index >= 0) {
      this.data[index] = item
    } else {
      this.data.push(item)
    }
    return Promise.resolve((item as any).id)
  }

  async delete(id: any): Promise<void> {
    const index = this.data.findIndex((item: any) => item.id === id)
    if (index >= 0) {
      this.data.splice(index, 1)
    }
    return Promise.resolve()
  }

  async clear(): Promise<void> {
    this.data.length = 0
    return Promise.resolve()
  }

  where(key: string) {
    return {
      equals: (value: any) => ({
        toArray: async () => {
          return this.data.filter((item: any) => item[key] === value)
        }
      })
    }
  }

  orderBy(key: string) {
    return {
      reverse: () => ({
        toArray: async () => {
          return [...this.data].sort((a: any, b: any) => {
            if (a[key] < b[key]) return 1
            if (a[key] > b[key]) return -1
            return 0
          })
        }
      }),
      toArray: async () => {
        return [...this.data].sort((a: any, b: any) => {
          if (a[key] < b[key]) return -1
          if (a[key] > b[key]) return 1
          return 0
        })
      }
    }
  }

  limit(n: number) {
    return {
      toArray: async () => {
        return this.data.slice(0, n)
      }
    }
  }
}

// Mock database class
class MockDB {
  focus = new MockTable<Focus>(dummyData.focus)
  pulse = new MockTable<Pulse>(dummyData.pulse)
  activitySummary = new MockTable<ActivitySummary>(dummyData.activitySummary)
  quizQuestions = new MockTable<QuizQuestion>(dummyData.quizQuestions)
  chat = new MockTable<Chat>(dummyData.chat)
  chatMessages = new MockTable<ChatMessage>(dummyData.chatMessages)
  pastWins = new MockTable<PastWin>(dummyData.pastWins)
  pomodoro = new MockTable<PomodoroState>(dummyData.pomodoro)
  processedIntents = new MockTable<ProcessedIntent>(dummyData.processedIntents)
  intentQueue = new MockTable<any>(dummyData.intentQueue)
  websiteVisits = new MockTable<WebsiteVisit>(dummyData.websiteVisits)
  textAttention = new MockTable<TextAttention>(dummyData.textAttention)
  imageAttention = new MockTable<ImageAttention>(dummyData.imageAttention)
  audioAttention = new MockTable<AudioAttention>(dummyData.audioAttention)
  youtubeAttention = new MockTable<YoutubeAttention>(dummyData.youtubeAttention)

  table<T>(name: string): MockTable<T> {
    return (this as any)[name] as MockTable<T>
  }
}

const db = new MockDB()

export default db
