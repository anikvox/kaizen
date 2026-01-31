// Intent types for learning queue

export type IntentType =
  | "proofread"
  | "translate"
  | "rephrase"
  | "summarize"
  | "chat"

export type Intent = {
  id?: number
  type: IntentType
  text: string
  url: string
  timestamp: number
  metadata?: {
    targetLanguage?: string
    tone?: string
    format?: string
  }
}

export type IntentQueueItem = Intent & {
  id: number
  processed: boolean
  result?: string
}
