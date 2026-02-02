"use client";

import { useAuth } from "@clerk/nextjs";
import { MessageSquare, Plus, Send, Sparkles, Trash2, Loader2, Image as ImageIcon, Mic, MoreVertical, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardChatService, ChatSession, ChatMessage } from "../lib/chat";
import { AIService } from "../lib/ai";
import { marked } from "marked";
import { motion, AnimatePresence } from "framer-motion";
import { messageCache } from "../lib/message-cache";

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
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [selectedAudio, setSelectedAudio] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageBlobUrls, setImageBlobUrls] = useState<Map<string, string>>(new Map());
    const [isWriting, setIsWriting] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const focusScore = 82;

    const chatServiceRef = useRef<DashboardChatService | null>(null);
    const aiServiceRef = useRef<AIService | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const formatMessageTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        // Just now (< 1 min)
        if (diffMins < 1) return 'Just now';
        // Minutes ago (< 1 hour)
        if (diffMins < 60) return `${diffMins}m ago`;
        // Hours ago (< 24 hours)
        if (diffHours < 24) return `${diffHours}h ago`;
        // Days ago (< 7 days)
        if (diffDays < 7) return `${diffDays}d ago`;
        // Older: show date
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const fetchImageWithAuth = useCallback(async (filename: string): Promise<string | null> => {
        // Check if we already have a blob URL for this image
        if (imageBlobUrls.has(filename)) {
            return imageBlobUrls.get(filename)!;
        }

        try {
            const token = await getToken();
            if (!token) return null;

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:60092'}/api/chat/uploads/${filename}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                console.error("[Chat] Failed to fetch image:", response.status);
                return null;
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            // Cache the blob URL
            setImageBlobUrls(prev => new Map(prev).set(filename, blobUrl));
            
            return blobUrl;
        } catch (error) {
            console.error("[Chat] Error fetching image:", error);
            return null;
        }
    }, [getToken, imageBlobUrls]);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingMessage, scrollToBottom]);

    // Cleanup blob URLs on unmount
    useEffect(() => {
        return () => {
            imageBlobUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [imageBlobUrls]);

    // Auto-resize textarea based on content
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, 300);
        textarea.style.height = `${newHeight}px`;
    }, [message]);

    // Initialize chat and poll for session updates
    useEffect(() => {
        let isActive = true;
        let pollInterval: NodeJS.Timeout | null = null;

        const initChat = async () => {
            if (!isSignedIn) return;
            try {
                const token = await getToken();
                if (!token) return;

                const service = new DashboardChatService(token);
                chatServiceRef.current = service;

                const sessions = await service.getSessions();
                if (isActive) {
                    setChats(sessions);
                    if (sessions.length > 0 && !selectedChatId) {
                        setSelectedChatId(sessions[0].id);
                    }
                }
            } catch (error) {
                console.error("Failed to initialize chat:", error);
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };

        const refreshSessions = async () => {
            if (!isActive || !isSignedIn) return;
            try {
                const token = await getToken();
                if (!token) {
                    console.warn("No token available, skipping session refresh");
                    return;
                }

                const service = new DashboardChatService(token);
                chatServiceRef.current = service;

                const sessions = await service.getSessions();
                if (isActive && sessions.length > 0) {
                    setChats(sessions);
                }
            } catch (error) {
                console.error("Failed to refresh sessions:", error);
            }
        };

        if (isLoaded && isSignedIn) {
            initChat();
            
            pollInterval = setInterval(refreshSessions, 5000);
        }
        
        return () => {
            isActive = false;
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [isLoaded, isSignedIn, getToken, selectedChatId]);

    // Fetch messages for selected chat with polling and smart deduplication
    useEffect(() => {
        let isActive = true;
        let pollInterval: NodeJS.Timeout | null = null;

        const fetchMessages = async () => {
            if (!selectedChatId || !isActive || !isSignedIn) return;
            try {
                const token = await getToken();
                if (!token) return;

                const service = new DashboardChatService(token);
                chatServiceRef.current = service;

                const serverMsgs = await service.getMessages(selectedChatId);
                console.log("[Chat] Fetched messages from server:", serverMsgs.length);

                if (isActive) {
                    setMessages(prevMessages => {
                        // Smart merge: keep optimistic messages, add new server messages
                        const merged = [...prevMessages];

                        serverMsgs.forEach(serverMsg => {
                            // Check if this message already exists (by ID or by content matching)
                            const existingIndex = merged.findIndex(m => {
                                // Exact ID match
                                if (m.id === serverMsg.id) return true;

                                // Content match for optimistic messages (within 30 seconds)
                                if (m.id.startsWith('temp-') &&
                                    m.role === serverMsg.role &&
                                    m.content === serverMsg.content &&
                                    Math.abs(new Date(m.createdAt).getTime() - new Date(serverMsg.createdAt).getTime()) < 30000) {
                                    return true;
                                }

                                return false;
                            });

                            if (existingIndex !== -1) {
                                // Update existing message with server data but keep same array position
                                const cached = messageCache.get(serverMsg.id);
                                merged[existingIndex] = {
                                    ...serverMsg,
                                    imagePreview: cached?.imagePreview || merged[existingIndex].imagePreview || serverMsg.imagePreview,
                                    audioName: cached?.audioName || merged[existingIndex].audioName || serverMsg.audioName
                                };
                            } else {
                                // New message from server, add it
                                const cached = messageCache.get(serverMsg.id);
                                merged.push({
                                    ...serverMsg,
                                    imagePreview: cached?.imagePreview || serverMsg.imagePreview,
                                    audioName: cached?.audioName || serverMsg.audioName
                                });
                            }
                        });

                        // Sort by creation time to maintain order
                        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                        return merged;
                    });

                    // Clear streaming message if server has caught up
                    setStreamingContent(prevContent => {
                        if (!prevContent) return prevContent;

                        // Check if an assistant message with matching content exists in server messages
                        const hasMatchingAssistant = serverMsgs.some(m =>
                            m.role === 'assistant' &&
                            m.content === prevContent
                        );

                        if (hasMatchingAssistant) {
                            setStreamingMessage("");
                            return "";
                        }

                        return prevContent;
                    });
                }
            } catch (error) {
                console.error("Failed to fetch messages:", error);
            }
        };

        if (selectedChatId) {
            fetchMessages();

            pollInterval = setInterval(fetchMessages, 3000);

            const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                    fetchMessages();
                }
            };

            document.addEventListener('visibilitychange', handleVisibilityChange);

            return () => {
                isActive = false;
                if (pollInterval) {
                    clearInterval(pollInterval);
                }
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }
    }, [selectedChatId, isSignedIn, getToken]);

    const handleCreateChat = async () => {
        if (!chatServiceRef.current) return;
        try {
            console.log("[Chat] Creating new chat session...");
            const newSession = await chatServiceRef.current.createSession();
            console.log("[Chat] New session created:", newSession.id);
            setChats([newSession, ...chats]);
            setSelectedChatId(newSession.id);
            setMessages([]);
            console.log("[Chat] Switched to new session:", newSession.id);
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

        console.log("[Chat] Sending message to session:", selectedChatId);

        // Create optimistic user message with temp ID
        const tempUserId = `temp-user-${Date.now()}`;
        const userMsg: ChatMessage = {
            id: tempUserId,
            role: "user",
            content: message,
            createdAt: new Date().toISOString(),
            imagePreview: imagePreview || undefined,
            audioName: selectedAudio?.name
        };

        // Add user message immediately (optimistic update)
        setMessages(prev => [...prev, userMsg]);

        const currentMsg = message;
        const currentImage = selectedImage;
        const currentAudio = selectedAudio;
        const currentImagePreview = imagePreview;
        const currentAudioName = selectedAudio?.name;

        setMessage("");
        setSelectedImage(null);
        setSelectedAudio(null);
        setImagePreview(null);
        setIsSending(true);
        setStreamingMessage("");
        setStreamingContent("");

        try {
            const stream = chatServiceRef.current.sendMessageStreaming(
                selectedChatId,
                currentMsg,
                `Reflection Range: ${REFLECTION_RANGES.find(r => r.value === reflectionRange)?.label}`,
                currentImage || undefined,
                currentAudio || undefined
            );

            for await (const response of stream) {
                if (response.title) {
                    console.log("[Chat] Title updated:", response.title);
                    setChats(prev => prev.map(c => c.id === selectedChatId ? { ...c, title: response.title! } : c));
                }
                if (response.chunk) {
                    setStreamingMessage(prev => prev + response.chunk);
                    setStreamingContent(prev => prev + response.chunk);
                }
            }

            // Keep streaming message visible, polling will replace it with server message
            // Cache attachment metadata for when server message arrives
            if (currentImagePreview || currentAudioName) {
                messageCache.set(tempUserId, {
                    imagePreview: currentImagePreview || undefined,
                    audioName: currentAudioName,
                    imageFileName: currentImage?.name,
                    audioFileName: currentAudio?.name
                });
            }
        } catch (error) {
            console.error("Failed to send message:", error);
            // Remove optimistic user message on error
            setMessages(prev => prev.filter(m => m.id !== tempUserId));
            setStreamingMessage("");
            setStreamingContent("");
            if (error instanceof Error) {
                alert(`Failed to send message: ${error.message}`);
            }
        } finally {
            setIsSending(false);
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setSelectedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('audio/')) {
            setSelectedAudio(file);
        }
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const removeAudio = () => {
        setSelectedAudio(null);
        if (audioInputRef.current) audioInputRef.current.value = '';
    };

    const handleWrite = async () => {
        if (isWriting || isSending) return;
        
        setIsWriting(true);
        try {
            const token = await getToken();
            if (!token) {
                alert("Authentication required");
                return;
            }

            if (!aiServiceRef.current) {
                aiServiceRef.current = new AIService(token);
            }

            // Generate a creative prompt based on recent activity
            const prompt = "Generate an interesting question or prompt about productivity, focus, or personal growth.";
            const generated = await aiServiceRef.current.write(prompt);
            setMessage(generated);
        } catch (error) {
            console.error("Failed to generate text:", error);
            alert("Failed to generate text. Please try again.");
        } finally {
            setIsWriting(false);
        }
    };

    const handleRewrite = async () => {
        if (!message.trim() || isWriting || isSending) return;
        
        setIsWriting(true);
        try {
            const token = await getToken();
            if (!token) {
                alert("Authentication required");
                return;
            }

            if (!aiServiceRef.current) {
                aiServiceRef.current = new AIService(token);
            }

            const rewritten = await aiServiceRef.current.rewrite(message);
            setMessage(rewritten);
        } catch (error) {
            console.error("Failed to rewrite text:", error);
            alert("Failed to rewrite text. Please try again.");
        } finally {
            setIsWriting(false);
        }
    };

    // Component to render authenticated images
    const AuthenticatedImage = ({ filename, alt, className }: { filename: string; alt: string; className: string }) => {
        const [imageUrl, setImageUrl] = useState<string | null>(null);
        const [loading, setLoading] = useState(true);

        useEffect(() => {
            let mounted = true;
            
            fetchImageWithAuth(filename).then(url => {
                if (mounted && url) {
                    setImageUrl(url);
                    setLoading(false);
                }
            });

            return () => {
                mounted = false;
            };
        }, [filename]);

        if (loading) {
            return (
                <div className={`${className} flex items-center justify-center bg-gray-100 dark:bg-gray-800`}>
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            );
        }

        if (!imageUrl) {
            return null;
        }

        return (
            <img 
                src={imageUrl}
                alt={alt} 
                className={className}
                onError={(e) => {
                    console.error("[Chat] Image load error:", imageUrl);
                    e.currentTarget.style.display = 'none';
                }}
            />
        );
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
                        <span>New Chat</span>
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
                                    <h3 className={`font-semibold truncate text-sm ${selectedChatId === chat.id ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {chat.title}
                                    </h3>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteChat(e, chat.id)}
                                    className="opacity-0 group-hover:opacity-100 mt-1 p-1 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all"
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
                                <div className="p-2.5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
                                    <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                                        {selectedChat?.title || "Chat"}
                                    </h2>
                                </div>
                            </div>
                        </div>

                        {/* Messages Area with AnimatePresence */}
                        <div
                            className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800"
                        >
                            <AnimatePresence mode="popLayout">
                                {messages.map((m) => (
                                    <motion.div
                                        key={m.id}
                                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} group`}
                                    >
                                        {m.role !== "user" && (
                                            <div className="flex-shrink-0 mr-3 mt-1">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                                                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                                                        <circle cx="9" cy="16" r="1"/>
                                                        <circle cx="15" cy="16" r="1"/>
                                                    </svg>
                                                </div>
                                            </div>
                                        )}
                                        <div className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} max-w-[85%]`}>
                                            <div className={`px-5 py-3.5 rounded-3xl shadow-sm transition-all group-hover:shadow-md ${m.role === "user"
                                                ? "bg-blue-600 text-white rounded-br-md"
                                                : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md"
                                                }`}>
                                                {(() => {
                                                    const hasImagePreview = !!m.imagePreview;
                                                    const metadata = m.metadata || {};
                                                    const hasImagePath = !!metadata.imagePath;
                                                    const imagePath = metadata.imagePath;
                                                    // Handle both old format (full path) and new format (just filename)
                                                    const imageFileName = imagePath ? (imagePath.includes('/') ? imagePath.split('/').pop() : imagePath) : null;
                                                    
                                                    console.log("[Chat] Image rendering:", {
                                                        messageId: m.id,
                                                        hasImagePreview,
                                                        hasImagePath,
                                                        imagePath,
                                                        imageFileName,
                                                        metadata: m.metadata,
                                                        metadataType: typeof m.metadata
                                                    });
                                                    
                                                    if (hasImagePreview && m.imagePreview) {
                                                        // Use local preview (base64)
                                                        return (
                                                            <img 
                                                                src={m.imagePreview}
                                                                alt="Attached" 
                                                                className="rounded-lg mb-2 max-w-xs max-h-64 object-cover"
                                                            />
                                                        );
                                                    } else if (hasImagePath && imageFileName) {
                                                        // Fetch from server with auth
                                                        return (
                                                            <AuthenticatedImage 
                                                                filename={imageFileName}
                                                                alt="Attached"
                                                                className="rounded-lg mb-2 max-w-xs max-h-64 object-cover"
                                                            />
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                {(() => {
                                                    const metadata = m.metadata || {};
                                                    const audioName = m.audioName || metadata.audioFileName;
                                                    return audioName ? (
                                                        <div className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-lg ${m.role === "user" ? "bg-blue-700" : "bg-gray-100 dark:bg-gray-700"}`}>
                                                            <Mic size={16} />
                                                            <span className="text-sm">{audioName}</span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                                <div
                                                    className={`prose prose-sm max-w-none break-words ${m.role === 'user' ? 'prose-invert text-white' : 'dark:prose-invert text-gray-800 dark:text-gray-200'}`}
                                                    dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }}
                                                />
                                            </div>
                                            {m.createdAt && (
                                                <span className={`text-[10px] mt-1 px-1 ${m.role === "user" ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                                    {formatMessageTime(m.createdAt)}
                                                </span>
                                            )}
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
                                {isSending && !streamingMessage && (
                                    <motion.div
                                        key="typing"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="flex justify-start"
                                    >
                                        <div className="flex-shrink-0 mr-3 mt-1">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                                                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                                                    <circle cx="9" cy="16" r="1"/>
                                                    <circle cx="15" cy="16" r="1"/>
                                                </svg>
                                            </div>
                                        </div>
                                        <div className="px-5 py-3.5 rounded-3xl shadow-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md">
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                                {streamingMessage && (
                                    <motion.div
                                        key="streaming"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="flex justify-start"
                                    >
                                        <div className="flex-shrink-0 mr-3 mt-1">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                                                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                                                    <circle cx="9" cy="16" r="1"/>
                                                    <circle cx="15" cy="16" r="1"/>
                                                </svg>
                                            </div>
                                        </div>
                                        <div className="max-w-[85%] px-5 py-3.5 rounded-3xl shadow-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md">
                                            <div
                                                className="prose prose-sm max-w-none dark:prose-invert text-gray-800 dark:text-gray-200"
                                                dangerouslySetInnerHTML={{ __html: marked.parse(streamingMessage) as string }}
                                            />
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
                                        <div className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-3xl mb-6 shadow-inner border border-blue-100 dark:border-blue-900/30">
                                            <Sparkles className="w-16 h-16 text-blue-600 dark:text-blue-500" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Start a Conversation</h3>
                                        <p className="text-gray-500 dark:text-gray-400 max-w-md text-sm leading-relaxed">
                                            Ask me anything about your productivity, get insights on your focus patterns, or discuss your recent activities.
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Divider */}
                        <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />

                        <div className="p-4 bg-white/60 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-800 backdrop-blur-xl">
                            <div className="max-w-4xl mx-auto">
                                {(imagePreview || selectedAudio) && (
                                    <div className="mb-3 flex gap-2">
                                        {imagePreview && (
                                            <div className="relative inline-block">
                                                <img src={imagePreview} alt="Preview" className="h-20 w-20 object-cover rounded-lg border-2 border-blue-500" />
                                                <button
                                                    onClick={removeImage}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}
                                        {selectedAudio && (
                                            <div className="relative inline-flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-500 rounded-lg">
                                                <Mic size={16} className="text-purple-600 dark:text-purple-400" />
                                                <span className="text-sm text-purple-700 dark:text-purple-300">{selectedAudio.name}</span>
                                                <button
                                                    onClick={removeAudio}
                                                    className="ml-2 text-red-500 hover:text-red-600"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg focus-within:border-blue-500 dark:focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                    <textarea
                                        ref={textareaRef}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        placeholder="Message Kaizen AI..."
                                        rows={1}
                                        className="w-full resize-none bg-transparent px-4 py-3 pr-40 focus:outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 overflow-y-auto"
                                        style={{ minHeight: '44px', maxHeight: '300px' }}
                                        disabled={isWriting}
                                    />
                                    <input
                                        ref={imageInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageSelect}
                                        className="hidden"
                                    />
                                    <input
                                        ref={audioInputRef}
                                        type="file"
                                        accept="audio/*"
                                        onChange={handleAudioSelect}
                                        className="hidden"
                                    />
                                    <div className="absolute right-2 bottom-2 flex items-center gap-1">
                                        <button 
                                            onClick={() => imageInputRef.current?.click()}
                                            title="Attach Image" 
                                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                                        >
                                            <ImageIcon size={18} />
                                        </button>
                                        <button 
                                            onClick={() => audioInputRef.current?.click()}
                                            title="Attach Audio" 
                                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                                        >
                                            <Mic size={18} />
                                        </button>
                                        <button
                                            onClick={message.trim() ? handleRewrite : handleWrite}
                                            disabled={isWriting || isSending}
                                            title={message.trim() ? "Rewrite with AI" : "Generate message with AI"}
                                            className="p-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isWriting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                        </button>
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!message.trim() || isSending || !selectedChatId}
                                            className={`p-2 rounded-lg transition-all ${!message.trim() || isSending || !selectedChatId
                                                ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                                                : "text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
                                                }`}
                                        >
                                            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 px-2">
                                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                        <span className="flex items-center gap-1.5">
                                            <span className="font-medium">Reflection Range:</span>
                                            <div className="flex gap-1">
                                                {REFLECTION_RANGES.map(r => (
                                                    <button
                                                        key={r.value}
                                                        onClick={() => setReflectionRange(r.value)}
                                                        className={`px-2 py-0.5 text-xs rounded transition-all ${reflectionRange === r.value ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                                    >
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                        Press Enter to send, Shift+Enter for new line
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-20">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-3xl flex items-center justify-center mb-6 border border-blue-100 dark:border-blue-800/50 shadow-lg">
                            <MessageSquare className="w-10 h-10 text-blue-600 dark:text-blue-500" />
                        </div>
                        <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Select a Chat</h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-md text-base leading-relaxed mb-8">
                            Choose a conversation from the sidebar or create a new chat to get started
                        </p>
                        <button
                            onClick={handleCreateChat}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg"
                        >
                            <Plus size={20} />
                            New Chat
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
