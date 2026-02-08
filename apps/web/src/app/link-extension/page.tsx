"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient } from "@kaizen/api-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Logo,
} from "@kaizen/ui";
import { Check, Copy, X, Loader2, Chrome } from "lucide-react";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export default function LinkExtension() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [status, setStatus] = useState<"loading" | "consent" | "linking" | "success" | "error">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [userSynced, setUserSynced] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseWindow = () => {
    window.close();
  };

  if (!isLoaded || status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Logo size="lg" className="mx-auto mb-4" />
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground mt-2">Loading...</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (status === "consent") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Logo size="lg" className="mx-auto mb-2" />
            <CardTitle>Authorize Extension</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Chrome className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="font-medium">Kaizen Chrome Extension</p>
                  <p className="text-sm text-muted-foreground">wants to access your account</p>
                </div>
              </div>
            </div>

            {!isSignedIn ? (
              <div className="text-center">
                <p className="text-muted-foreground mb-4">Sign in to continue</p>
                <SignInButton mode="modal">
                  <Button className="w-full">Sign In</Button>
                </SignInButton>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-lg bg-secondary/10 mb-6">
                  <p className="text-xs text-muted-foreground mb-1">Signed in as</p>
                  <p className="font-medium text-sm">
                    {clerkUser?.fullName || clerkUser?.emailAddresses[0]?.emailAddress}
                  </p>
                </div>

                <div className="mb-6">
                  <p className="text-sm font-medium mb-2">This will allow the extension to:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Access your account information</li>
                    <li>Track your browsing for focus detection</li>
                    <li>Send messages on your behalf</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleDeny} className="flex-1">
                    Deny
                  </Button>
                  <Button onClick={handleAuthorize} className="flex-1">
                    Authorize
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (status === "linking") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Logo size="lg" className="mx-auto mb-4" />
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-secondary" />
            <p className="text-muted-foreground mt-2">Authorizing...</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <X className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Authorization Failed</h2>
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Extension Authorized</h2>
          <p className="text-muted-foreground mb-2">
            Your Chrome extension has been linked to your account.
          </p>
          <p className="text-accent text-sm mb-6">
            You can now close this window and return to the extension.
          </p>

          <div className="flex gap-3 justify-center">
            <Button onClick={handleCloseWindow}>
              Close Window
            </Button>
            <Button variant="outline" onClick={handleCopyToken} className="gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Token"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            If the extension didn&apos;t receive the token automatically, copy it manually.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
