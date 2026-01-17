"use client";

import React, { useEffect, useState } from "react";
import { useAuth, UserButton, SignOutButton } from "@clerk/nextjs";
import { 
  Activity, 
  Brain, 
  Clock, 
  FileText, 
  Image as ImageIcon, 
  Youtube, 
  Headphones,
  TrendingUp,
  LayoutDashboard,
  LogOut
} from "lucide-react";
import Link from "next/link";

interface FocusData {
  score: number;
  category: string;
  summary: string;
  timestamp: string;
}

interface ActivityCount {
  text: number;
  image: number;
  youtube: number;
  audio: number;
}

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
        <header className="mb-12">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-500 mb-2 uppercase tracking-widest">
            <LayoutDashboard className="w-3 h-3" />
            Control_Center_v1.0
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Attention Analytics</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Focus Score Card */}
          <div className="md:col-span-2 bg-white/5 border border-white/10 p-8 rounded-none relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Brain className="w-32 h-32" />
            </div>
            
            <div className="relative z-10">
              <div className="text-sm font-mono text-gray-500 mb-8 uppercase tracking-widest">Current_Focus_Score</div>
              <div className="flex items-end gap-4 mb-4">
                <span className="text-8xl font-bold tracking-tighter">{latestFocus?.score ?? "--"}</span>
                <span className="text-2xl font-mono text-gray-500 mb-4">/100</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white text-black text-[10px] font-bold uppercase tracking-widest mb-6">
                {latestFocus?.category.replace('_', ' ') ?? "NO_DATA"}
              </div>
              <p className="text-gray-400 max-w-md leading-relaxed">
                {latestFocus?.summary ?? "No recent focus sessions analyzed. Start browsing with the Kaizen extension to see your analytics here."}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Temporal_Drift</span>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold">+12%</div>
              <div className="text-[10px] text-gray-500 mt-1 uppercase">Vs Last 24 Hours</div>
            </div>
            
            <div className="bg-white/5 border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Deep_Work_Time</span>
                <Clock className="w-4 h-4 text-white" />
              </div>
              <div className="text-2xl font-bold">4h 12m</div>
              <div className="text-[10px] text-gray-500 mt-1 uppercase">Cumulative Today</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <ActivityCard icon={FileText} label="Text" value="24" sub="Articles" />
          <ActivityCard icon={ImageIcon} label="Images" value="156" sub="Visuals" />
          <ActivityCard icon={Youtube} label="Video" value="8" sub="Sessions" />
          <ActivityCard icon={Headphones} label="Audio" value="3" sub="Streams" />
        </div>
      </main>
    </div>
  );
}

function ActivityCard({ icon: Icon, label, value, sub }: { icon: any, label: string, value: string, sub: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-colors group">
      <div className="flex items-center justify-between mb-6">
        <Icon className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-3xl font-bold mb-1 tracking-tight">{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest">{sub}</div>
    </div>
  );
}
