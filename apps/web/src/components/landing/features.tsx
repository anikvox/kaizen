import {
  Shield,
  Target,
  Sparkles,
  Brain,
  Activity,
  Chrome,
} from "lucide-react";
import { FadeIn } from "./fade-in";

interface Feature {
  name: string;
  description: string;
  icon: React.ReactNode;
}

const features: Feature[] = [
  {
    name: "Privacy Guardian",
    description:
      "Your data stays on your device. Local AI inference with GDPR compliance built in from day one.",
    icon: <Shield size={19} />,
  },
  {
    name: "Smart Focus Tracking",
    description:
      "Understand your attention patterns without disruption. No content blocking, just intelligent insights.",
    icon: <Target size={19} />,
  },
  {
    name: "AI Summaries",
    description:
      "Transform hours of browsing into concise, actionable knowledge with AI-powered summaries.",
    icon: <Sparkles size={19} />,
  },
  {
    name: "Knowledge Quizzes",
    description:
      "Auto-generated quizzes from your actual browsing history. Active recall that actually sticks.",
    icon: <Brain size={19} />,
  },
  {
    name: "Real-Time Analytics",
    description:
      "Monitor focus sessions and track learning patterns as they happen on your personal dashboard.",
    icon: <Activity size={19} />,
  },
  {
    name: "One-Click Setup",
    description:
      "Install the Chrome extension and start tracking in seconds. Works with all Chromium browsers.",
    icon: <Chrome size={19} />,
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
