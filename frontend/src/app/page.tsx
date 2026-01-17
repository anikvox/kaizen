"use client";

import React from "react";
import { 
  Shield, 
  Target, 
  Zap, 
  Eye, 
  MessageSquare, 
  PenTool, 
  Brain, 
  Volume2, 
  ShieldAlert, 
  Cpu, 
  Settings2,
  ChevronRight,
  Terminal,
  Activity
} from "lucide-react";
import { motion } from "framer-motion";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

import Link from "next/link";

const features = [
  {
    title: "Edge-Native Intelligence",
    pitch: "Zero-knowledge inference. Gemini Nano runs locally in your browser kernel. Your data never leaves the silicon.",
    icon: Shield,
    tag: "Privacy"
  },
  {
    title: "Cognitive Telemetry",
    pitch: "High-fidelity focus tracking with 3s granularity. Map the topography of your attention in real-time.",
    icon: Target,
    tag: "Attention"
  },
  {
    title: "Temporal Compression",
    pitch: "Transform hours of deep research into actionable deltas. Auto-generated context for your past self.",
    icon: Zap,
    tag: "Activity"
  },
  {
    title: "Multimodal Vision",
    pitch: "Native image understanding and autonomous captioning. Context-aware perception for every pixel.",
    icon: Eye,
    tag: "Vision"
  },
  {
    title: "Contextual Proxy",
    pitch: "A multimodal companion living in your selection. Prompt Gemini Nano with live page state.",
    icon: MessageSquare,
    tag: "Chat"
  },
  {
    title: "Semantic Refinement",
    pitch: "Real-time summarization and translation via native browser APIs. Precision editing at the edge.",
    icon: PenTool,
    tag: "Writing"
  },
  {
    title: "Knowledge Persistence",
    pitch: "Active recall as a service. Auto-generated quizzes derived from your actual browsing history.",
    icon: Brain,
    tag: "Recall"
  },
  {
    title: "Sonic Perception",
    pitch: "Sustained audio attention monitoring. Distill the signals from the noise automatically.",
    icon: Volume2,
    tag: "Audio"
  },
  {
    title: "Algorithmic Guardrails",
    pitch: "Detect doom-scrolling before it drains your flow. Passive behavior analysis for active humans.",
    icon: ShieldAlert,
    tag: "Focus"
  },
  {
    title: "Deterministic Concurrency",
    pitch: "A single-threaded AI kernel managing system resources. High performance without the thermal throttle.",
    icon: Cpu,
    tag: "Performance"
  },
  {
    title: "Latent Agency",
    pitch: "Direct control over Top-K and Temperature. Tune the model's creative output to your exact specification.",
    icon: Settings2,
    tag: "Control"
  }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-white selection:text-black">
      {/* Background Grid Effect */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white flex items-center justify-center">
            <div className="w-4 h-4 bg-black rotate-45" />
          </div>
          <span className="text-xl font-bold tracking-tighter uppercase">Kaizen</span>
        </div>
        <div className="flex items-center gap-8 text-sm font-medium text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Manifesto</a>
          <a href="#" className="hover:text-white transition-colors">Docs</a>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="hover:text-white transition-colors uppercase tracking-tight font-bold">Sign In</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8 rounded-none" } }} />
          </SignedIn>
          <a href="#" className="bg-white text-black px-4 py-1.5 hover:bg-gray-200 transition-colors uppercase tracking-tight font-bold">Get Extension</a>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative z-10 pt-32 pb-20 px-8 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-mono text-gray-400 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            V0.1.0-ALPHA // LOCAL_FIRST_AI
          </div>
          <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-8">
            QUANTIFIED <br /> 
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">
              COGNITION
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-gray-400 text-lg md:text-xl leading-relaxed mb-12">
            Kaizen is a local-first browser extension that builds a semantic index of your attention. 
            Privacy by design, powered by on-device Gemini Nano.
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <SignedIn>
              <Link href="/dashboard" className="w-full md:w-auto px-8 py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-2 group">
                Go to Dashboard <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="w-full md:w-auto px-8 py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-2 group">
                  Initialize Session <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </SignInButton>
            </SignedOut>
            <button className="w-full md:w-auto px-8 py-4 border border-white/10 hover:bg-white/5 font-bold uppercase tracking-widest transition-all">
              View Source
            </button>
          </div>
        </motion.div>
      </header>

      {/* Scheduler Section (Feature 10) */}
      <section className="relative z-10 py-24 px-8 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-mono text-gray-500 mb-4">
              <Terminal className="w-4 h-4" />
              SYSTEM_PROCESSOR_V1
            </div>
            <h2 className="text-4xl font-bold mb-6 tracking-tight">
              Deterministic Inference <br />
              Scheduling.
            </h2>
            <p className="text-gray-400 leading-relaxed mb-8">
              All AI workloads are orchestrated via a prioritized message queue. 
              Concurrency is locked at N=1 to prevent resource contention and 
              thermal throttling on consumer hardware.
            </p>
            <ul className="space-y-4">
              {[
                "Priority-based task queueing",
                "Thermal-aware throttling",
                "State-persistent pause/resume",
                "Real-time resource telemetry"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-sm font-mono text-gray-300">
                  <Activity className="w-4 h-4 text-white" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[#0A0A0A] border border-white/10 p-6 font-mono text-xs rounded-lg shadow-2xl">
            <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <span className="text-green-500 font-bold">● RUNNING</span>
                <span className="text-gray-500">QUEUE_ID: 0x7FF1</span>
              </div>
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500/20 border border-red-500/50" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                <div className="w-2 h-2 rounded-full bg-green-500/20 border border-green-500/50" />
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-gray-500 mb-2 uppercase tracking-tighter">Active Task</div>
                <div className="bg-white/5 p-3 border-l-2 border-white flex justify-between items-center">
                  <span>TEXT_SUMMARIZATION_TASK_09</span>
                  <span className="text-white">82%</span>
                </div>
              </div>
              <div>
                <div className="text-gray-500 mb-2 uppercase tracking-tighter">Waiting (3)</div>
                <div className="space-y-2 opacity-50">
                  <div className="bg-white/5 p-2 flex justify-between">
                    <span>IMAGE_CAPTION_042</span>
                    <span>PENDING</span>
                  </div>
                  <div className="bg-white/5 p-2 flex justify-between">
                    <span>QUIZ_GEN_V2</span>
                    <span>QUEUED</span>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-white/5 flex gap-4">
                <button className="flex-1 bg-white text-black py-2 font-bold uppercase tracking-tighter">Pause Queue</button>
                <button className="flex-1 border border-white/10 py-2 font-bold uppercase tracking-tighter">Flush</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 py-24 px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10">
          {features.map((feature, i) => (
            <div key={i} className="bg-[#050505] p-10 group hover:bg-white/5 transition-colors">
              <div className="mb-6 flex items-start justify-between">
                <feature.icon className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest border border-white/10 px-2 py-1">
                  {feature.tag}
                </span>
              </div>
              <h3 className="text-xl font-bold mb-4 tracking-tight group-hover:translate-x-1 transition-transform">
                {feature.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {feature.pitch}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-20 px-8 border-t border-white/10 mt-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-gray-500 text-sm font-mono">
            © 2026 KAIZEN_SYSTEMS // OPERATING_ON_THE_EDGE
          </div>
          <div className="flex gap-8 text-xs font-mono text-gray-500">
            <a href="#" className="hover:text-white uppercase transition-colors">Twitter</a>
            <a href="#" className="hover:text-white uppercase transition-colors">GitHub</a>
            <a href="#" className="hover:text-white uppercase transition-colors">Discord</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

