"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type DeviceToken, type UnifiedSSEData } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export default function Extensions() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [tokens, setTokens] = useState<DeviceToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  const fetchTokens = useCallback(async () => {
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

      const result = await api.deviceTokens.list();
      setTokens(result);
      setError("");
    } catch (err) {
      console.error("Fetch tokens error:", err);
      setError("Failed to fetch extensions");
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
    fetchTokens();
  }, [isLoaded, isSignedIn, fetchTokens]);

  // Subscribe to device token changes via unified SSE
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    let eventSource: EventSource | null = null;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token) return;

      const api = createApiClient(apiUrl);
      eventSource = api.sse.subscribeUnified(
        (data: UnifiedSSEData) => {
          if (data.type === "device-list-changed") {
            if (data.action === "created") {
              // Refetch to get the new device
              fetchTokens();
            } else if (data.action === "deleted") {
              // Remove the device locally
              setTokens((prev) => prev.filter((t) => t.id !== data.deviceId));
            }
          }
        },
        (error) => {
          console.error("SSE error:", error);
        },
        token
      );
    };

    setupSSE();

    return () => {
      eventSource?.close();
    };
  }, [isSignedIn, clerkUser, getToken, fetchTokens]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to unlink this extension? It will no longer be able to access your account.")) {
      return;
    }

    setDeleting(id);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      await api.deviceTokens.delete(id);
      setTokens(tokens.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to unlink extension");
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isLoaded || loading) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Linked Extensions</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Linked Extensions</h1>
        <p>Sign in to manage your linked extensions.</p>
        <div style={{ marginTop: "1rem" }}>
          <SignInButton mode="modal" />
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Linked Extensions</h1>
        <Link href="/" style={{ color: "#666" }}>Back to Home</Link>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {tokens.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", background: "#f5f5f5", borderRadius: "8px" }}>
          <p>No extensions linked to your account.</p>
          <p style={{ fontSize: "0.9rem", color: "#666" }}>
            Open the Kaizen Chrome extension and click &quot;Link Extension&quot; to connect it to your account.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {tokens.map((token) => (
            <div
              key={token.id}
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
                <p style={{ margin: 0, fontWeight: "bold" }}>{token.name}</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  Linked: {formatDate(token.createdAt)}
                </p>
                {token.lastUsedAt && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                    Last used: {formatDate(token.lastUsedAt)}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDelete(token.id)}
                disabled={deleting === token.id}
                style={{
                  background: "#dc3545",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: deleting === token.id ? "not-allowed" : "pointer",
                  opacity: deleting === token.id ? 0.6 : 1,
                }}
              >
                {deleting === token.id ? "Unlinking..." : "Unlink"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
