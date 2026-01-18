import React from "react";
import { cn } from "../utils";
import { Card, CardHeader } from "./card";
import { Share2, Clock, Globe } from "lucide-react";

export interface JourneyNode {
  id: string;
  title: string;
  url: string;
  icon?: string;
  timestamp: string;
  duration: string;
  children?: JourneyNode[];
}

export interface JourneyGroup {
  id: string;
  title: string;
  tags: string[];
  timestamp: string;
  totalTime: string;
  journeys: JourneyNode[];
}

interface JourneyGraphProps {
  groups: JourneyGroup[];
  className?: string;
}

export function JourneyGraph({ groups, className }: JourneyGraphProps) {
  return (
    <Card className={cn("flex flex-col gap-8", className)}>
      <div className="flex items-center justify-between mb-2">
        <CardHeader className="mb-0 flex items-center gap-2">
          <Share2 className="w-3 h-3 text-blue-500" />
          Journey Graph
        </CardHeader>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase border border-white/10 px-2 py-1">
            <Clock className="w-3 h-3" />
            Last 15 Minutes
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups.map((group) => (
          <div key={group.id} className="bg-white/5 border border-white/10 p-4 hover:border-white/30 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-tighter">
                  <Globe className="w-3 h-3 text-gray-500" />
                  {group.title}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {group.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-mono uppercase border border-blue-500/20">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[10px] font-mono text-gray-600">{group.timestamp}</span>
            </div>

            <div className="space-y-4">
              {group.journeys.map((journey) => (
                <div key={journey.id} className="border-t border-white/5 pt-4">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-mono text-gray-500 uppercase">
                        Journey {journey.id.slice(0, 1)}
                      </span>
                      <span className="text-[9px] font-mono text-gray-500 uppercase">
                        {journey.children?.length || 0} sites
                      </span>
                   </div>
                   <div className="flex gap-2">
                      {journey.children?.map((child) => (
                        <div key={child.id} className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center group relative cursor-pointer hover:border-white/30 transition-all">
                           <img 
                              src={`https://www.google.com/s2/favicons?domain=${new URL(child.url).hostname}&sz=32`} 
                              alt="" 
                              className="w-4 h-4"
                           />
                           <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] p-2 bg-black border border-white/10 text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                             {child.title}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
               <span className="text-[9px] font-mono text-gray-600 uppercase">1 journey</span>
               <span className="text-[9px] font-mono text-gray-600 uppercase">{group.totalTime} total</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
