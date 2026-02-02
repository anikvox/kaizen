import { useLiveQuery } from "~hooks/useLiveQuery"
import { Image, MessageSquare, Mic, Send, Sparkles } from "lucide-react"
import { marked } from "marked"
import React, { useEffect, useMemo, useRef, useState } from "react"

import type { Intent } from "~background/messages/intent"
import { ChatService } from "~chat"
import db, { type ChatMessage } from "~db"
import { getRewriter, getWriter } from "~model"
import { allUserActivityForLastMs, attentionContent } from "~utils"

interface ChatProps {
  chatId: string
  isNewChat?: boolean
  onChatCreated?: (chatId: string) => void
  onUsageUpdate?: (usage: { inputUsage: number; inputQuota: number }) => void
  onNewChatRequested?: () => void
}

// Fixed context window of 30 minutes
const CONTEXT_WINDOW_MS = 30 * 60 * 1000

marked.use({
  renderer: {
    link({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer"
        class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
        style="cursor: pointer; word-break: break-all; overflow-wrap: anywhere; display: inline;">
        ${text}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="5 5 18 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          style="display: inline-block; margin-left: 1px; transform: translateY(2px);">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </a>`
    }
  }
})


export const Chat: React.FC<ChatProps> = ({
  chatId,
  isNewChat = false,
  onChatCreated,
  onUsageUpdate,
  onNewChatRequested
}) => {
  const [messageText, setMessageText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState("")
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [selectedAudios, setSelectedAudios] = useState<File[]>([])
  const [writing, setWriting] = useState(false)
  const [messagesHeight, setMessagesHeight] = useState(90) // percentage
  const [isDragging, setIsDragging] = useState(false)
  const [usageInfo, setUsageInfo] = useState<{ inputUsage: number; inputQuota: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const MAX_FILES = 5

  // Memoize ChatService instance
  const chatService = useMemo(() => {
    const service = new ChatService(chatId)
    service.setContextWindowMs(CONTEXT_WINDOW_MS)
    return service
  }, [chatId])

  // Fetch messages from server instead of IndexedDB
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  // Fetch messages from server when chatId changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!chatId || chatId.startsWith('chat-')) {
        // Local chat ID, no server messages
        setMessages([])
        return
      }

      setIsLoadingMessages(true)
      try {
        const serverMessages = await chatService.getMessages(chatId)
        console.log(`[Sidepanel Chat] Fetched ${serverMessages.length} messages from server for session: ${chatId}`)
        setMessages(serverMessages)
      } catch (error) {
        console.error("[Sidepanel Chat] Error fetching messages:", error)
        setMessages([])
      } finally {
        setIsLoadingMessages(false)
      }
    }

    fetchMessages()
    
    // Poll for new messages every 3 seconds
    const interval = setInterval(fetchMessages, 3000)
    return () => clearInterval(interval)
  }, [chatId, chatService])
  
  useEffect(() => {
    console.log(`[Sidepanel Chat] Displaying ${messages?.length || 0} messages for chatId: ${chatId}`, messages)
  }, [messages, chatId])

  // Fetch the latest unprocessed intent
  const latestIntent = useLiveQuery(async () => {
    const intents = await db
      .table<any>("intentQueue")
      .orderBy("timestamp")
      .reverse()
      .toArray()
    // Manual filter and limit for mock table
    return intents.find((intent) => !intent.processed)
  }, [])

  // Watch for new chat intents and add them to the message text
  useEffect(() => {
    const base64ToFile = (base64String: string, filename: string) => {
      const arr = base64String.split(",")
      const mime = arr[0].match(/:(.*?);/)?.[1] ?? "application/octet-stream"
      const bstr = atob(arr[1])
      const n = bstr.length
      const u8arr = new Uint8Array(n)
      for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i)
      return new File([u8arr], filename, { type: mime })
    }

    if (latestIntent && latestIntent.type === "CHAT") {
      if (
        latestIntent.payloadType === "TEXT" &&
        latestIntent.name !== "chat-with-this-page"
      ) {
        setMessageText(latestIntent.payload)
      } else if (latestIntent.payloadType === "IMAGE") {
        setSelectedImages([base64ToFile(latestIntent.payload, "image.png")])
      } else if (latestIntent.payloadType === "AUDIO") {
        setSelectedAudios([base64ToFile(latestIntent.payload, "audio.mp3")])
      }

      // Consume the intent by updating it in the mock table
      const consumeIntent = async () => {
        const table = db.table<any>("intentQueue")
        const intents = await table.where("timestamp").equals(latestIntent.timestamp).toArray()
        if (intents.length > 0) {
          const updatedIntent = { ...intents[0], processed: true }
          await table.put(updatedIntent)
        }
      }
      consumeIntent()
    }
  }, [latestIntent])

  useEffect(() => {
    const fetchHistory = async () => {
      if (!chatId || chatId === "default" || chatId === "") return

      try {
        console.log(`[Sidepanel Chat] Fetching messages for chatId: ${chatId}`)
        const backendMessages = await chatService.getMessages(chatId)
        console.log(`[Sidepanel Chat] Received ${backendMessages.length} messages from backend:`, backendMessages)
        
        if (backendMessages && backendMessages.length > 0) {
          const table = db.table<ChatMessage>("chatMessages")
          
          await table.where("chatId").equals(chatId).delete()
          console.log(`[Sidepanel Chat] Cleared local messages for chatId: ${chatId}`)
          
          for (const msg of backendMessages) {
            await table.add({
              chatId,
              by: msg.role === 'user' ? 'user' : 'bot',
              type: 'text' as const,
              content: msg.content,
              timestamp: new Date(msg.createdAt).getTime()
            })
          }
          console.log(`[Sidepanel Chat] Added ${backendMessages.length} messages to IndexedDB`)
        } else {
          console.log(`[Sidepanel Chat] No messages received from backend`)
        }
      } catch (error) {
        console.error("Failed to fetch chat history from backend:", error)
      }
    }

    fetchHistory()
    
    const interval = setInterval(fetchHistory, 3000)
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchHistory()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [chatId, chatService])

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest"
      })
    }
  }

  // Auto-scroll to bottom when messages change or during streaming
  useEffect(() => {
    scrollToBottom()
  }, [messages?.length, streamingMessage])

  useEffect(() => {
    const fetchSessionUsage = async () => {
      const session = await chatService.getSession()
      if (session && 'inputUsage' in session && 'inputQuota' in session) {
        const usage = {
          inputUsage: session.inputUsage as number,
          inputQuota: session.inputQuota as number
        }
        setUsageInfo(usage)
        onUsageUpdate?.(usage)
      }
    }
    fetchSessionUsage()
  }, [messages, onUsageUpdate, chatService])

  useEffect(() => {
    // Component mount/unmount logic - Currently nothing to cleanup
    return () => { }
  }, [chatService])

  // Handle dragging for resizable divider
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newHeight =
        ((e.clientY - containerRect.top) / containerRect.height) * 100

      // Constrain between 20% and 80%
      const constrainedHeight = Math.max(20, Math.min(80, newHeight))
      setMessagesHeight(constrainedHeight)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "ns-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isDragging])

  const handleSendMessage = async () => {
    if (
      (!messageText.trim() &&
        selectedImages.length === 0 &&
        selectedAudios.length === 0) ||
      isStreaming ||
      !chatId ||
      chatId === ""
    )
      return

    console.log(`[Sidepanel Chat] Sending message to session: ${chatId}`)

    const userMessage = messageText
    const images = selectedImages.length > 0 ? selectedImages : null
    const audios = selectedAudios.length > 0 ? selectedAudios : null

    // Add user message to local state immediately for UI feedback
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])

    setMessageText("")
    setSelectedImages([])
    setSelectedAudios([])

    setIsStreaming(true)
    setStreamingMessage("")

    try {
      let fullResponse = ""
      
      // Build context from recent activity
      const attention = attentionContent(
        await allUserActivityForLastMs(CONTEXT_WINDOW_MS)
      )
      const context = `Recent Activity Context:\n${attention}`

      console.log(`[Sidepanel Chat] Streaming response for session: ${chatId}`)
      
      for await (const response of chatService.streamResponse(userMessage, context)) {
        fullResponse = response.text
        setStreamingMessage(fullResponse)

        if (response.done) {
          // Add assistant message to local state
          const assistantMsg: ChatMessage = {
            id: `temp-${Date.now()}-assistant`,
            role: "assistant",
            content: fullResponse,
            createdAt: new Date().toISOString()
          }
          setMessages(prev => [...prev, assistantMsg])
          setStreamingMessage("")
          setIsStreaming(false)
          
          console.log("[Sidepanel Chat] Message sent successfully to session:", chatId)
          
          // Refresh messages from server after a short delay
          setTimeout(async () => {
            try {
              const serverMessages = await chatService.getMessages(chatId)
              setMessages(serverMessages)
            } catch (error) {
              console.error("[Sidepanel Chat] Error refreshing messages:", error)
            }
          }, 1000)
          
          break
        }
      }
    } catch (error) {
      console.error("[Sidepanel Chat] Error sending message:", error)
      setIsStreaming(false)
      setStreamingMessage("")
      // Remove the temporary user message on error
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const imageFiles = files.filter((f) => f.type.startsWith("image/"))

    const totalFiles =
      selectedImages.length + selectedAudios.length + imageFiles.length
    if (totalFiles > MAX_FILES) {
      alert(`You can only attach up to ${MAX_FILES} files total`)
      return
    }

    setSelectedImages((prev) => [...prev, ...imageFiles])
    e.target.value = "" // Reset input
  }

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const audioFiles = files.filter((f) => f.type.startsWith("audio/"))

    const totalFiles =
      selectedImages.length + selectedAudios.length + audioFiles.length
    if (totalFiles > MAX_FILES) {
      alert(`You can only attach up to ${MAX_FILES} files total`)
      return
    }

    setSelectedAudios((prev) => [...prev, ...audioFiles])
    e.target.value = "" // Reset input
  }

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const removeAudio = (index: number) => {
    setSelectedAudios((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRewrite = async () => {
    if (!messageText.trim() || isStreaming) return
    setWriting(true)

    try {
      const rewriter = await getRewriter()
      const rewritten = await rewriter.rewrite(messageText)
      setMessageText(rewritten)
      if ((rewriter as any).destroy) (rewriter as any).destroy()
    } finally {
      setWriting(false)
    }
  }

  const handleWrite = async () => {
    if (isStreaming) return
    setWriting(true)

    try {
      const writer = await getWriter()
      const attention = attentionContent(
        await allUserActivityForLastMs(CONTEXT_WINDOW_MS)
      )
      const previousMessages = `\n\nThe previous messages are: ${messages
        .filter((m) => m.type === "text")
        .map((m) => m.content)
        .join("\n\n")}`

      const context = `${attention}${messages.length > 0 ? previousMessages : ""}`

      const written = await writer.write(
        `Help me write a random interesting prompt based on what I was reading about as given in the context. Just return the prompt, nothing else. Don't start with Prompt. Context: ${context}`
      )
      setMessageText(written)
      if ((writer as any).destroy) (writer as any).destroy()
    } finally {
      setWriting(false)
    }
  }

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    // Just now (< 1 min)
    if (diffMins < 1) return 'Just now'
    // Minutes ago (< 1 hour)
    if (diffMins < 60) return `${diffMins}m ago`
    // Hours ago (< 24 hours)
    if (diffHours < 24) return `${diffHours}h ago`
    // Days ago (< 7 days)
    if (diffDays < 7) return `${diffDays}d ago`
    // Older: show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const renderMessage = (message: ChatMessage) => {
    // Handle both server format (role) and local format (by)
    const isUser = (message as any).role === "user" || (message as any).by === "user"

    return (
      <div
        key={message.id}
        className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4 animate-fadeIn`}>
        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-xs lg:max-w-md xl:max-w-lg`}>
          <div
            className={`px-4 py-3 backdrop-blur-sm rounded-2xl shadow-sm ${isUser
              ? "bg-blue-600 text-white rounded-br-sm"
              : " text-slate-900 dark:text-slate-100 rounded-bl-sm"
              }`}>
            <div
              className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{
                __html: marked.parse(message.content) as string
              }}
            />
          </div>
          {message.createdAt && (
            <span className={`text-[10px] mt-1 px-1 ${isUser ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
              {formatMessageTime(message.createdAt)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Messages Container */}
      <div
        className="overflow-y-auto p-6 space-y-2 relative"
        style={{ height: `${messagesHeight}%` }}>
        {messages && messages.length > 0 ? (
          <>
            {messages.map(renderMessage)}
            {isStreaming && (
              <div className="flex justify-start mb-4 animate-fadeIn">
                <div className="max-w-xs lg:max-w-md xl:max-w-lg px-4 py-3 rounded-2xl shadow-sm backdrop-blur-sm bg-transparent text-slate-900 dark:text-slate-100 rounded-bl-sm">
                  {streamingMessage ? (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 break-words overflow-wrap-anywhere"
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(streamingMessage) as string
                      }}
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex items-end justify-center h-full p-6 ">
            <div className="backdrop-blur-xs bg-white/40 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-lg p-4 max-w-sm w-full">
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-600/30 dark:to-purple-600/30 rounded-xl backdrop-blur-sm">
                    <MessageSquare
                      size={28}
                      className="text-blue-600 dark:text-blue-400"
                    />
                  </div>
                </div>
                <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Start a Conversation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ask me anything about your browsing activity, get insights, or
                  just chat!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating New Chat Button - Only show after first complete conversation */}
      {messages && messages.length >= 2 && onNewChatRequested && (
        <div className="sticky bottom-[15px] mb-4 left-1/2 -translate-x-1/2 z-10 w-fit mx-auto pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={onNewChatRequested}
              className="group flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/60 dark:border-slate-600/60 rounded-full shadow-lg hover:shadow-xl hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all duration-300 hover:scale-105 active:scale-95">
              <span className="text-lg leading-none">+</span>
              <span>new chat</span>
            </button>
            {usageInfo && (
              <div
                className={`flex items-center justify-center mt-1 w-8 h-8 rounded-full shadow-sm ${usageInfo.inputUsage / (usageInfo.inputQuota / 1.2) < 0.75
                  ? "bg-white"
                  : "bg-white"
                  }`}
                title={`${usageInfo.inputUsage} / ${usageInfo.inputQuota / 1.2}`}>
                <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    strokeWidth="3"
                    className={usageInfo.inputUsage / (usageInfo.inputQuota / 1.2) < 0.75
                      ? "stroke-green-200 dark:stroke-green-800"
                      : "stroke-yellow-200 dark:stroke-yellow-800"
                    }
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(usageInfo.inputUsage / (usageInfo.inputQuota / 1.2)) * 50.27} 50.27`}
                    className={usageInfo.inputUsage / (usageInfo.inputQuota / 1.2) < 0.75
                      ? "stroke-green-600 dark:stroke-green-400"
                      : "stroke-yellow-600 dark:stroke-yellow-400"
                    }
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Draggable Divider */}
      <div
        onMouseDown={() => setIsDragging(true)}
        className={`h-1 bg-slate-200 dark:bg-slate-700 hover:bg-blue-400 dark:hover:bg-blue-600 cursor-ns-resize transition-colors flex-shrink-0 ${isDragging ? "bg-blue-500 dark:bg-blue-500" : ""
          }`}
        title="Drag to resize"
      />

      {/* Bottom Section Container - Takes remaining height */}
      <div
        className="flex flex-col flex-1"
        style={{ height: `${80 - messagesHeight}%` }}>
        {/* Input Container */}
        <div className="flex-1 flex flex-col justify-end border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50">
          {/* Selected Files Preview */}
          {(selectedImages.length > 0 || selectedAudios.length > 0) && (
            <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700">
              <div className="flex flex-wrap gap-2">
                {selectedImages.map((image, idx) => (
                  <div
                    key={`img-${idx}`}
                    className="relative group bg-slate-200 dark:bg-slate-700 rounded-lg p-2 flex items-center gap-2">
                    <Image
                      size={16}
                      className="text-slate-600 dark:text-slate-400"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 max-w-[100px] truncate">
                      {image.name}
                    </span>
                    <button
                      onClick={() => removeImage(idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 dark:hover:text-red-400 text-lg leading-none"
                      title="Remove">
                      ×
                    </button>
                  </div>
                ))}
                {selectedAudios.map((audio, idx) => (
                  <div
                    key={`audio-${idx}`}
                    className="relative group bg-slate-200 dark:bg-slate-700 rounded-lg p-2 flex items-center gap-2">
                    <Mic
                      size={16}
                      className="text-slate-600 dark:text-slate-400"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 max-w-[100px] truncate">
                      {audio.name}
                    </span>
                    <button
                      onClick={() => removeAudio(idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 dark:hover:text-red-400 text-lg leading-none"
                      title="Remove">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-2 backdrop-blur-xs flex-1 flex flex-col">
            <div className="flex-1 flex items-stretch gap-2 min-h-0">
              {/* Image Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  selectedImages.length + selectedAudios.length >= MAX_FILES ||
                  isStreaming
                }
                className="p-2 self-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Attach Image">
                <Image size={18} />
              </button>

              {/* Audio Upload */}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={handleAudioUpload}
                className="hidden"
              />
              <button
                onClick={() => audioInputRef.current?.click()}
                disabled={
                  selectedImages.length + selectedAudios.length >= MAX_FILES ||
                  isStreaming
                }
                className="p-2 self-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Attach Audio">
                <Mic size={18} />
              </button>

              {/* Text Input */}
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                disabled={writing}
                placeholder={
                  writing ? "Writing a prompt..." : "Type a message..."
                }
                className={`${writing && "animate-pulse"} flex-1 resize-none border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-600/50 focus:border-blue-500 dark:focus:border-blue-600 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200 bg-white dark:bg-slate-800 shadow-sm`}
              />

              {/* Write / Rewrite Button */}
              <button
                onClick={messageText.trim() ? handleRewrite : handleWrite}
                disabled={isStreaming || writing}
                className="p-2 self-center text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  messageText.trim()
                    ? "Rewrite with AI"
                    : "Generate message with AI"
                }>
                <Sparkles size={18} />
              </button>

              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={
                  (!messageText.trim() &&
                    selectedImages.length === 0 &&
                    selectedAudios.length === 0) ||
                  isStreaming ||
                  !chatId ||
                  chatId === ""
                }
                className="p-2 self-center bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-600 dark:disabled:to-slate-700 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none"
                title="Send Message">
                {isStreaming ? (
                  <div className="w-[18px] h-[18px] flex items-center justify-center">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        animation: "pulse 1.5s ease-in-out infinite",
                        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.2)"
                      }}
                    />
                    <style>{`
                    @keyframes pulse {
                      0%, 100% {
                        opacity: 1;
                        transform: scale(1);
                      }
                      50% {
                        opacity: 0.6;
                        transform: scale(1.4);
                      }
                    }
                  `}</style>
                  </div>
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
