"use client";

import React, { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { Check, X, Loader2, Link2, Chrome, Shield } from "lucide-react";
import Link from "next/link";

export default function LinkExtensionPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const installationId = searchParams.get("installationId");
  
  const [status, setStatus] = useState<"loading" | "ready" | "linking" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (isLoaded) {
      if (!isSignedIn) {
        // Redirect to sign in with return URL
        const returnUrl = `/link-extension?installationId=${installationId}`;
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`;
        return;
      }
      if (!installationId) {
        setStatus("error");
        setErrorMessage("Missing installation ID. Please try again from the extension.");
        return;
      }
      setStatus("ready");
    }
  }, [isLoaded, isSignedIn, installationId]);

  const handleLink = async () => {
    if (!installationId) return;
    
    setStatus("linking");
    try {
      const token = await getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:60092";
      
      const response = await fetch(`${apiUrl}/api/device-tokens/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          installationId,
          deviceName: `Chrome Extension - ${new Date().toLocaleDateString()}`,
          userEmail: user?.primaryEmailAddress?.emailAddress,
          userName: user?.fullName || user?.firstName,
          userImage: user?.imageUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to link extension");
      }

      setStatus("success");
    } catch (error) {
      console.error("Error linking extension:", error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to link extension");
    }
  };

  if (!isLoaded || status === "loading") {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs uppercase tracking-widest text-gray-500">Initializing...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white selection:text-black flex items-center justify-center p-8">
      {/* Background Grid */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 w-full max-w-md">
        {status === "ready" && (
          <div className="bg-[#0A0A0A] border border-white/10 p-8 text-center">
            <div className="w-16 h-16 bg-white/10 flex items-center justify-center mx-auto mb-6">
              <Link2 className="w-8 h-8" />
            </div>
            
            <h1 className="text-2xl font-bold tracking-tight mb-2">Link Browser Extension</h1>
            <p className="text-gray-400 text-sm mb-8">
              Connect your Kaizen browser extension to your account
            </p>

            <div className="bg-white/5 border border-white/10 p-4 mb-6 text-left">
              <div className="flex items-center gap-3 mb-3">
                <Chrome className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-mono text-gray-300">Chrome Extension</span>
              </div>
              <div className="text-[10px] font-mono text-gray-500 break-all">
                ID: {installationId?.slice(0, 8)}...{installationId?.slice(-8)}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 p-4 mb-8 text-left">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-mono text-gray-300">Your Account</span>
              </div>
              <div className="flex items-center gap-3">
                {user?.imageUrl && (
                  <img src={user.imageUrl} alt="" className="w-8 h-8" />
                )}
                <div>
                  <div className="text-sm">{user?.fullName || user?.firstName}</div>
                  <div className="text-[10px] text-gray-500">{user?.primaryEmailAddress?.emailAddress}</div>
                </div>
              </div>
            </div>

            <button
              onClick={handleLink}
              className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              Link Extension
            </button>

            <p className="mt-6 text-[10px] text-gray-500 uppercase tracking-widest">
              This will allow the extension to sync your focus data
            </p>
          </div>
        )}

        {status === "linking" && (
          <div className="bg-[#0A0A0A] border border-white/10 p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-6" />
            <h1 className="text-xl font-bold tracking-tight mb-2">Linking Extension...</h1>
            <p className="text-gray-400 text-sm">Please wait</p>
          </div>
        )}

        {status === "success" && (
          <div className="bg-[#0A0A0A] border border-white/10 p-8 text-center">
            <div className="w-16 h-16 bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            
            <h1 className="text-2xl font-bold tracking-tight mb-2">Extension Linked!</h1>
            <p className="text-gray-400 text-sm mb-8">
              Your browser extension is now connected to your account. You can close this tab and return to the extension.
            </p>

            <div className="space-y-3">
              <Link
                href="/dashboard"
                className="block w-full py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-all text-center"
              >
                Go to Dashboard
              </Link>
              <button
                onClick={() => window.close()}
                className="block w-full py-4 bg-white/10 text-white font-bold uppercase tracking-widest hover:bg-white/20 transition-all"
              >
                Close This Tab
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="bg-[#0A0A0A] border border-white/10 p-8 text-center">
            <div className="w-16 h-16 bg-red-500/20 flex items-center justify-center mx-auto mb-6">
              <X className="w-8 h-8 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-bold tracking-tight mb-2">Linking Failed</h1>
            <p className="text-gray-400 text-sm mb-8">
              {errorMessage || "Something went wrong. Please try again."}
            </p>

            <Link
              href="/dashboard"
              className="block w-full py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-all text-center"
            >
              Go to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
