import { X, Check, Settings2, Zap, FileText, PenTool } from "lucide-react";
import { Logo } from "@kaizen/ui";
import { FadeIn } from "./fade-in";

export default function Comparison() {
  return (
    <FadeIn className="w-full max-w-5xl mx-auto px-4">
      {/* Header */}
      <div className="relative flex justify-between items-center text-3xl md:text-5xl font-bold h-16 md:h-24 mb-8">
        <div className="w-full text-center flex items-center justify-center">
          <h3 className="text-muted-foreground/35 font-heading">Others</h3>
        </div>
        <div className="w-full text-center flex items-center justify-center">
          <h3 className="font-heading text-gradient">Kaizen</h3>
        </div>
        {/* Center logo */}
        <div className="absolute size-12 md:size-16 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex justify-center items-center bg-background border-4 md:border-[6px] border-background shadow-lg overflow-hidden z-10">
          <Logo size="sm" />
        </div>
      </div>

      {/* Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden border border-border/40 shadow-lg shadow-black/[0.03] dark:shadow-black/15">
        {/* Others */}
        <div className="p-8 md:p-10 bg-background border-r border-border/30">
          <h3 className="text-lg md:text-xl font-bold font-heading pb-5 mb-6 border-b border-border/40 text-muted-foreground/50 text-center">
            Standard Productivity
          </h3>
          <div className="space-y-3.5">
            {othersItems.map((item, i) => (
              <div key={i} className="flex gap-3 items-center group text-sm">
                <span className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-foreground group-hover:bg-red-500/10 group-hover:text-red-500 transition-colors">
                  {item.icon}
                </span>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Kaizen */}
        <div className="p-8 md:p-10 bg-blue-500/[0.03] dark:bg-blue-500/[0.06]">
          <h3 className="text-lg md:text-xl font-bold font-heading pb-5 mb-6 border-b border-blue-500/15 text-gradient text-center">
            Kaizen Cognitive Engine
          </h3>
          <div className="space-y-3.5 font-semibold">
            {productItems.map((item, i) => (
              <div
                key={i}
                className="flex gap-3 items-center group/pros text-sm"
              >
                <span className="p-1.5 rounded-full bg-blue-500/8 text-blue-500 group-hover/pros:bg-blue-600 group-hover/pros:text-white transition-all duration-200">
                  {item.icon}
                </span>
                <span className="text-foreground group-hover/pros:text-blue-600 dark:group-hover/pros:text-blue-400 transition-colors">
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FadeIn>
  );
}

const othersItems = [
  { icon: <X size={14} />, text: "Blocks websites & restricts access" },
  { icon: <X size={14} />, text: "Cloud-only data processing" },
  { icon: <X size={14} />, text: "Manual time tracking required" },
  { icon: <X size={14} />, text: "No context on what you're learning" },
  { icon: <X size={14} />, text: "One-size-fits-all approach" },
];

const productItems = [
  { icon: <Check size={14} />, text: "Nudges without blocking content" },
  { icon: <Settings2 size={14} />, text: "Optional on-device LLM processing" },
  { icon: <Zap size={14} />, text: "Automatic attention tracking" },
  { icon: <FileText size={14} />, text: "AI that learns your patterns" },
  { icon: <PenTool size={14} />, text: "Personalized cognitive insights" },
];
