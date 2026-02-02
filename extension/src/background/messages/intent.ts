import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import db from "~db"
import { INTENT_QUEUE_NOTIFY } from "~default-settings"

const storage = new Storage()

export const CODE_TO_LANGUAGE = {
  en: "English",
  es: "Spanish",
  hi: "Hindi",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  bn: "Bengali",
  id: "Indonesian",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  nl: "Dutch",
  pl: "Polish"
}

type IntentAction = "proofread" | "translate" | "rephrase" | "summarize" | "chat"

export type Intent =
  | {
      name: IntentAction
      type: "PROOFREAD"
      text: string
      timestamp: number
      processed?: boolean
    }
  | {
      name: IntentAction
      type: "TRANSLATE"
      text: string
      language: keyof typeof CODE_TO_LANGUAGE
      timestamp: number
      processed?: boolean
    }
  | {
      name: IntentAction
      type: "REPHRASE"
      text: string
      timestamp: number
      processed?: boolean
    }
  | {
      name: IntentAction
      type: "SUMMARIZE"
      text: string
      timestamp: number
      processed?: boolean
    }
  | {
      name: IntentAction
      type: "CHAT"
      payload: string
      payloadType: "TEXT"
      timestamp: number
      processed?: boolean
    }

const notifySidepanelOpened = async (tabId: number) => {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SIDEPANEL_OPENED" })
  } catch (err) {
    console.debug("Could not notify content script:", err)
  }
}

const handler: PlasmoMessaging.MessageHandler = async (req) => {
  const tabId = req.sender.tab?.id
  if (!tabId) return

  switch (req.body.type as IntentAction) {
    case "chat": {
      await db.table<Intent>("intentQueue").add({
        name: "chat",
        type: "CHAT",
        payload: req.body.text,
        payloadType: "TEXT",
        timestamp: Date.now(),
        processed: false
      })
      break
    }
    case "proofread": {
      await db.table<Intent>("intentQueue").add({
        name: "proofread",
        type: "PROOFREAD",
        text: req.body.text,
        timestamp: Date.now(),
        processed: false
      })
      break
    }
    case "rephrase": {
      await db.table<Intent>("intentQueue").add({
        name: "rephrase",
        type: "REPHRASE",
        text: req.body.text,
        timestamp: Date.now(),
        processed: false
      })
      break
    }
    case "summarize": {
      await db.table<Intent>("intentQueue").add({
        name: "summarize",
        type: "SUMMARIZE",
        text: req.body.text,
        timestamp: Date.now(),
        processed: false
      })
      break
    }
    case "translate": {
      await db.table<Intent>("intentQueue").add({
        name: "translate",
        type: "TRANSLATE",
        text: req.body.text,
        language: req.body.language,
        timestamp: Date.now(),
        processed: false
      })
      break
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 300))
  await storage.set(INTENT_QUEUE_NOTIFY.key, Date.now())
  await notifySidepanelOpened(tabId)
}

export default handler
