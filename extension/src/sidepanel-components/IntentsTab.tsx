import { useLiveQuery } from "~hooks/useLiveQuery"
import { useEffect, useMemo, useState } from "react"

import type { Intent } from "~background/messages/intent"
import { CODE_TO_LANGUAGE } from "~background/messages/intent"
import db, { type ProcessedIntent } from "~db"
import { SERVER_URL } from "~default-settings"

const DEVICE_TOKEN_KEY = "kaizen_device_token"

const getAuthToken = async (): Promise<string | null> => {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return result[DEVICE_TOKEN_KEY] || null
  } catch (error) {
    console.error("Error getting device token:", error)
    return null
  }
}

const getIntentIcon = (type: string) => {
  switch (type) {
    case "PROOFREAD":
      return "📝"
    case "TRANSLATE":
      return "🌐"
    case "REPHRASE":
      return "✏️"
    case "SUMMARIZE":
      return "📋"
    case "CHAT":
      return "💬"
    default:
      return "💡"
  }
}

const processProofread = async (
  text: string,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  try {
    const token = await getAuthToken()
    if (!token) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(`${SERVER_URL}/ai/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ prompt: `Proofread and correct any errors in this text: ${text}` })
    })

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`)
    }

    const data = await response.json()
    if (onChunk) {
      onChunk(data.text)
    }
    return data.text
  } catch (error) {
    console.error("Error in processProofread:", error)
    throw new Error(
      `Proofreading failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

const processTranslate = async (
  text: string,
  language: keyof typeof CODE_TO_LANGUAGE,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  try {
    const token = await getAuthToken()
    if (!token) {
      throw new Error("Not authenticated")
    }

    const targetLanguage = CODE_TO_LANGUAGE[language]
    const prompt = `Translate the following text to ${targetLanguage}. Only provide the translation, no explanations:\n\n${text}`

    const response = await fetch(`${SERVER_URL}/ai/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ prompt })
    })

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`)
    }

    const data = await response.json()
    if (onChunk) {
      onChunk(data.text)
    }
    return data.text
  } catch (error) {
    console.error("Error in processTranslate:", error)
    throw new Error(
      `Translation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

const processRephrase = async (
  text: string,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  try {
    const token = await getAuthToken()
    if (!token) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(`${SERVER_URL}/ai/rewrite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    })

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`)
    }

    const data = await response.json()
    if (onChunk) {
      onChunk(data.text)
    }
    return data.text
  } catch (error) {
    console.error("Error in processRephrase:", error)
    throw new Error(
      `Rephrasing failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

const processSummarize = async (
  text: string,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  try {
    const token = await getAuthToken()
    if (!token) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(`${SERVER_URL}/ai/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    })

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`)
    }

    const data = await response.json()
    if (onChunk) {
      onChunk(data.text)
    }
    return data.text
  } catch (error) {
    console.error("Error in processSummarize:", error)
    throw new Error(
      `Summarization failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

export const IntentsTab = () => {
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set())

  const iq = useLiveQuery(() => {
    return db
      .table<Intent>("intentQueue")
      .orderBy("timestamp")
      .reverse()
      .limit(20)
      .toArray()
  }, [])
  const intentQueue = iq?.filter((intent) => intent.type !== "CHAT")

  const processedIntents = useLiveQuery(() => {
    return db.table<ProcessedIntent>("processedIntents").toArray()
  }, [])

  const resultsMap = useMemo(() => {
    const map = new Map<number, ProcessedIntent>()
    processedIntents?.forEach((pi) => {
      map.set(pi.intentId, pi)
    })
    return map
  }, [processedIntents])

  useEffect(() => {
    if (!intentQueue) return

    const processIntent = async (intent: Intent & { id?: number }) => {
      if (!intent.id || intent.processed || processingIds.has(intent.id)) {
        return
      }

      if (resultsMap.has(intent.id)) {
        return
      }

      setProcessingIds((prev) => new Set(prev).add(intent.id!))

      try {
        let result: string
        let originalText: string = ""

        switch (intent.type) {
          case "PROOFREAD":
            originalText = intent.text
            result = await processProofread(intent.text)
            break
          case "TRANSLATE":
            if ("language" in intent && "text" in intent) {
              originalText = intent.text
              result = await processTranslate(
                intent.text,
                intent.language as keyof typeof CODE_TO_LANGUAGE
              )
            } else {
              result = "Translation error: No language specified"
            }
            break
          case "REPHRASE":
            originalText = intent.text
            result = await processRephrase(intent.text)
            break
          case "SUMMARIZE":
            originalText = intent.text
            result = await processSummarize(intent.text)
            break
          default:
            result = "Unknown intent type"
        }

        await db.table<ProcessedIntent>("processedIntents").add({
          intentId: intent.id,
          intentType: intent.type,
          originalText: originalText,
          result,
          timestamp: Date.now()
        })

        await db.table("intentQueue").update(intent.id, {
          processed: true
        })
      } catch (error) {
        console.error("Error processing intent:", error)
        const errorText = "text" in intent ? intent.text : ""
        await db.table<ProcessedIntent>("processedIntents").add({
          intentId: intent.id,
          intentType: intent.type,
          originalText: errorText,
          result: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        })
      } finally {
        setProcessingIds((prev) => {
          const newSet = new Set(prev)
          newSet.delete(intent.id!)
          return newSet
        })
      }
    }

    intentQueue.forEach((intent) => {
      processIntent(intent)
    })
  }, [intentQueue, resultsMap, processingIds])

  const handleDelete = async (intent: Intent & { id?: number }) => {
    if (intent.id) {
      await db.table("intentQueue").delete(intent.id)

      const processedResult = await db
        .table<ProcessedIntent>("processedIntents")
        .where("intentId")
        .equals(intent.id)
        .first()

      if (processedResult?.id) {
        await db.table("processedIntents").delete(processedResult.id)
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-4">
      <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-sm rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
        {intentQueue && intentQueue.length > 0 ? (
          <div className="space-y-3">
            {intentQueue.map((intent, index) => {
              const intentWithId = intent as Intent & { id?: number }
              const isProcessing =
                intentWithId.id && processingIds.has(intentWithId.id)
              const processedResult = intentWithId.id
                ? resultsMap.get(intentWithId.id)
                : null

              return (
                <div
                  key={index}
                  className="bg-white/50 dark:bg-slate-600/40 backdrop-blur-sm p-4 rounded-lg border border-gray-300/50 dark:border-slate-500/50 shadow-md">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">
                      {getIntentIcon(intent.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                          {intent.type}
                        </span>
                        {intent.type === "TRANSLATE" &&
                          "language" in intent && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              → {CODE_TO_LANGUAGE[intent.language]}
                            </span>
                          )}
                        {isProcessing && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse">
                            Processing...
                          </span>
                        )}
                        {processedResult && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            ✓ Processed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
                        {intent.text}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {new Date(intent.timestamp).toLocaleString()}
                      </p>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleDelete(intentWithId)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-md transition-colors">
                          Delete
                        </button>
                      </div>

                      {processedResult && !isProcessing && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                          <p className="text-xs font-semibold text-green-800 dark:text-green-400 mb-1">
                            Result:
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300 whitespace-pre-wrap">
                            {processedResult.result}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2">No learning items in queue</p>
            <p className="text-xs italic">
              Use context menu actions to add learning items
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
