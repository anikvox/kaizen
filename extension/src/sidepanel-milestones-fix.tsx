// Fixed Milestones Section with progress tracking and correct emoji
import { Award } from "lucide-react"
import type { Focus } from "~db"
import type { FocusWithParsedData } from "./sidepanel-api/focus"

interface MilestonesSectionProps {
  focusDataDex: Focus[] | undefined
  parseFocus: (focus: Focus) => FocusWithParsedData
}

const MilestonesSection = ({ focusDataDex, parseFocus }: MilestonesSectionProps) => {
  const milestones = [
    { 
      label: "First Focus", 
      time: 7, 
      icon: "🌱",
      color: "emerald",
      achieved: focusDataDex && focusDataDex.length > 0,
      currentProgress: focusDataDex && focusDataDex.length > 0 
        ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
        : 0
    },
    { 
      label: "Deep Work", 
      time: 25, 
      icon: "🎯",
      color: "blue",
      achieved: focusDataDex && focusDataDex.some(f => parseFocus(f).total_time >= 25 * 60 * 1000),
      currentProgress: focusDataDex && focusDataDex.length > 0 
        ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
        : 0
    },
    { 
      label: "Flow State", 
      time: 60, 
      icon: "🧘",
      color: "purple",
      achieved: focusDataDex && focusDataDex.some(f => parseFocus(f).total_time >= 60 * 60 * 1000),
      currentProgress: focusDataDex && focusDataDex.length > 0 
        ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
        : 0
    },
    { 
      label: "Master", 
      time: 120, 
      icon: "⚡",
      color: "amber",
      achieved: focusDataDex && focusDataDex.some(f => parseFocus(f).total_time >= 120 * 60 * 1000),
      currentProgress: focusDataDex && focusDataDex.length > 0 
        ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
        : 0
    }
  ];

  const achievedCount = milestones.filter(m => m.achieved).length;

  return (
    <div className="relative bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-xl border border-gray-200/60 dark:border-slate-700/60 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-100/70 dark:bg-purple-900/30 rounded-lg">
            <Award className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Milestones
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              {achievedCount} of 4 achieved
            </p>
          </div>
        </div>
      </div>

      {/* Milestone Grid */}
      <div className="grid grid-cols-2 gap-3">
        {milestones.map((milestone, index) => {
          const colorClasses = {
            emerald: {
              bg: milestone.achieved ? "bg-emerald-50/80 dark:bg-emerald-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
              border: milestone.achieved ? "border-emerald-200/60 dark:border-emerald-800/40" : "border-gray-200/40 dark:border-slate-700/40",
              text: milestone.achieved ? "text-emerald-700 dark:text-emerald-300" : "text-gray-400 dark:text-gray-500",
              badge: milestone.achieved ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-600",
              progress: "bg-emerald-500",
              icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
            },
            blue: {
              bg: milestone.achieved ? "bg-blue-50/80 dark:bg-blue-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
              border: milestone.achieved ? "border-blue-200/60 dark:border-blue-800/40" : "border-gray-200/40 dark:border-slate-700/40",
              text: milestone.achieved ? "text-blue-700 dark:text-blue-300" : "text-gray-400 dark:text-gray-500",
              badge: milestone.achieved ? "bg-blue-500" : "bg-gray-300 dark:bg-slate-600",
              progress: "bg-blue-500",
              icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
            },
            purple: {
              bg: milestone.achieved ? "bg-purple-50/80 dark:bg-purple-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
              border: milestone.achieved ? "border-purple-200/60 dark:border-purple-800/40" : "border-gray-200/40 dark:border-slate-700/40",
              text: milestone.achieved ? "text-purple-700 dark:text-purple-300" : "text-gray-400 dark:text-gray-500",
              badge: milestone.achieved ? "bg-purple-500" : "bg-gray-300 dark:bg-slate-600",
              progress: "bg-purple-500",
              icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
            },
            amber: {
              bg: milestone.achieved ? "bg-amber-50/80 dark:bg-amber-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
              border: milestone.achieved ? "border-amber-200/60 dark:border-amber-800/40" : "border-gray-200/40 dark:border-slate-700/40",
              text: milestone.achieved ? "text-amber-700 dark:text-amber-300" : "text-gray-400 dark:text-gray-500",
              badge: milestone.achieved ? "bg-amber-500" : "bg-gray-300 dark:bg-slate-600",
              progress: "bg-amber-500",
              icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
            }
          };

          const colors = colorClasses[milestone.color];
          
          // Calculate progress percentage
          const targetTime = milestone.time * 60 * 1000;
          const progressPercent = milestone.achieved 
            ? 100 
            : Math.min((milestone.currentProgress / targetTime) * 100, 100);
          
          return (
            <div
              key={index}
              className={`relative ${colors.bg} ${colors.border} border rounded-lg p-3.5 transition-all duration-300 ${
                milestone.achieved ? "hover:shadow-md" : ""
              }`}>
              
              {/* Achievement indicator */}
              {milestone.achieved && (
                <div className="absolute top-2 right-2">
                  <div className={`w-1.5 h-1.5 ${colors.badge} rounded-full`} />
                </div>
              )}
              
              {/* Icon */}
              <div className={`text-3xl mb-2 transition-all duration-300 ${colors.icon}`} style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif' }}>
                {milestone.icon}
              </div>
              
              {/* Content */}
              <div>
                <h4 className={`text-xs font-semibold mb-1 ${
                  milestone.achieved 
                    ? "text-gray-900 dark:text-white" 
                    : "text-gray-500 dark:text-gray-400"
                }`}>
                  {milestone.label}
                </h4>
                
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-medium ${colors.text}`}>
                    {milestone.time} min
                  </span>
                  {milestone.achieved && (
                    <Award className={`w-3 h-3 ${colors.text}`} />
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200/50 dark:bg-slate-700/50 rounded-full h-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      milestone.achieved 
                        ? colors.progress 
                        : progressPercent > 0 
                          ? colors.progress + " opacity-60"
                          : "bg-gray-300 dark:bg-slate-600"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Progress text for incomplete milestones */}
                {!milestone.achieved && progressPercent > 0 && (
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1">
                    {Math.floor(milestone.currentProgress / 60000)} / {milestone.time} min
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Summary */}
      <div className="mt-4 pt-3 border-t border-gray-200/50 dark:border-slate-700/50">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            Continue focusing to unlock more
          </span>
          <div className="flex gap-1">
            {milestones.map((milestone, i) => (
              <div
                key={i}
                className={`w-1 h-1 rounded-full transition-colors duration-300 ${
                  milestone.achieved ? "bg-purple-500" : "bg-gray-300 dark:bg-slate-600"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


export default MilestonesSection
