import React from "react";
import { cn } from "../utils";
import { Card, CardHeader } from "./card";

interface StatsSectionProps {
  totalFocusTime: string;
  activities: Array<{
    label: string;
    value: string;
    color: string;
    count: number;
  }>;
  topActivity: {
    label: string;
    value: string;
    percentage: number;
  };
  className?: string;
}

export function StatsSection({ totalFocusTime, activities, topActivity, className }: StatsSectionProps) {
  return (
    <Card className={cn("flex flex-col gap-8", className)}>
      <CardHeader>Today's Stats</CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="flex flex-col gap-6">
           <div>
             <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase mb-2">
               <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
               Total Focus Time
             </div>
             <div className="text-4xl font-bold tracking-tighter">{totalFocusTime}</div>
           </div>

           <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.label} className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: activity.color }} />
                      <div>
                        <div className="text-xs font-bold text-white">{activity.label}</div>
                        <div className="text-[9px] text-gray-500 font-mono uppercase">{activity.value}</div>
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>

        <div className="relative flex items-center justify-center">
           {/* Simple Donut Chart Representation */}
           <div className="w-48 h-48 rounded-full border-[20px] border-white/5 relative flex items-center justify-center">
              <div className="text-center">
                 <div className="text-3xl font-bold">{activities.length}</div>
                 <div className="text-[9px] text-gray-500 uppercase font-mono">Activities</div>
              </div>
              {/* This is a placeholder for actual SVG donut */}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="76"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="20"
                  strokeDasharray="477"
                  strokeDashoffset="120"
                  className="text-blue-500 opacity-80"
                />
              </svg>
           </div>
        </div>
      </div>

      <div className="mt-4 pt-8 border-t border-white/10">
         <div className="text-[10px] font-mono text-gray-500 uppercase mb-4">Top Activity</div>
         <div className="flex items-center justify-between bg-white/5 border border-white/10 p-4">
            <div>
               <div className="text-lg font-bold text-white uppercase">{topActivity.label}</div>
               <div className="text-[10px] text-gray-500 font-mono">
                  {topActivity.value} • {topActivity.percentage}% of total
               </div>
            </div>
            <div className="w-12 h-12 bg-white/10 flex items-center justify-center">
               <Share2 className="w-5 h-5 text-gray-400" />
            </div>
         </div>
      </div>
    </Card>
  );
}

import { Share2 } from "lucide-react";
