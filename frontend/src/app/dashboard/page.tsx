"use client";

import React, { useEffect, useState } from "react";
import { useAuth, UserButton, SignOutButton } from "@clerk/nextjs";
import { 
  Activity, 
  FileText, 
  Image as ImageIcon, 
  Youtube, 
  Headphones,
  LayoutDashboard,
  LogOut,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Hash
} from "lucide-react";
import Link from "next/link";
import { 
  FocusSection, 
  PulseSection, 
  QuizSection, 
  JourneyGraph, 
  ChatWindow, 
  StatsSection,
  ActivityCard,
  Card,
  CardHeader
} from "@kaizen/ui";

interface FocusData {
  score: number;
  category: string;
  summary: string;
  timestamp: string;
}

const DUMMY_PULSE = [
  {
    id: "1",
    type: "text",
    content: "Review your notes on Fundamental theorem of calculus - Wikipedia",
    timestamp: "5 minutes ago",
    icon: FileText
  },
  {
    id: "2",
    type: "stats",
    content: "You've explored 15 resources - try practicing what you learned",
    timestamp: "5 minutes ago",
    icon: Activity
  },
  {
    id: "3",
    type: "focus",
    content: "Connect Famous landmarks with Historical landmarks for context",
    timestamp: "5 minutes ago",
    icon: TrendingUp
  },
  {
    id: "4",
    type: "reminder",
    content: "Remember: The fundamental theorem connects differentiation & integration",
    timestamp: "5 minutes ago",
    icon: Clock
  },
  {
    id: "5",
    type: "progress",
    content: "You've spent 0.2h on Calculus - great progress!",
    timestamp: "5 minutes ago",
    icon: Activity
  }
];

const DUMMY_QUIZ = [
  {
    id: "1",
    question: "Which of these is NOT a wonder?",
    options: ["Great Pyramid of Giza", "Sydney Opera House"]
  }
];

const DUMMY_JOURNEY = [
  {
    id: "g1",
    title: "Guide, Bitcoin, Design",
    tags: ["guide", "bitcoin", "design", "website", "offers"],
    timestamp: "04:41",
    totalTime: "9m total",
    journeys: [
      {
        id: "j1",
        title: "Bitcoin Design",
        url: "https://bitcoin.design",
        timestamp: "04:41",
        duration: "3m",
        children: [
          { id: "s1", title: "Guide", url: "https://bitcoin.design/guide", timestamp: "04:41", duration: "1m" },
          { id: "s2", title: "Principles", url: "https://bitcoin.design/guide/principles", timestamp: "04:42", duration: "1m" },
          { id: "s3", title: "Units", url: "https://bitcoin.design/guide/units", timestamp: "04:43", duration: "1m" }
        ]
      }
    ]
  },
  {
    id: "g2",
    title: "Sandipan, Software, Engineer",
    tags: ["sandipan", "software", "engineer", "website", "personal"],
    timestamp: "04:33",
    totalTime: "5m total",
    journeys: [
      {
        id: "j2",
        title: "Portfolio",
        url: "https://sandipan.dev",
        timestamp: "04:33",
        duration: "5m",
        children: [
          { id: "s4", title: "Home", url: "https://sandipan.dev", timestamp: "04:33", duration: "5m" }
        ]
      }
    ]
  }
];

const DUMMY_CHATS = [
  {
    id: "1",
    role: "user" as const,
    content: "hi what was I reading about?",
    timestamp: "12:45"
  },
  {
    id: "2",
    role: "assistant" as const,
    content: "You've been reading about the Wonders of the World! Specifically, you've looked at Wikipedia pages detailing the Seven Wonders of the Ancient World and a broader list of Wonders of the World, including modern contenders. https://en.wikipedia.org/wiki/Seven_Wonders_of_the_Ancient_World and https://en.wikipedia.org/wiki/Wonders_of_the_World",
    timestamp: "12:46"
  }
];

export default function DashboardPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [latestFocus, setLatestFocus] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      if (!isSignedIn) return;
      
      try {
        const token = await getToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.kaizen.apps.sandipan.dev";
        const response = await fetch(`${apiUrl}/api/focus/latest`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setLatestFocus(data);
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    if (isLoaded) {
      fetchDashboardData();
    }
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-white/10 border-t-white animate-spin" />
          <span className="text-xs uppercase tracking-widest text-gray-500">Initializing_Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white selection:text-black">
      {/* Background Grid */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/10 bg-black/50 backdrop-blur-md px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-6 h-6 bg-white flex items-center justify-center group-hover:rotate-90 transition-transform">
              <div className="w-3 h-3 bg-black rotate-45" />
            </div>
            <span className="text-lg font-bold tracking-tighter uppercase">Kaizen</span>
          </Link>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
              <Activity className="w-3 h-3 text-green-500" />
              SYSTEM_ACTIVE
            </div>
            <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8 rounded-none" } }} />
            <SignOutButton>
              <button className="flex items-center gap-2 text-xs font-mono text-gray-500 hover:text-white transition-colors uppercase tracking-widest">
                <LogOut className="w-3 h-3" />
                Exit
              </button>
            </SignOutButton>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-8 py-12">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-gray-500 mb-2 uppercase tracking-widest">
              <LayoutDashboard className="w-3 h-3" />
              Control_Center_v1.0
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Attention Analytics</h1>
          </div>
          <div className="flex gap-4">
             <div className="px-4 py-2 border border-white/10 bg-white/5 text-[10px] font-mono text-gray-400 uppercase">
                Last Sync: 2m ago
             </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
          {/* Focus Score Section */}
          <div className="md:col-span-8 space-y-6">
            <FocusSection 
              title={latestFocus?.category.replace('_', ' ') || "Bitcoin design is emphasized"}
              elapsedTime="1m"
              category={latestFocus?.category || "DEEP WORK"}
              summary={latestFocus?.summary || "You're currently focusing on decentralized interface patterns and Bitcoin design systems."}
              isLive={true}
              className="h-full"
            />
          </div>

          {/* Quick Stats Column */}
          <div className="md:col-span-4 space-y-6">
             <Card>
                <CardHeader className="flex justify-between items-center">
                   Inferred Parameters
                   <Hash className="w-3 h-3" />
                </CardHeader>
                <div className="space-y-4">
                   <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-[10px] text-gray-500 uppercase">Cognitive Load</span>
                      <span className="text-xs font-bold text-green-500">OPT_OPTIMAL</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-[10px] text-gray-500 uppercase">Retention Rate</span>
                      <span className="text-xs font-bold text-white">84%</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-[10px] text-gray-500 uppercase">Focus Consistency</span>
                      <span className="text-xs font-bold text-white">0.92</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-500 uppercase">Attention Span</span>
                      <span className="text-xs font-bold text-blue-500">INCREASING</span>
                   </div>
                </div>
             </Card>

             <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                   <div className="text-[8px] text-gray-500 uppercase mb-1">Drift</div>
                   <div className="text-xl font-bold">+12%</div>
                </Card>
                <Card className="p-4">
                   <div className="text-[8px] text-gray-500 uppercase mb-1">Streak</div>
                   <div className="text-xl font-bold">5d</div>
                </Card>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
           <div className="md:col-span-4">
              <PulseSection items={DUMMY_PULSE} />
           </div>
           <div className="md:col-span-8">
              <QuizSection 
                 questions={DUMMY_QUIZ} 
                 currentIdx={0} 
                 onSelect={() => {}} 
                 className="h-full"
              />
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
           <div className="md:col-span-12">
              <JourneyGraph groups={DUMMY_JOURNEY} />
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
           <div className="md:col-span-7">
              <StatsSection 
                totalFocusTime="19m"
                activities={[
                  { label: "Historical landmarks", value: "5m", color: "#3b82f6", count: 5 },
                  { label: "Famous landmarks", value: "4m", color: "#8b5cf6", count: 4 },
                  { label: "Calculus", value: "2m", color: "#10b981", count: 2 },
                  { label: "News publishing platform", value: "2m", color: "#f59e0b", count: 2 },
                  { label: "Football and Substack", value: "2m", color: "#ef4444", count: 2 }
                ]}
                topActivity={{
                  label: "Historical landmarks",
                  value: "5m",
                  percentage: 26
                }}
              />
           </div>
           <div className="md:col-span-5">
              <ChatWindow 
                 messages={DUMMY_CHATS} 
                 onSend={() => {}} 
                 isDetailed={true} 
              />
           </div>
        </div>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
          <ActivityCard icon={FileText} label="Text" value="24" sub="Articles" />
          <ActivityCard icon={ImageIcon} label="Images" value="156" sub="Visuals" />
          <ActivityCard icon={Youtube} label="Video" value="8" sub="Sessions" />
          <ActivityCard icon={Headphones} label="Audio" value="3" sub="Streams" />
        </div>
      </main>
    </div>
  );
}
