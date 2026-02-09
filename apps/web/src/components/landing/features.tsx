import {
  Shield,
  Target,
  Sparkles,
  Brain,
  Activity,
  Bell,
} from "lucide-react";
import { FadeIn } from "./fade-in";

interface Feature {
  name: string;
  description: string;
  icon: React.ReactNode;
}

const features: Feature[] = [
  {
    name: "Focus Guardian",
    description:
      "An AI agent that learns your patterns and nudges you when you doomscroll, drift off-topic, or need a break.",
    icon: <Bell size={19} />,
  },
  {
    name: "Attention Tracking",
    description:
      "Automatically tracks what you read, watch, and listen to. Understand your digital attention without manual effort.",
    icon: <Target size={19} />,
  },
  {
    name: "Cognitive Health Reports",
    description:
      "Get insights on focus duration, late-night usage, browsing fragmentation, and media diet over time.",
    icon: <Activity size={19} />,
  },
  {
    name: "AI-Powered Chat",
    description:
      "Ask questions about your browsing history. Get context-aware answers from an AI that knows what you've been reading.",
    icon: <Sparkles size={19} />,
  },
  {
    name: "Knowledge Quizzes",
    description:
      "Auto-generated quizzes from your actual browsing. Active recall that helps you retain what you consume.",
    icon: <Brain size={19} />,
  },
  {
    name: "Privacy-First",
    description:
      "Optional local LLM keeps data on-device. GDPR compliant with full data control and export capabilities.",
    icon: <Shield size={19} />,
  },
];

export function FeaturesWithHeading() {
  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      <FadeIn className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl font-bold font-heading tracking-tight mb-3">
          Not Your Typical Productivity Tool
        </h2>
        <p className="max-w-lg mx-auto text-muted-foreground leading-relaxed text-sm">
          A cognitive architecture that augments your natural focus&mdash;without
          compromising your digital sovereignty.
        </p>
      </FadeIn>

      <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <FadeIn key={feature.name} delay={i * 60}>
            <div className="group p-6 rounded-2xl card-surface h-full">
              <div className="w-10 h-10 rounded-xl bg-blue-500/8 dark:bg-blue-500/12 border border-blue-500/10 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400 group-hover:scale-105 group-hover:bg-blue-500/12 transition-all">
                {feature.icon}
              </div>
              <h3 className="font-semibold font-heading text-foreground mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-[15px]">
                {feature.name}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}
