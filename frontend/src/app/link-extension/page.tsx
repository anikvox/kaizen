"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { Check, X, Loader2, Link2, Chrome, Shield, Sparkles, ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import {
  ApiClient,
  DeviceTokenService,
  createStaticAuthProvider
} from "@kaizen/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "http://localhost:60092/api";

export default function LinkExtensionPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const installationId = searchParams.get("installationId");

  const [status, setStatus] = useState<"loading" | "ready" | "linking" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleLink = useCallback(async () => {
    if (!installationId) return;

    console.log("[Link Extension] Starting link process...");
    console.log("[Link Extension] Installation ID:", installationId);
    
    setStatus("linking");
    try {
      const token = await getToken();
      console.log("[Link Extension] Got Clerk token:", token ? "✓" : "✗");
      
      if (!token) {
        throw new Error("Failed to get authentication token");
      }

      // Create API client with Clerk JWT token
      const apiClient = new ApiClient({
        baseUrl: API_BASE_URL,
        authProvider: createStaticAuthProvider(token)
      });
      
      console.log("[Link Extension] API Base URL:", API_BASE_URL);
      
      const deviceTokenService = new DeviceTokenService(apiClient);

      const linkData = {
        installationId,
        deviceName: `Chrome Extension - ${new Date().toLocaleDateString()}`,
        userEmail: user?.primaryEmailAddress?.emailAddress || "",
        userName: user?.fullName || user?.firstName || "",
        userImage: user?.imageUrl
      };
      
      console.log("[Link Extension] Sending link request with data:", linkData);

      const response = await deviceTokenService.link(linkData);

      // Log the response for debugging
      console.log("[Link Extension] Link response:", response);
      console.log("[Link Extension] Response token:", response.token);
      console.log("[Link Extension] Response user:", response.user);

      setStatus("success");
      console.log("[Link Extension] Link successful!");
    } catch (error) {
      console.error("[Link Extension] Error linking extension:", error);
      if (error instanceof Error) {
        console.error("[Link Extension] Error message:", error.message);
        console.error("[Link Extension] Error stack:", error.stack);
      }
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to link extension");
    }
  }, [installationId, getToken, user]);

  if (!isLoaded || status === "loading") {
    return (
      <div className="min-h-screen bg-background dark:bg-[#020617] text-foreground flex items-center justify-center relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        <div className="flex flex-col items-center gap-6 relative z-10 animate-fade-in">
          <div className="relative">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
            <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl animate-pulse-glow" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm font-semibold tracking-wide">Initializing Connection</p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-[#020617] text-foreground font-sans flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 z-0">
        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        {/* Gradient Orbs */}
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-orb-1" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-orb-2" />
      </div>

      <div className={`relative z-10 w-full max-w-lg transition-all duration-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
        {status === "ready" && (
          <div className="relative backdrop-blur-xl bg-background/80 dark:bg-[#0A0A0A]/80 border border-border dark:border-white/10 rounded-2xl p-8 md:p-10 shadow-2xl overflow-hidden animate-scale-in">
            
            {/* Icon with glow */}
            <div className="relative w-20 h-20 mx-auto mb-6 animate-icon-appear">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl blur-xl opacity-50" />
              <div className="relative w-full h-full bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Link2 className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center animate-badge-pop">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>
            
            <div className="text-center mb-8 animate-fade-in-delay-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Link Browser Extension
              </h1>
              <p className="text-muted-foreground text-sm md:text-base">
                Connect your <span className="font-semibold text-blue-500">Kaizen</span> extension to unlock seamless sync
              </p>
            </div>

            <div className="space-y-4 mb-8">
              {/* Extension Info Card */}
              <div className="group relative bg-secondary/50 dark:bg-white/5 border border-border dark:border-white/10 rounded-xl p-5 hover:border-blue-500/50 transition-all duration-300 animate-slide-in-left">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                <div className="relative flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Chrome className="w-6 h-6 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold">Chrome Extension</span>
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-[10px] font-bold rounded-full uppercase tracking-wider">
                        Active
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground break-all bg-background/50 dark:bg-black/20 px-3 py-2 rounded-lg">
                      {installationId?.slice(0, 12)}...{installationId?.slice(-12)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Info Card */}
              <div className="group relative bg-secondary/50 dark:bg-white/5 border border-border dark:border-white/10 rounded-xl p-5 hover:border-purple-500/50 transition-all duration-300 animate-slide-in-right">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                <div className="relative flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold mb-3">Your Account</div>
                    <div className="flex items-center gap-3">
                      {user?.imageUrl && (
                        <img
                          src={user.imageUrl}
                          alt=""
                          className="w-10 h-10 rounded-full ring-2 ring-purple-500/30 hover:scale-110 transition-transform"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{user?.fullName || user?.firstName}</div>
                        <div className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleLink}
              className="relative w-full group overflow-hidden rounded-xl animate-fade-in-delay-4"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600" />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-500 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative py-4 px-6 flex items-center justify-center gap-3 text-white font-semibold tracking-wide group-hover:scale-[1.02] group-active:scale-[0.98] transition-transform">
                <Zap className="w-5 h-5" />
                <span>Link Extension Now</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Info Text */}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground animate-fade-in-delay-5">
              <Shield className="w-3 h-3" />
              <span className="uppercase tracking-wider">Secure • Private • Encrypted</span>
            </div>
          </div>
        )}

        {status === "linking" && (
          <div className="relative backdrop-blur-xl bg-background/80 dark:bg-[#0A0A0A]/80 border border-border dark:border-white/10 rounded-2xl p-10 md:p-12 shadow-2xl text-center animate-scale-in">
            <div className="relative mb-8">
              <div className="w-20 h-20 mx-auto animate-spin-slow">
                <Loader2 className="w-full h-full text-blue-500" />
              </div>
              <div className="absolute inset-0 mx-auto w-20 h-20 rounded-full bg-blue-500/20 blur-2xl animate-pulse-glow" />
            </div>
            
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3 animate-pulse-text">
              Establishing Connection
            </h1>
            <p className="text-muted-foreground text-sm">
              Securely linking your extension...
            </p>
            
            {/* Progress dots */}
            <div className="flex justify-center gap-2 mt-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-blue-500 rounded-full animate-dot-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="relative backdrop-blur-xl bg-background/80 dark:bg-[#0A0A0A]/80 border border-border dark:border-white/10 rounded-2xl p-10 md:p-12 shadow-2xl text-center overflow-hidden animate-scale-in">
            {/* Success confetti effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(30)].map((_, i) => {
                const colors = ['bg-green-400', 'bg-blue-500', 'bg-purple-500', 'bg-yellow-400', 'bg-pink-500', 'bg-emerald-500'];
                const shapes = ['rounded-full', 'rounded-sm', 'rounded'];
                const angle = (Math.random() * 360);
                const distance = 150 + Math.random() * 200;
                const duration = 1.2 + Math.random() * 0.8;
                
                return (
                  <div
                    key={i}
                    className={`absolute w-2 h-2 ${colors[i % colors.length]} ${shapes[i % shapes.length]} animate-confetti`}
                    style={{
                      left: '50%',
                      top: '50%',
                      animationDelay: `${i * 0.03}s`,
                      animationDuration: `${duration}s`,
                      '--angle': `${angle}deg`,
                      '--distance': `${distance}px`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>

            <div className="relative w-24 h-24 mx-auto mb-6 animate-icon-appear">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full blur-xl opacity-50" />
              <div className="relative w-full h-full bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                <Check className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3 bg-gradient-to-r from-green-500 to-emerald-600 bg-clip-text text-transparent animate-fade-in-delay-2">
              Successfully Linked!
            </h1>
            <p className="text-muted-foreground text-sm md:text-base mb-8 max-w-md mx-auto animate-fade-in-delay-3">
              Your browser extension is now connected. Start tracking your focus and boost your productivity!
            </p>

            <div className="space-y-3 animate-fade-in-delay-4">
              <Link 
                href="/dashboard"
                className="block w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="flex items-center justify-center gap-2 group">
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
              <button
                onClick={() => window.close()}
                className="w-full py-4 px-6 bg-secondary/50 dark:bg-white/5 text-foreground font-medium rounded-xl hover:bg-secondary dark:hover:bg-white/10 transition-all border border-border dark:border-white/10 hover:scale-[1.02] active:scale-[0.98]"
              >
                Close This Tab
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="relative backdrop-blur-xl bg-background/80 dark:bg-[#0A0A0A]/80 border border-red-500/20 rounded-2xl p-10 md:p-12 shadow-2xl text-center animate-scale-in">
            <div className="relative w-24 h-24 mx-auto mb-6 animate-icon-appear">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-red-600 rounded-full blur-xl opacity-50" />
              <div className="relative w-full h-full bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg">
                <X className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3 text-red-500 animate-fade-in-delay-1">
              Connection Failed
            </h1>
            <p className="text-muted-foreground text-sm md:text-base mb-2 animate-fade-in-delay-2">
              {errorMessage || "Something went wrong. Please try again."}
            </p>
            <p className="text-xs text-muted-foreground mb-8 animate-fade-in-delay-3">
              If the problem persists, please contact support.
            </p>

            <div className="animate-fade-in-delay-4">
              <Link 
                href="/dashboard"
                className="block w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/50 transition-all text-center hover:scale-[1.02] active:scale-[0.98]"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }
        @keyframes orb-1 {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.2); opacity: 0.5; }
        }
        @keyframes orb-2 {
          0%, 100% { transform: scale(1.2); opacity: 0.2; }
          50% { transform: scale(1); opacity: 0.4; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes icon-appear {
          from { opacity: 0; transform: scale(0) rotate(-180deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes badge-pop {
          0% { opacity: 0; transform: scale(0); }
          50% { opacity: 0; transform: scale(0); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes slide-in-left {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes dot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.5); opacity: 1; }
        }
        @keyframes confetti {
          0% { 
            opacity: 1; 
            transform: translate(-50%, -50%) rotate(0deg) scale(0);
          }
          10% {
            opacity: 1;
            transform: translate(
              calc(-50% + cos(var(--angle)) * calc(var(--distance) * 0.3)),
              calc(-50% + sin(var(--angle)) * calc(var(--distance) * 0.3))
            ) rotate(180deg) scale(1);
          }
          100% { 
            opacity: 0; 
            transform: translate(
              calc(-50% + cos(var(--angle)) * var(--distance)),
              calc(-50% + sin(var(--angle)) * var(--distance) + 100px)
            ) rotate(720deg) scale(0.5);
          }
        }
        .animate-fade-in { animation: fade-in 0.5s ease-out; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .animate-orb-1 { animation: orb-1 8s ease-in-out infinite; }
        .animate-orb-2 { animation: orb-2 10s ease-in-out infinite; }
        .animate-scale-in { animation: scale-in 0.3s ease-out; }
        .animate-icon-appear { animation: icon-appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .animate-badge-pop { animation: badge-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .animate-slide-in-left { animation: slide-in-left 0.4s ease-out 0.2s both; }
        .animate-slide-in-right { animation: slide-in-right 0.4s ease-out 0.3s both; }
        .animate-spin-slow { animation: spin-slow 2s linear infinite; }
        .animate-pulse-text { animation: pulse-text 1.5s ease-in-out infinite; }
        .animate-dot-pulse { animation: dot-pulse 1.5s ease-in-out infinite; }
        .animate-confetti { 
          animation: confetti ease-out forwards;
        }
        .animate-fade-in-delay-1 { animation: fade-in 0.5s ease-out 0.1s both; }
        .animate-fade-in-delay-2 { animation: fade-in 0.5s ease-out 0.2s both; }
        .animate-fade-in-delay-3 { animation: fade-in 0.5s ease-out 0.3s both; }
        .animate-fade-in-delay-4 { animation: fade-in 0.5s ease-out 0.4s both; }
        .animate-fade-in-delay-5 { animation: fade-in 0.5s ease-out 0.5s both; }
      `}</style>
    </div>
  );
}
