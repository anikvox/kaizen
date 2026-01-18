import React from "react";
import { cn } from "../utils";
import { Card, CardHeader } from "./card";
import { LucideIcon, Zap } from "lucide-react";

export interface PulseItem {
  id: string;
  type: string;
  content: string;
  timestamp: string;
  icon: LucideIcon;
}

interface PulseSectionProps {
  items: PulseItem[];
  title?: string;
  className?: string;
}

export function PulseSection({ items, title = "Activity Pulse", className }: PulseSectionProps) {
  return (
    <Card className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center justify-between mb-2">
        <CardHeader className="mb-0 flex items-center gap-2">
          <Zap className="w-3 h-3 text-yellow-500" />
          {title}
        </CardHeader>
        <span className="text-[10px] font-mono text-gray-500 uppercase">{items.length} TOTAL</span>
      </div>

      <div className="space-y-6">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4 group">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-none border border-white/10 flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-colors">
                <item.icon className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
              </div>
              <div className="w-[1px] h-full bg-white/10 mt-2 group-last:hidden" />
            </div>
            <div className="flex-1 pb-6 group-last:pb-0">
              <p className="text-sm text-gray-300 leading-tight mb-1 group-hover:text-white transition-colors">
                {item.content}
              </p>
              <span className="text-[10px] font-mono text-gray-600 uppercase">
                {item.timestamp}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
