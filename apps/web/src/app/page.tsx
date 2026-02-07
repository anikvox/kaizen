"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth, SignInButton, SignOutButton, useUser } from "@clerk/nextjs";
import { createApiClient, type User, type Focus } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export default function Home() {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [message, setMessage] = useState("");
  const [time, setTime] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const focusEventSourceRef = useRef<EventSource | null>(null);

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

  // SSE connection
  useEffect(() => {
    if (!isSignedIn) return;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token) {
        setError("No token available");
        return;
      }

      const api = createApiClient(apiUrl);
      eventSourceRef.current = api.sse.subscribeTicks(
        (data) => {
          setTime(data.time);
          setError("");
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

  // Focus SSE connection
  useEffect(() => {
    if (!isSignedIn || !user) return;

    const setupFocusSSE = async () => {
      const token = await getToken();
      if (!token) return;

      // Close existing connection
      if (focusEventSourceRef.current) {
        focusEventSourceRef.current.close();
        focusEventSourceRef.current = null;
      }

      const api = createApiClient(apiUrl);
      focusEventSourceRef.current = api.focus.subscribeFocus(
        (data) => {
          setFocuses(data.focuses);
        },
        (data) => {
          if (data.changeType === "ended") {
            // Remove the ended focus from the list
            setFocuses((prev) => prev.filter((f) => f.id !== data.focus?.id));
          } else if (data.changeType === "created") {
            // Add new focus to the list
            if (data.focus) {
              setFocuses((prev) => [data.focus!, ...prev]);
            }
          } else {
            // Update existing focus
            if (data.focus) {
              setFocuses((prev) =>
                prev.map((f) => (f.id === data.focus!.id ? data.focus! : f))
              );
            }
          }
        },
        () => console.error("Focus SSE connection error"),
        token
      );
    };

    setupFocusSSE();

    return () => {
      focusEventSourceRef.current?.close();
      focusEventSourceRef.current = null;
    };
  }, [isSignedIn, user, getToken]);

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Kaizen</h1>
      <p>Public: {message}</p>

      {isSignedIn ? (
        <>
          <p>Authenticated: {user ? `Hello ${user.name || user.email}` : "loading..."}</p>

          {/* Focus Display */}
          <div style={{
            margin: "1rem 0",
            padding: "1rem",
            borderRadius: "8px",
            background: focuses.length > 0 ? "#f0f7ff" : "#f5f5f5",
            border: focuses.length > 0 ? "2px solid #007bff" : "1px solid #ddd"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: focuses.length > 0 ? "#28a745" : "#6c757d",
                display: "inline-block"
              }} />
              <strong style={{ fontSize: "0.9rem", color: "#333" }}>
                Active Focuses {focuses.length > 0 && `(${focuses.length})`}
              </strong>
            </div>
            {focuses.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {focuses.map((focus) => (
                  <div key={focus.id} style={{
                    padding: "0.5rem",
                    background: "white",
                    borderRadius: "4px",
                    borderLeft: "3px solid #007bff"
                  }}>
                    <p style={{
                      margin: "0 0 0.25rem 0",
                      fontSize: "1.1rem",
                      fontWeight: "600",
                      color: "#007bff"
                    }}>
                      {focus.item}
                    </p>
                    <p style={{
                      margin: 0,
                      fontSize: "0.75rem",
                      color: "#666"
                    }}>
                      Since {new Date(focus.startedAt).toLocaleTimeString()}
                      {focus.keywords.length > 1 && (
                        <span> • {focus.keywords.slice(0, 3).join(", ")}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: "#666", fontStyle: "italic" }}>
                No active focus detected
              </p>
            )}
          </div>

          <p style={{ fontSize: "0.8rem", color: "#999" }}>SSE: {time || "connecting..."}</p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <div style={{ marginTop: "1rem", display: "flex", gap: "1rem" }}>
            <Link href="/chat">Chat</Link>
            <Link href="/extensions">Manage Extensions</Link>
            <Link href="/settings">Settings</Link>
            <SignOutButton />
          </div>
        </>
      ) : (
        <SignInButton mode="modal" />
      )}
    </main>
  );
}
