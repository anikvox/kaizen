import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export type TextSelectionAction = "summarize" | "proofread" | "translate" | "rephrase" | "add_to_chat"

export type TextSelectionRequest = {
  action: TextSelectionAction
  text: string
}

export type TextSelectionResponse = {
  success: boolean
  error?: string
}

const handler: PlasmoMessaging.MessageHandler<TextSelectionRequest, TextSelectionResponse> = async (req, res) => {
  const body = req.body
  if (!body) {
    res.send({ success: false, error: "No body provided" })
    return
  }

  const { action, text } = body

  // Build the prompt based on action
  let prompt: string
  switch (action) {
    case "summarize":
      prompt = `Summarize the following text:\n\n${text}`
      break
    case "proofread":
      prompt = `Proofread the following text and correct any errors:\n\n${text}`
      break
    case "translate":
      prompt = `Translate the following text:\n\n${text}`
      break
    case "rephrase":
      prompt = `Rephrase the following text:\n\n${text}`
      break
    case "add_to_chat":
      prompt = text
      break
    default:
      prompt = text
  }

  console.log("[Kaizen] Text selection action received:", action, "text length:", text.length)

  // Get tabId from sender immediately - matching neuropilot's pattern
  const tabId = req.sender?.tab?.id
  if (!tabId) {
    res.send({ success: false, error: "No tab found" })
    return
  }

  try {
    // Open sidepanel first - just like neuropilot does
    await chrome.sidePanel.open({ tabId })
    console.log("[Kaizen] Sidepanel opened for tabId:", tabId)

    // Small delay to ensure sidepanel is ready
    await new Promise(resolve => setTimeout(resolve, 100))

    // Now store the pending prompt (sidepanel will pick it up)
    await storage.set("pendingChatPrompt", {
      prompt,
      action,
      timestamp: Date.now()
    })
    console.log("[Kaizen] Stored pending prompt")

    res.send({ success: true })
  } catch (error) {
    console.error("[Kaizen] Failed to open sidepanel:", error)
    res.send({ success: false, error: String(error) })
  }
}

export default handler
