"use client";

import Link from "next/link";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { Github } from "lucide-react";
import { Logo, ThemeToggle, Button } from "@kaizen/ui";

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between w-full max-w-6xl mx-auto px-4 py-2.5 rounded-2xl glass shadow-lg shadow-black/[0.03] dark:shadow-black/20">
      <Link href="/" className="flex items-center gap-2">
        <Logo size="sm" showText />
      </Link>

      <div className="flex items-center gap-1.5">
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-flex items-center justify-center rounded-lg h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="GitHub"
        >
          <Github size={17} />
        </a>

        <ThemeToggle className="rounded-lg hover:bg-black/5 dark:hover:bg-white/5" />

        <SignedOut>
          <SignInButton mode="modal">
            <Button
              size="sm"
              className="ml-1 rounded-lg font-semibold px-5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 transition-all"
            >
              Sign In
            </Button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: { userButtonAvatarBox: "w-8 h-8 rounded-lg" },
            }}
          />
        </SignedIn>
      </div>
    </nav>
  );
}
