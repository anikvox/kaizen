import { BentoGrid, BentoGridItem } from "./bento-grid";
import { cn } from "@kaizen/ui";
import {
  Shield,
  Target,
  Brain,
  Eye,
  Activity,
  Sparkles,
} from "lucide-react";
import { FadeIn } from "./fade-in";

export function FeaturesBento() {
  return (
    <FadeIn className="w-full max-w-5xl mx-auto px-4">
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold font-heading tracking-tight mb-3">
          Built for How You Actually Work
        </h2>
        <p className="max-w-lg mx-auto text-muted-foreground leading-relaxed text-sm">
          Every feature designed around real browsing habits and learning
          patterns.
        </p>
      </div>

      <BentoGrid className="max-w-5xl mx-auto md:auto-rows-[20rem]">
        {items.map((item, i) => (
          <BentoGridItem
            key={i}
            title={item.title}
            description={item.description}
            header={item.header}
            className={cn("[&>p:text-lg]", item.className)}
            icon={item.icon}
          />
        ))}
      </BentoGrid>
    </FadeIn>
  );
}

/* --- Skeleton visuals (pure CSS hover interactions) --- */

const SkeletonOne = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] dot-grid flex-col space-y-2 p-4">
    <div className="bento-shift-right flex flex-row rounded-2xl border border-blue-200 dark:border-blue-800/40 p-3 items-center space-x-2 bg-blue-50/80 dark:bg-blue-950/30">
      <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
      <div className="w-full bg-blue-100 dark:bg-blue-900/50 h-4 rounded-full" />
    </div>
    <div className="bento-shift-left flex flex-row rounded-2xl border border-blue-200 dark:border-blue-800/40 p-3 items-center space-x-2 w-3/4 ml-auto bg-blue-50/80 dark:bg-blue-950/30">
      <div className="w-full bg-blue-100 dark:bg-blue-900/50 h-4 rounded-full" />
      <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
    </div>
    <div className="bento-shift-right flex flex-row rounded-2xl border border-blue-200 dark:border-blue-800/40 p-3 items-center space-x-2 bg-blue-50/80 dark:bg-blue-950/30">
      <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
      <div className="w-full bg-blue-100 dark:bg-blue-900/50 h-4 rounded-full" />
    </div>
  </div>
);

const SkeletonTwo = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] dot-grid flex-col space-y-2 p-4">
    {[65, 45, 80, 55, 70, 40].map((w, i) => (
      <div
        key={i}
        className="rounded-full border border-emerald-200 dark:border-emerald-800/40 p-2 bg-emerald-50/80 dark:bg-emerald-950/30 h-4"
        style={{ maxWidth: `${w}%` }}
      />
    ))}
  </div>
);

const SkeletonThree = () => (
  <div
    className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl"
    style={{
      background:
        "linear-gradient(-45deg, #ec4899, #8b5cf6, #3b82f6, #06b6d4)",
      backgroundSize: "400% 400%",
      animation: "landing-gradient 6s ease infinite",
    }}
  />
);

const SkeletonFour = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] dot-grid flex-row space-x-2 p-4">
    <div className="flex-1 rounded-2xl bg-gradient-to-br from-purple-100/80 to-blue-100/80 dark:from-purple-950/40 dark:to-blue-950/40 border border-purple-200/60 dark:border-purple-800/40 p-4 flex flex-col items-center justify-center">
      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-3 shadow-md shadow-purple-500/15">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <p className="text-[11px] text-center text-gray-600 dark:text-gray-400 font-medium">
        AI-powered insights from your browsing
      </p>
    </div>
  </div>
);

const SkeletonFive = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] dot-grid flex-col space-y-2 p-4">
    <div className="bento-shift-right flex flex-row rounded-2xl border border-teal-200 dark:border-teal-800/40 p-3 items-start space-x-2 bg-teal-50/80 dark:bg-teal-950/30">
      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex-shrink-0 flex items-center justify-center shadow-sm">
        <Activity className="w-3.5 h-3.5 text-white" />
      </div>
      <p className="text-[11px] text-gray-600 dark:text-gray-400">
        Track your focus patterns
      </p>
    </div>
    <div className="bento-shift-left flex flex-row rounded-2xl border border-teal-200 dark:border-teal-800/40 p-3 items-center justify-end space-x-2 w-3/4 ml-auto bg-teal-50/80 dark:bg-teal-950/30">
      <p className="text-[11px] text-gray-600 dark:text-gray-400">
        2.5 hours today
      </p>
      <div className="h-5 w-5 rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 flex-shrink-0" />
    </div>
  </div>
);

const items = [
  {
    title: "Smart Focus Sessions",
    description:
      "Track attention patterns without disruption. Understand what helps you focus.",
    header: <SkeletonOne />,
    className: "md:col-span-1",
    icon: <Target className="h-4 w-4 text-blue-500" />,
  },
  {
    title: "AI-Powered Insights",
    description:
      "Gemini Flash analyzes your browsing to generate actionable learning insights.",
    header: <SkeletonTwo />,
    className: "md:col-span-1",
    icon: <Brain className="h-4 w-4 text-emerald-500" />,
  },
  {
    title: "Knowledge Retention",
    description:
      "Auto-generated quizzes from your browsing. Active recall that sticks.",
    header: <SkeletonThree />,
    className: "md:col-span-1",
    icon: <Brain className="h-4 w-4 text-purple-500" />,
  },
  {
    title: "Privacy by Design",
    description:
      "Local LLM keeps data on-device. GDPR compliant with full control.",
    header: <SkeletonFour />,
    className: "md:col-span-2",
    icon: <Shield className="h-4 w-4 text-purple-500" />,
  },
  {
    title: "Real-Time Tracking",
    description:
      "Monitor focus sessions as they happen. Instant productivity feedback.",
    header: <SkeletonFive />,
    className: "md:col-span-1",
    icon: <Eye className="h-4 w-4 text-teal-500" />,
  },
];
