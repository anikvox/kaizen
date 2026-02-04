"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient } from "@kaizen/api-client";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export default function LinkExtension() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [status, setStatus] = useState<"loading" | "consent" | "linking" | "success" | "error">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [userSynced, setUserSynced] = useState(false);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Sync user when signed in, then show consent screen
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !clerkUser) {
      setStatus("consent");
      return;
    }

    const syncUser = async () => {
      const api = createApiClient(apiUrl, getTokenFn);
      const email = clerkUser.emailAddresses[0]?.emailAddress;
      if (!email) {
        setError("No email found");
        setStatus("error");
        return;
      }

      try {
        await api.users.sync({
          email,
          name: clerkUser.fullName || undefined,
        });
        setUserSynced(true);
        setStatus("consent");
      } catch (err) {
        console.error("Sync error:", err);
        setError("Failed to sync user");
        setStatus("error");
      }
    };

    syncUser();
  }, [isLoaded, isSignedIn, clerkUser, getTokenFn]);

  const handleAuthorize = async () => {
    if (!userSynced) return;

    setStatus("linking");
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.deviceTokens.create("Chrome Extension");
      setToken(result.token);
      setStatus("success");
    } catch (err) {
      console.error("Link error:", err);
      setError("Failed to link extension");
      setStatus("error");
    }
  };

  const handleDeny = () => {
    window.close();
  };

  // Send token to extension via postMessage
  useEffect(() => {
    if (status === "success" && token) {
      if (window.opener) {
        window.opener.postMessage({ type: "KAIZEN_DEVICE_TOKEN", token }, "*");
      }
    }
  }, [status, token]);

  const handleCopyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
    }
  };

  const handleCloseWindow = () => {
    window.close();
  };

  if (!isLoaded || status === "loading") {
    return (
      <main style={{ padding: "2rem", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
        <h1>Link Extension</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (status === "consent") {
    return (
      <main style={{ padding: "2rem", maxWidth: 400, margin: "0 auto" }}>
        <h1 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Authorize Extension</h1>

        <div style={{
          padding: "1.5rem",
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fafafa",
          marginBottom: "1.5rem"
        }}>
          <p style={{ margin: "0 0 1rem", fontWeight: 500, fontSize: "1.1rem" }}>
            Kaizen Chrome Extension
          </p>
          <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>
            wants to access your account
          </p>
        </div>

        {!isSignedIn ? (
          <>
            <p style={{ textAlign: "center", marginBottom: "1rem", color: "#666" }}>
              Sign in to continue
            </p>
            <div style={{ textAlign: "center" }}>
              <SignInButton mode="modal" />
            </div>
          </>
        ) : (
          <>
            <div style={{
              padding: "1rem",
              background: "#f0f7ff",
              borderRadius: 8,
              marginBottom: "1.5rem"
            }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "#666" }}>
                Signed in as
              </p>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {clerkUser?.fullName || clerkUser?.emailAddresses[0]?.emailAddress}
              </p>
            </div>

            <p style={{ fontSize: "0.9rem", color: "#333", marginBottom: "1rem" }}>
              This will allow the extension to:
            </p>
            <ul style={{ fontSize: "0.9rem", color: "#333", marginBottom: "1.5rem", paddingLeft: "1.5rem" }}>
              <li>Access your account information</li>
              <li>Perform actions on your behalf</li>
            </ul>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={handleDeny}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: "white",
                  color: "#333",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                Deny
              </button>
              <button
                onClick={handleAuthorize}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: "#0070f3",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                Authorize
              </button>
            </div>
          </>
        )}
      </main>
    );
  }

  if (status === "linking") {
    return (
      <main style={{ padding: "2rem", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
        <h1>Link Extension</h1>
        <p>Authorizing...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main style={{ padding: "2rem", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
        <h1>Link Extension</h1>
        <p style={{ color: "red" }}>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>&#10003;</div>
      <h1>Extension Authorized</h1>
      <p>Your Chrome extension has been linked to your account.</p>
      <p style={{ color: "#22c55e", marginTop: "1rem" }}>
        You can now close this window and return to the extension.
      </p>
      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
        <button
          onClick={handleCloseWindow}
          style={{
            padding: "10px 20px",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14
          }}
        >
          Close Window
        </button>
        <button
          onClick={handleCopyToken}
          style={{
            padding: "10px 20px",
            background: "white",
            color: "#333",
            border: "1px solid #ddd",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14
          }}
        >
          Copy Token
        </button>
      </div>
      <p style={{ fontSize: "0.8rem", color: "#666", marginTop: "1rem" }}>
        If the extension didn&apos;t receive the token automatically, copy it manually.
      </p>
    </main>
  );
}
