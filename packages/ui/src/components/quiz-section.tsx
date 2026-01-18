import React from "react";
import { cn } from "../utils";
import { Card, CardHeader } from "./card";
import { Brain, HelpCircle } from "lucide-react";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

interface QuizSectionProps {
  questions: QuizQuestion[];
  currentIdx: number;
  onSelect: (optionIdx: number) => void;
  className?: string;
}

export function QuizSection({ questions, currentIdx, onSelect, className }: QuizSectionProps) {
  const current = questions[currentIdx];

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Brain className="w-48 h-48" />
      </div>

      <div className="relative z-10">
        <CardHeader className="flex items-center gap-2 mb-8">
          <HelpCircle className="w-3 h-3" />
          Knowledge Check
        </CardHeader>

        <div className="mb-8">
          <span className="text-[10px] font-mono text-gray-500 uppercase block mb-2">
            {questions.length - currentIdx} questions remaining
          </span>
          <h3 className="text-xl font-bold tracking-tight text-white max-w-lg">
            {current?.question || "Loading question..."}
          </h3>
        </div>

        <div className="space-y-3">
          {current?.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className="w-full text-left p-4 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group flex items-center gap-4"
            >
              <span className="w-6 h-6 border border-white/20 flex items-center justify-center text-[10px] font-mono text-gray-500 group-hover:border-white/40 group-hover:text-white transition-colors">
                {idx + 1}
              </span>
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                {option}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
