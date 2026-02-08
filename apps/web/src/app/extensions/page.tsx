"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import {
  createApiClient,
  type DeviceToken,
  type UnifiedSSEData,
} from "@kaizen/api-client";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Logo,
} from "@kaizen/ui";
import { ArrowLeft, Loader2, Chrome, Trash2, Link2, Clock } from "lucide-react";

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
        token,
      );
    };

    setupSSE();

    return () => {
      eventSource?.close();
    };
  }, [isSignedIn, clerkUser, getToken, fetchTokens]);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to unlink this extension? It will no longer be able to access your account.",
      )
    ) {
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
      <main className="min-h-screen bg-background p-8 max-w-6xl mx-auto">
        <Logo size="md" className="mb-6" />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-background p-8 max-w-6xl mx-auto">
        <Logo size="md" className="mb-6" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Chrome className="w-5 h-5" />
              Linked Extensions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Sign in to manage your linked extensions.
            </p>
            <SignInButton mode="modal">
              <Button>Sign In</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Logo size="md" />
          <h1 className="text-2xl font-bold">Linked Extensions</h1>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {tokens.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Link2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No extensions linked</h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Open the Kaizen Chrome extension and click &quot;Link
              Extension&quot; to connect it to your account.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tokens.map((token) => (
            <Card key={token.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                      <Chrome className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-semibold">{token.name}</p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Link2 className="w-3 h-3" />
                        <span>Linked: {formatDate(token.createdAt)}</span>
                      </div>
                      {token.lastUsedAt && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>Last used: {formatDate(token.lastUsedAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDelete(token.id)}
                    disabled={deleting === token.id}
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                  >
                    {deleting === token.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    {deleting === token.id ? "Unlinking..." : "Unlink"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
