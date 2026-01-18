import React from "react";
import { cn } from "../utils";
import { Card, CardHeader } from "./card";
import { Send, Image, Mic, Sparkles } from "lucide-react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatWindowProps {
  messages: Message[];
  onSend: (message: string) => void;
  isDetailed?: boolean;
  className?: string;
}

export function ChatWindow({ messages, onSend, isDetailed = false, className }: ChatWindowProps) {
  const [input, setInput] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  return (
    <Card className={cn("flex flex-col h-[500px] p-0 overflow-hidden", isDetailed && "h-[700px]", className)}>
      <div className="p-4 border-b border-white/10 bg-black/50 backdrop-blur-md flex items-center justify-between">
        <CardHeader className="mb-0 flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-purple-500" />
          Insight Engine
        </CardHeader>
        {isDetailed && (
          <button className="text-[10px] font-mono text-gray-500 hover:text-white transition-colors uppercase">
            + new chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex flex-col max-w-[85%]",
              msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div
              className={cn(
                "p-4 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 border border-white/10 text-gray-300"
              )}
            >
              {msg.content}
            </div>
            <span className="text-[9px] font-mono text-gray-600 mt-2 uppercase tracking-widest">
              {msg.timestamp}
            </span>
          </div>
        ))}
      </div>

      <div className="p-4 bg-black/50 border-t border-white/10">
        <form onSubmit={handleSubmit} className="relative flex items-center gap-2 bg-white/5 border border-white/10 p-2 focus-within:border-white/30 transition-colors">
          <button type="button" className="p-2 text-gray-500 hover:text-white transition-colors">
            <Image className="w-4 h-4" />
          </button>
          <button type="button" className="p-2 text-gray-500 hover:text-white transition-colors">
            <Mic className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white placeholder:text-gray-600"
          />
          <button
            type="submit"
            className="p-2 bg-white text-black hover:bg-gray-200 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </Card>
  );
}
