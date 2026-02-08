"use client";

import { SignInButton } from "@clerk/nextjs";
import { Logo, Button, Card, CardContent } from "@kaizen/ui";
import { Target, Timer, MessageSquare, Brain, ArrowRight } from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Focus Tracking",
    description:
      "Automatically detect and track what you're learning. Stay on target with intelligent focus detection.",
  },
  {
    icon: Timer,
    title: "Pomodoro Timer",
    description:
      "Built-in pomodoro technique with smart breaks. Maximize your productivity in focused sprints.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat Assistant",
    description:
      "Get instant answers and explanations. Your personal AI tutor is always ready to help.",
  },
  {
    icon: Brain,
    title: "Adaptive Quizzes",
    description:
      "Test your knowledge with AI-generated quizzes tailored to what you've been learning.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="md" showText />
          <SignInButton mode="modal">
            <Button variant="default" size="sm">
              Sign In
            </Button>
          </SignInButton>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 md:py-32">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <Logo size="xl" className="text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Continuous Improvement
            <br />
            <span className="text-secondary">for Your Learning</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Kaizen helps you learn smarter with AI-powered focus tracking,
            intelligent quizzes, and a personal tutor that adapts to your
            journey.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <SignInButton mode="modal">
              <Button size="lg" className="gap-2">
                Get Started <ArrowRight className="w-4 h-4" />
              </Button>
            </SignInButton>
            <Button variant="outline" size="lg">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-24 border-t">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything you need to learn better
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Powerful tools designed to enhance your learning experience and help
            you achieve continuous improvement.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border/50">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24 border-t">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="py-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Ready to transform your learning?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
              Join Kaizen today and experience the power of AI-assisted learning
              with focus tracking and adaptive quizzes.
            </p>
            <SignInButton mode="modal">
              <Button
                size="lg"
                variant="secondary"
                className="bg-white text-primary hover:bg-white/90"
              >
                Start Your Journey
              </Button>
            </SignInButton>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" showText className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Kaizen. Continuous improvement for
            your learning.
          </p>
        </div>
      </footer>
    </div>
  );
}
