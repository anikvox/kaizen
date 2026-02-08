"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth, SignOutButton, useUser } from "@clerk/nextjs";
import {
  createApiClient,
  type User,
  type Focus,
  type PomodoroStatus,
  type Pulse,
  type UnifiedSSEData,
} from "@kaizen/api-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FocusCard,
  PomodoroTimer,
  PulseCard,
  Logo,
  Separator,
} from "@kaizen/ui";
import Link from "next/link";
import {
  MessageSquare,
  Brain,
  Puzzle,
  Settings,
  LogOut,
} from "lucide-react";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export function Dashboard() {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [message, setMessage] = useState("");
  const [time, setTime] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [error, setError] = useState("");
  const [pomodoroStatus, setPomodoroStatus] = useState<PomodoroStatus | null>(
    null
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  useEffect(() => {
    const api = createApiClient(apiUrl);
    api.health.getMessage().then((res) => setMessage(res.message));
  }, []);

  // Sync user and fetch authenticated data
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    const syncUser = async () => {
      const api = createApiClient(apiUrl, getTokenFn);
      const email = clerkUser.emailAddresses[0]?.emailAddress;
      if (!email) return;

      try {
        const syncedUser = await api.users.sync({
          email,
          name: clerkUser.fullName || undefined,
        });
        setUser(syncedUser);
      } catch (err) {
        console.error("Sync error:", err);
        setError("Failed to sync user");
      }
    };

    syncUser();
  }, [isSignedIn, clerkUser, getTokenFn]);

  // Unified SSE connection
  useEffect(() => {
    if (!isSignedIn) return;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token) {
        setError("No token available");
        return;
      }

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const api = createApiClient(apiUrl);
      eventSourceRef.current = api.sse.subscribeUnified(
        (data: UnifiedSSEData) => {
          setError("");

          switch (data.type) {
            case "connected":
              setFocuses(data.focuses);
              setPomodoroStatus(data.pomodoro);
              setPulses(data.pulses);
              break;

            case "focus-changed":
              if (data.changeType === "ended") {
                setFocuses((prev) => prev.filter((f) => f.id !== data.focus?.id));
              } else if (data.changeType === "created" && data.focus) {
                setFocuses((prev) => [data.focus!, ...prev]);
              } else if (data.focus) {
                setFocuses((prev) =>
                  prev.map((f) => (f.id === data.focus!.id ? data.focus! : f))
                );
              }
              break;

            case "pomodoro-tick":
            case "pomodoro-status-changed":
              setPomodoroStatus(data.status);
              break;

            case "pulses-updated":
              setPulses(data.pulses);
              break;

            case "ping":
              setTime(data.time);
              break;
          }
        },
        () => setError("SSE connection error"),
        token
      );
    };

    setupSSE();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isSignedIn, getToken]);

  // Handle Pomodoro pause/resume
  const handlePomodoroToggle = async () => {
    const api = createApiClient(apiUrl, getTokenFn);
    if (pomodoroStatus?.state === "paused") {
      const result = await api.pomodoro.resume();
      setPomodoroStatus(result.status);
    } else if (pomodoroStatus?.state === "running") {
      const result = await api.pomodoro.pause();
      setPomodoroStatus(result.status);
    }
  };

  const navLinks = [
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "/quiz", label: "Quiz", icon: Brain },
    { href: "/extensions", label: "Extensions", icon: Puzzle },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="md" showText />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.name || user?.email || "Loading..."}
            </span>
            <SignOutButton>
              <Button variant="ghost" size="sm" className="gap-2">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </SignOutButton>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Welcome Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">
                  Welcome back
                  {user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {message || "Connecting to Kaizen..."}
                </p>
                {error && (
                  <p className="text-destructive text-sm mt-2">{error}</p>
                )}
              </CardContent>
            </Card>

            {/* Focus Card */}
            <FocusCard focuses={focuses} />

            {/* Pomodoro Timer */}
            <PomodoroTimer
              status={pomodoroStatus}
              onToggle={handlePomodoroToggle}
            />

            {/* Pulses */}
            <PulseCard pulses={pulses} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="block">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3"
                    >
                      <link.icon className="w-4 h-4" />
                      {link.label}
                    </Button>
                  </Link>
                ))}
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">System Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Connection
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          time ? "bg-focus" : "bg-muted-foreground"
                        }`}
                      />
                      <span className="text-sm">
                        {time ? "Connected" : "Connecting..."}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Last Update
                    </span>
                    <span className="text-sm font-mono">
                      {time || "--:--:--"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
