"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type UserSettings } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export default function Settings() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  const fetchSettings = useCallback(async () => {
    if (!isSignedIn || !clerkUser) return;

    const api = createApiClient(apiUrl, getTokenFn);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return;

    try {
      // Sync user first
      await api.users.sync({
        email,
        name: clerkUser.fullName || undefined,
      });

      const result = await api.settings.get();
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Fetch settings error:", err);
      setError("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, clerkUser, getTokenFn]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetchSettings();
  }, [isLoaded, isSignedIn, fetchSettings]);

  // Subscribe to settings changes via SSE (for real-time sync from extensions)
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token) return;

      const api = createApiClient(apiUrl, getTokenFn);
      eventSourceRef.current = api.settings.subscribeSettings(
        (data) => {
          // Initial connection with settings
          if (data.settings) {
            setSettings(data.settings);
          }
        },
        (newSettings) => {
          // Settings changed from another source (e.g., extension)
          setSettings(newSettings);
        },
        (error) => {
          console.error("Settings SSE error:", error);
        },
        token
      );
    };

    setupSSE();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isSignedIn, clerkUser, getToken, getTokenFn]);

  const handleToggle = async (key: keyof UserSettings) => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    const newValue = !settings[key];
    const update = { [key]: newValue };

    try {
      const result = await api.settings.update(update);
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update settings error:", err);
      setError("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Settings</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Settings</h1>
        <p>Sign in to manage your settings.</p>
        <div style={{ marginTop: "1rem" }}>
          <SignInButton mode="modal" />
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "600px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <Link href="/" style={{ color: "#666" }}>Back to Home</Link>
      </div>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Cognitive Attention Tracking</h2>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
          These settings control the attention tracking behavior in the browser extension.
          Changes will sync to all linked extensions in real-time.
        </p>

        {settings && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: "bold" }}>Debug Mode</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  Shows a debug overlay with real-time attention tracking data including
                  reading progress, top candidates, and scroll velocity.
                </p>
              </div>
              <button
                onClick={() => handleToggle("cognitiveAttentionDebugMode")}
                disabled={saving}
                style={{
                  background: settings.cognitiveAttentionDebugMode ? "#28a745" : "#6c757d",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  minWidth: "60px",
                }}
              >
                {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
              </button>
            </div>

            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: "bold" }}>Show Overlay</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  Displays visual overlays around text, images, and audio elements
                  being tracked to show reading progress and attention focus.
                </p>
              </div>
              <button
                onClick={() => handleToggle("cognitiveAttentionShowOverlay")}
                disabled={saving}
                style={{
                  background: settings.cognitiveAttentionShowOverlay ? "#28a745" : "#6c757d",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  minWidth: "60px",
                }}
              >
                {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
