"use client";

import Link from "next/link";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { Github } from "lucide-react";
import ThemeToggler from "./theme-toggler";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Navbar() {
    return (
        <nav className="flex items-center justify-between w-full max-w-5xl bg-secondary/70 dark:bg-secondary/50 backdrop-blur-md backdrop-saturate-150 px-3 py-2 md:rounded-lg border border-border/50 shadow-sm mt-3 lg:mt-5">
            <div className="flex items-center gap-2 md:gap-4">
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="w-8 h-8 bg-blue-600 flex items-center justify-center rounded-lg transition-transform shadow-blue-500/20 shadow-lg">
                        <div className="w-4 h-4 bg-white rotate-45" />
                    </div>
                    <span className="text-xl font-bold font-heading tracking-tighter uppercase text-foreground">Kaizen</span>
                </Link>
            </div>

            <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-1">
                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                        <Github size={18} />
                    </a>
                </div>
                <ThemeToggler />
                <SignedOut>
                    <SignInButton mode="modal">
                        <Button size="sm" className="font-bold tracking-tight px-4 bg-foreground text-background hover:bg-foreground/90 transition-all">
                            Sign In
                        </Button>
                    </SignInButton>
                </SignedOut>
                <SignedIn>
                    <UserButton
                        afterSignOutUrl="/signed-out"
                        appearance={{ elements: { userButtonAvatarBox: "w-9 h-9 rounded-lg" } }}
                    />
                </SignedIn>
            </div>
        </nav>
    );
}
