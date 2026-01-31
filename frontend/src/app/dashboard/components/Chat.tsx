"use client";

import { useAuth } from "@clerk/nextjs";
import { MessageSquare, Plus, Send, Sparkles, Trash2, Loader2, Image as ImageIcon, Mic, MoreVertical } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardChatService, ChatSession, ChatMessage } from "../lib/chat";
import { marked } from "marked";
import { motion, AnimatePresence } from "framer-motion";

// Configure marked for safe link rendering
marked.use({
    renderer: {
        link({ href, title, text }) {
            const titleAttr = title ? ` title="${title}"` : '';
            return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer"
                class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-semibold transition-colors inline-flex items-center gap-1">
                ${text}
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="inline-block transform translate-y-[1px]">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
            </a>`;
        }
    }
});

const REFLECTION_RANGES = [
    { label: "10m", value: 10 * 60 * 1000 },
    { label: "30m", value: 30 * 60 * 1000 },
    { label: "1h", value: 60 * 60 * 1000 },
    { label: "4h", value: 4 * 60 * 60 * 1000 },
    { label: "1d", value: 24 * 60 * 60 * 1000 }
];

export function Chat() {
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const [message, setMessage] = useState("");
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState("");
    const [reflectionRange, setReflectionRange] = useState(30 * 60 * 1000);
    const [messagesHeight, setMessagesHeight] = useState(70); // percentage for resizable layout
    const [isDragging, setIsDragging] = useState(false);
    const focusScore = 82; // Mock focus score for the gauge

    const chatServiceRef = useRef<DashboardChatService | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingMessage, scrollToBottom]);

    // Initialize chat
    useEffect(() => {
        const initChat = async () => {
            if (!isSignedIn) return;
            try {
                const token = await getToken();
                if (!token) return;

                const service = new DashboardChatService(token);
                chatServiceRef.current = service;

                const sessions = await service.getSessions();
                setChats(sessions);
                if (sessions.length > 0 && !selectedChatId) {
                    setSelectedChatId(sessions[0].id);
                }
            } catch (error) {
                console.error("Failed to initialize chat:", error);
            } finally {
                setIsLoading(false);
            }
        };

        if (isLoaded && isSignedIn) {
            initChat();
        }
    }, [isLoaded, isSignedIn, getToken]);

    // Fetch messages for selected chat
    useEffect(() => {
        const fetchMessages = async () => {
            if (!selectedChatId || !chatServiceRef.current) return;
            try {
                const msgs = await chatServiceRef.current.getMessages(selectedChatId);
                setMessages(msgs);
            } catch (error) {
                console.error("Failed to fetch messages:", error);
            }
        };

        fetchMessages();
    }, [selectedChatId]);

    // Handle dragging for resizable layout
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const newHeight = ((e.clientY - rect.top) / rect.height) * 100;
            setMessagesHeight(Math.max(20, Math.min(80, newHeight)));
        };
        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleCreateChat = async () => {
        if (!chatServiceRef.current) return;
        try {
            const newSession = await chatServiceRef.current.createSession();
            setChats([newSession, ...chats]);
            setSelectedChatId(newSession.id);
            setMessages([]);
        } catch (error) {
            console.error("Failed to create chat:", error);
        }
    };

    const handleDeleteChat = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (!chatServiceRef.current) return;
        if (!confirm("Delete this conversation?")) return;

        try {
            await chatServiceRef.current.deleteSession(sessionId);
            setChats(chats.filter(c => c.id !== sessionId));
            if (selectedChatId === sessionId) {
                const nextChat = chats.find(c => c.id !== sessionId);
                setSelectedChatId(nextChat?.id || null);
                setMessages([]);
            }
        } catch (error) {
            console.error("Failed to delete chat:", error);
        }
    };

    const handleSendMessage = async () => {
        if (!message.trim() || !selectedChatId || !chatServiceRef.current || isSending) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            content: message,
            createdAt: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMsg]);
        const currentMsg = message;
        setMessage("");
        setIsSending(true);
        setStreamingMessage("");

        try {
            let fullResponse = "";
            const stream = chatServiceRef.current.sendMessageStreaming(
                selectedChatId,
                currentMsg,
                `Reflection Range: ${REFLECTION_RANGES.find(r => r.value === reflectionRange)?.label}`
            );

            for await (const response of stream) {
                if (response.title) {
                    setChats(prev => prev.map(c => c.id === selectedChatId ? { ...c, title: response.title! } : c));
                }
                if (response.chunk) {
                    fullResponse += response.chunk;
                    setStreamingMessage(fullResponse);
                }
            }

            const assistantMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: fullResponse,
                createdAt: new Date().toISOString()
            };

            setMessages(prev => [...prev, assistantMsg]);
            setStreamingMessage("");
        } catch (error) {
            console.error("Failed to send message:", error);
        } finally {
            setIsSending(false);
        }
    };

    if (!isLoaded || !isSignedIn) return null;

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
            </div>
        );
    }

    const selectedChat = chats.find(c => c.id === selectedChatId);

    return (
        <div className="h-full flex gap-6 p-6 overflow-hidden">
            {/* Sidebar */}
            <div className="w-80 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col shadow-xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                    <button
                        onClick={handleCreateChat}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-3 rounded-xl transition-all font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus size={20} />
                        <span>New Conversation</span>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
                    {chats.length > 0 ? chats.map((chat) => (
                        <div
                            key={chat.id}
                            onClick={() => setSelectedChatId(chat.id)}
                            className={`group p-4 mb-2 rounded-xl cursor-pointer transition-all ${selectedChatId === chat.id
                                ? "bg-blue-50/80 dark:bg-blue-900/20 border-l-4 border-l-blue-500 shadow-md ring-1 ring-blue-200/50 dark:ring-blue-800/50"
                                : "hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                                }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div className={`p-1.5 rounded-lg ${selectedChatId === chat.id ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                        <MessageSquare
                                            size={14}
                                            className={selectedChatId === chat.id ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}
                                        />
                                    </div>
                                    <h3 className={`font-bold truncate text-sm ${selectedChatId === chat.id ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {chat.title}
                                    </h3>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteChat(e, chat.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 ml-8 font-medium">
                                {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {" • "}
                                {new Date(chat.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </p>
                        </div>
                    )) : (
                        <div className="h-full flex flex-col items-center justify-center p-8 opacity-50">
                            <MessageSquare className="w-12 h-12 mb-2 text-gray-300" />
                            <p className="text-sm font-medium text-gray-400">No chats yet</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Conversation Area */}
            <div ref={containerRef} className="flex-1 flex flex-col bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden relative">
                {selectedChatId ? (
                    <>
                        {/* Header */}
                        <div className="bg-white/40 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between backdrop-blur-md z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-2xl shadow-inner border border-blue-200/20 dark:border-blue-800/20">
                                    <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 leading-tight">
                                        {selectedChat?.title === "New Chat" ? "Exploration Session" : selectedChat?.title}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-black opacity-80">
                                            Live Interaction Mode
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                {/* Focus Depth Gauge (Inspired by alphazero's usage indicator) */}
                                <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-800/50 shadow-sm">
                                    <div className="relative w-8 h-8 flex items-center justify-center">
                                        <svg className="w-full h-full -rotate-90">
                                            <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-100 dark:text-blue-900/40" />
                                            <circle
                                                cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                                                strokeDasharray={88} strokeDashoffset={88 - (88 * focusScore) / 100}
                                                className="text-blue-600 dark:text-blue-400 transition-all duration-1000"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <span className="absolute text-[9px] font-black text-blue-700 dark:text-blue-300">{focusScore}%</span>
                                    </div>
                                    <div className="hidden sm:block">
                                        <p className="text-[8px] font-black text-blue-400 uppercase tracking-tighter leading-none">Focus Depth</p>
                                        <p className="text-[10px] font-black text-blue-700 dark:text-blue-300">High State</p>
                                    </div>
                                </div>

                                {/* Reflection Range */}
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">Reflection Range</span>
                                    <div className="flex p-0.5 bg-gray-100/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        {REFLECTION_RANGES.map(r => (
                                            <button
                                                key={r.value}
                                                onClick={() => setReflectionRange(r.value)}
                                                className={`px-2 py-1 text-[9px] font-black rounded-md transition-all ${reflectionRange === r.value ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                                            >
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Messages Area with AnimatePresence */}
                        <div
                            className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800"
                            style={{ height: `${messagesHeight}%` }}
                        >
                            <AnimatePresence mode="popLayout">
                                {messages.map((m) => (
                                    <motion.div
                                        key={m.id}
                                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} group`}
                                    >
                                        {m.role !== "user" && (
                                            <div className="flex-shrink-0 mr-3 mt-1">
                                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-black shadow-lg shadow-blue-500/20">
                                                    KA
                                                </div>
                                            </div>
                                        )}
                                        <div className={`max-w-[85%] px-5 py-3.5 rounded-3xl shadow-sm transition-all group-hover:shadow-md ${m.role === "user"
                                            ? "bg-blue-600 text-white rounded-br-md ml-auto"
                                            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md"
                                            }`}>
                                            <div
                                                className={`prose prose-sm max-w-none break-words ${m.role === 'user' ? 'prose-invert text-white' : 'dark:prose-invert text-gray-800 dark:text-gray-200'}`}
                                                dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }}
                                            />
                                        </div>
                                        {m.role === "user" && (
                                            <div className="flex-shrink-0 ml-3 mt-1">
                                                <div className="w-8 h-8 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs font-black">
                                                    ME
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                                {streamingMessage && (
                                    <motion.div
                                        key="streaming"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex justify-start"
                                    >
                                        <div className="flex-shrink-0 mr-3 mt-1">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-black shadow-lg animate-pulse">
                                                KA
                                            </div>
                                        </div>
                                        <div className="max-w-[85%] px-5 py-3.5 rounded-3xl shadow-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md">
                                            <div
                                                className="prose prose-sm max-w-none dark:prose-invert text-gray-800 dark:text-gray-200"
                                                dangerouslySetInnerHTML={{ __html: marked.parse(streamingMessage) as string }}
                                            />
                                            <div className="inline-flex gap-1 mt-2">
                                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                                {messages.length === 0 && !streamingMessage && (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="h-full flex flex-col items-center justify-center text-center p-10"
                                    >
                                        <div className="p-8 bg-blue-50 dark:bg-blue-900/10 rounded-[40px] mb-6 shadow-inner border border-blue-100 dark:border-blue-900/30">
                                            <Sparkles className="w-16 h-16 text-blue-600 dark:text-blue-500" />
                                        </div>
                                        <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2 italic tracking-tighter">Ready when you are.</h3>
                                        <p className="text-gray-500 dark:text-gray-400 max-w-xs text-sm font-medium leading-relaxed">
                                            Ask me anything about your current work or set a reflection range to analyze your activity.
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Draggable Divider (Inspired by alphazero) */}
                        <div
                            onMouseDown={() => setIsDragging(true)}
                            className={`h-1.5 w-full cursor-ns-resize transition-all border-y border-gray-100 dark:border-gray-800 ${isDragging ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-400/30'}`}
                        />

                        {/* Input Controls Container */}
                        <div className="p-6 bg-white/60 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-800 backdrop-blur-xl">
                            <div className="relative group/input flex flex-col gap-4">
                                <div className="flex items-center gap-2 px-1">
                                    <button title="Attach Image" className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all border border-transparent hover:border-blue-200 dark:hover:border-blue-800">
                                        <ImageIcon size={18} />
                                    </button>
                                    <button title="Voice Input" className="p-2 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-all border border-transparent hover:border-purple-200 dark:hover:border-purple-800">
                                        <Mic size={18} />
                                    </button>
                                    <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 mx-1" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Advanced Input</span>
                                </div>

                                <div className="relative flex items-end gap-3">
                                    <textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        placeholder="Speak your mind..."
                                        className="flex-1 resize-none bg-white dark:bg-gray-900/50 border-2 border-gray-200/60 dark:border-gray-800/60 rounded-3xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 min-h-[120px] text-gray-900 dark:text-gray-100 shadow-inner font-medium text-base transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600"
                                    />
                                    <div className="absolute right-4 bottom-4 flex items-center gap-3">
                                        <button title="Rewrite Prompt" className="p-3 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-2xl transition-all border border-purple-100 dark:border-purple-900/30">
                                            <Sparkles size={22} />
                                        </button>
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!message.trim() || isSending || !selectedChatId}
                                            className={`p-4 rounded-2xl shadow-2xl transition-all flex items-center justify-center ${!message.trim() || isSending || !selectedChatId
                                                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                                                : "bg-gradient-to-br from-blue-600 to-indigo-700 text-white hover:shadow-blue-500/40 hover:scale-[1.05] active:scale-[0.95]"
                                                }`}
                                        >
                                            {isSending ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-20">
                        <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-[48px] flex items-center justify-center mb-8 border border-white dark:border-gray-800 shadow-2xl">
                            <MessageSquare className="w-12 h-12 text-blue-600 dark:text-blue-500" />
                        </div>
                        <h3 className="text-4xl font-black text-gray-900 dark:text-white mb-4 italic tracking-tighter">Your Intelligence Hub.</h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-sm text-lg font-medium leading-relaxed mb-8">
                            Select a thread to continue or start a fresh exploration session to gain new insights.
                        </p>
                        <button
                            onClick={handleCreateChat}
                            className="flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-8 py-4 rounded-2xl font-black transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-gray-900/20 dark:shadow-white/10"
                        >
                            <Plus size={20} />
                            Start New Session
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
