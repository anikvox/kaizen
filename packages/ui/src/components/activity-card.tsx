import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "../utils";
import { Card } from "./card";

interface ActivityCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub: string;
  className?: string;
}

export function ActivityCard({ icon: Icon, label, value, sub, className }: ActivityCardProps) {
  return (
    <Card className={cn("hover:bg-white/10 group", className)}>
      <div className="flex items-center justify-between mb-6">
        <Icon className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-3xl font-bold mb-1 tracking-tight">{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest">{sub}</div>
    </Card>
  );
}
