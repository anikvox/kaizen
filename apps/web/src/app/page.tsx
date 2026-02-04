"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth, SignInButton, SignOutButton, useUser } from "@clerk/nextjs";
import { createApiClient, type User } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export default function Home() {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [message, setMessage] = useState("");
  const [time, setTime] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
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

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Kaizen</h1>
      <p>Public: {message}</p>

      {isSignedIn ? (
        <>
          <p>Authenticated: {user ? `Hello ${user.name || user.email}` : "loading..."}</p>
          <p>SSE: {time || "connecting..."}</p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <div style={{ marginTop: "1rem", display: "flex", gap: "1rem" }}>
            <Link href="/extensions">Manage Extensions</Link>
            <SignOutButton />
          </div>
        </>
      ) : (
        <SignInButton mode="modal" />
      )}
    </main>
  );
}
