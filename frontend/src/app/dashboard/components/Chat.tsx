"use client";

import { useAuth } from "@clerk/nextjs";
import { MessageSquare, Plus, Send, Sparkles } from "lucide-react";
import { useState } from "react";

export function Chat() {
    const { isLoaded, isSignedIn } = useAuth();
    const [message, setMessage] = useState("");
    const [chats, setChats] = useState([
        { id: "1", title: "Wonders of the world", timestamp: "12:45 PM" },
        { id: "2", title: "Quantum Computing Basics", timestamp: "Yesterday" }
    ]);
    const [selectedChatId, setSelectedChatId] = useState("1");
    const [messages, setMessages] = useState([
        { id: "m1", by: "user", text: "what was I reading about?" },
        { id: "m2", by: "assistant", text: "You've been reading about the Wonders of the World! Specifically, you've looked at Wikipedia pages detailing the Seven Wonders of the Ancient World and a broader list of Wonders of the World, including modern contenders." }
    ]);

    if (!isLoaded || !isSignedIn) return null;

    return (
        <div className="h-full flex gap-6 p-6">
            {/* Sidebar */}
            <div className="w-80 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col shadow-sm">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                    <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl transition-all font-semibold shadow-sm">
                        <Plus size={20} />
                        <span>New Chat</span>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {chats.map((chat) => (
                        <div
                            key={chat.id}
                            onClick={() => setSelectedChatId(chat.id)}
                            className={`p-3 mb-2 rounded-xl cursor-pointer transition-all ${selectedChatId === chat.id
                                    ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500 shadow-sm"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <MessageSquare
                                    size={16}
                                    className={selectedChatId === chat.id ? "text-blue-600" : "text-gray-400"}
                                />
                                <h3 className="font-semibold truncate text-sm text-gray-900 dark:text-gray-100">
                                    {chat.title}
                                </h3>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                                {chat.timestamp}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            {chats.find(c => c.id === selectedChatId)?.title}
                        </h2>
                    </div>
                    <div className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold rounded-full border border-green-200 dark:border-green-800">
                        Low Latency
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.by === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] px-4 py-3 rounded-2xl shadow-sm ${m.by === "user"
                                    ? "bg-blue-600 text-white rounded-br-md"
                                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md"
                                }`}>
                                <p className="text-sm leading-relaxed">{m.text}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800">
                    <div className="relative flex items-end gap-2">
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Ask anything about your focus..."
                            className="flex-1 resize-none bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[100px] text-gray-900 dark:text-gray-100"
                        />
                        <div className="absolute right-3 bottom-3 flex items-center gap-2">
                            <button className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors">
                                <Sparkles size={20} />
                            </button>
                            <button className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all">
                                <Send size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
