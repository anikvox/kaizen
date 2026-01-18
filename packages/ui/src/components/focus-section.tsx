import React from "react";
import { cn } from "../utils";
import { Card, CardHeader } from "./card";
import { Brain, Clock } from "lucide-react";

interface FocusSectionProps {
  title: string;
  elapsedTime: string;
  category?: string;
  summary?: string;
  isLive?: boolean;
  inferredParams?: Array<{ label: string; value: string }>;
  className?: string;
}

export function FocusSection({ 
  title, 
  elapsedTime, 
  category, 
  summary, 
  isLive = true,
  inferredParams,
  className 
}: FocusSectionProps) {
  return (
    <Card className={cn("relative group", className)}>
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Brain className="w-24 h-24" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CardHeader className="mb-0">Current Focus</CardHeader>
            {isLive && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-500 text-[8px] font-bold uppercase tracking-widest border border-green-500/20">
                <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                Live
              </div>
            )}
          </div>
        </div>

        <h2 className="text-3xl font-bold tracking-tight text-white mb-6 uppercase">
          {title}
        </h2>

        <div className="bg-white/5 border border-white/10 p-4 flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white/10">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tighter">{elapsedTime}</div>
              <div className="text-[9px] text-gray-500 uppercase font-mono">Elapsed time</div>
            </div>
          </div>
        </div>

        {inferredParams && inferredParams.length > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-6 pt-4 border-t border-white/10">
            {inferredParams.map((param) => (
              <div key={param.label}>
                <div className="text-[8px] text-gray-500 uppercase font-mono mb-1">{param.label}</div>
                <div className="text-xs font-bold text-white">{param.value}</div>
              </div>
            ))}
          </div>
        )}

        {category && (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white text-black text-[10px] font-bold uppercase tracking-widest mb-4">
            {category.replace('_', ' ')}
          </div>
        )}

        {summary && (
          <p className="text-xs text-gray-400 leading-relaxed font-mono">
             {summary}
          </p>
        )}
      </div>
    </Card>
  );
}
