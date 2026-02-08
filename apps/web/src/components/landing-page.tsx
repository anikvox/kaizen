"use client";

import { SignInButton } from "@clerk/nextjs";
import { Logo, Button } from "@kaizen/ui";
import {
  Target,
  Timer,
  MessageSquare,
  Brain,
  ArrowRight,
  Zap,
  LineChart,
  Sparkles,
  Chrome,
  Clock,
  BookOpen,
} from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo size="sm" showText />
          <SignInButton mode="modal">
            <Button size="sm">Sign In</Button>
          </SignInButton>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered Learning Enhancement
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Continuous Improvement
            <br />
            <span className="bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">
              for Your Learning
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Kaizen tracks your browsing, understands what you&apos;re learning, and helps you
            retain knowledge with AI-powered summaries, quizzes, and insights.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <SignInButton mode="modal">
              <Button size="lg" className="gap-2">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
            </SignInButton>
            <Button variant="outline" size="lg" className="gap-2">
              <Chrome className="w-4 h-4" />
              Chrome Extension
            </Button>
          </div>
        </div>

        {/* Bento Grid Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">

          {/* Focus Tracking - Large */}
          <div className="md:col-span-2 row-span-1 rounded-2xl bg-gradient-to-br from-focus/20 to-focus/5 border border-focus/20 p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-focus/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-500" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-focus/20 flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-focus" />
              </div>
              <h3 className="text-xl font-bold mb-2">Intelligent Focus Detection</h3>
              <p className="text-muted-foreground max-w-md">
                Automatically detects what you&apos;re researching based on your browsing patterns.
                No manual tracking needed.
              </p>
              <div className="flex items-center gap-4 mt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  Real-time tracking
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LineChart className="w-4 h-4" />
                  Pattern analysis
                </div>
              </div>
            </div>
          </div>

          {/* Pomodoro Timer */}
          <div className="rounded-2xl bg-gradient-to-br from-pomodoro/20 to-pomodoro/5 border border-pomodoro/20 p-6 flex flex-col">
            <div className="w-10 h-10 rounded-lg bg-pomodoro/20 flex items-center justify-center mb-4">
              <Timer className="w-5 h-5 text-pomodoro" />
            </div>
            <h3 className="font-bold mb-2">Pomodoro Timer</h3>
            <p className="text-sm text-muted-foreground flex-1">
              Automatic focus tracking that starts when you work
            </p>
            <div className="mt-4 font-mono text-2xl font-bold text-pomodoro">
              25:00
            </div>
          </div>

          {/* Quick Stats Preview */}
          <div className="rounded-2xl bg-muted/30 border border-border/50 p-6">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center mb-4">
              <LineChart className="w-5 h-5 text-accent" />
            </div>
            <h3 className="font-bold mb-2">Daily Insights</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Track your learning progress
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Topics learned</span>
                <span className="font-semibold">12</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Focus time</span>
                <span className="font-semibold">2h 45m</span>
              </div>
            </div>
          </div>

          {/* AI Chat - Wide */}
          <div className="md:col-span-2 rounded-2xl bg-gradient-to-br from-secondary/20 to-secondary/5 border border-secondary/20 p-8 relative overflow-hidden group">
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/10 rounded-full translate-y-1/2 -translate-x-1/2 group-hover:scale-110 transition-transform duration-500" />
            <div className="relative flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center mb-4">
                  <MessageSquare className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="text-xl font-bold mb-2">AI Chat Assistant</h3>
                <p className="text-muted-foreground">
                  Ask questions about anything you&apos;ve been reading. Get instant answers
                  based on your browsing context.
                </p>
              </div>
              <div className="flex-shrink-0 w-full md:w-64 p-4 rounded-xl bg-background/50 border border-secondary/10">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3 h-3 text-secondary" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Based on your reading, here&apos;s a summary of React hooks...
                  </p>
                </div>
                <div className="h-px bg-border/50 my-2" />
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  Context-aware responses
                </p>
              </div>
            </div>
          </div>

          {/* Adaptive Quizzes */}
          <div className="md:col-span-2 lg:col-span-1 rounded-2xl bg-gradient-to-br from-pulse/20 to-pulse/5 border border-pulse/20 p-6">
            <div className="w-10 h-10 rounded-lg bg-pulse/20 flex items-center justify-center mb-4">
              <Brain className="w-5 h-5 text-pulse" />
            </div>
            <h3 className="font-bold mb-2">Adaptive Quizzes</h3>
            <p className="text-sm text-muted-foreground mb-4">
              AI generates quizzes from what you&apos;ve actually read
            </p>
            <div className="p-3 rounded-lg bg-background/50 border border-pulse/10">
              <p className="text-xs text-muted-foreground mb-2">Sample question:</p>
              <p className="text-sm font-medium">What is the main benefit of useCallback?</p>
            </div>
          </div>

          {/* Learning Pulses */}
          <div className="rounded-2xl bg-muted/30 border border-border/50 p-6">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-bold mb-2">Learning Pulses</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Quick insights from your reading
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-amber-500 mt-1" />
                <p className="text-xs text-muted-foreground">You learned about React patterns</p>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-amber-500 mt-1" />
                <p className="text-xs text-muted-foreground">New topic: State management</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* How it Works */}
      <section className="border-t border-border/50 bg-muted/20">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Kaizen Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Simple setup, powerful results. Get started in minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                <Chrome className="w-8 h-8 text-secondary" />
              </div>
              <div className="text-sm font-semibold text-secondary mb-2">Step 1</div>
              <h3 className="font-bold mb-2">Install Extension</h3>
              <p className="text-sm text-muted-foreground">
                Add the Kaizen Chrome extension to your browser
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-focus/10 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-focus" />
              </div>
              <div className="text-sm font-semibold text-focus mb-2">Step 2</div>
              <h3 className="font-bold mb-2">Browse Normally</h3>
              <p className="text-sm text-muted-foreground">
                Read articles, docs, tutorials - we track what you learn
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-pulse/10 flex items-center justify-center mx-auto mb-4">
                <Brain className="w-8 h-8 text-pulse" />
              </div>
              <div className="text-sm font-semibold text-pulse mb-2">Step 3</div>
              <h3 className="font-bold mb-2">Learn & Retain</h3>
              <p className="text-sm text-muted-foreground">
                Get AI summaries, take quizzes, chat about what you learned
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-12 md:p-16 text-center text-primary-foreground relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative">
            <Logo size="lg" className="mx-auto mb-6 text-primary-foreground" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Start Your Learning Journey
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
              Join thousands of learners who use Kaizen to enhance their knowledge
              retention and accelerate their growth.
            </p>
            <SignInButton mode="modal">
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 gap-2"
              >
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
            </SignInButton>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" showText className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Kaizen. Continuous improvement for your learning.
          </p>
        </div>
      </footer>
    </div>
  );
}
