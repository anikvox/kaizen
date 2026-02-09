import { BookOpen, Github, Shield, Heart } from "lucide-react";
import Link from "next/link";
import { Logo } from "@kaizen/ui";

export default function Footer() {
  return (
    <footer className="w-full border-t border-border/30 mt-24">
      <div className="w-full max-w-5xl mx-auto py-14 px-6 md:px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="space-y-2.5">
            <Link href="/" className="inline-block">
              <Logo size="sm" showText />
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Focus that follows you. A privacy-first extension that gently guides you back on track.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-3 text-sm">
            <Link
              href="#"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen size={14} />
              Documentation
            </Link>
            <Link
              href="https://github.com/anikvox/kaizen"
              target="_blank"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github size={14} />
              Source Code
            </Link>
            <Link
              href="#"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Shield size={14} />
              Privacy Policy
            </Link>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/30 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Kaizen. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              Built with{" "}
              <Heart size={10} className="text-red-400 fill-red-400" /> for
              learners
            </span>
            <span className="text-muted-foreground/30">&bull;</span>
            <a
              href="https://www.encodeclub.com/programmes/comet-resolution-v2-hackathon"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              <span className="font-semibold">Commit To Change</span> Hackathon
            </a>
          </div>
        </div>
      </div>

      {/* Watermark */}
      <div className="w-full text-center pb-4 overflow-hidden pointer-events-none select-none">
        <span className="text-[11vw] md:text-[13vw] font-black font-heading uppercase text-foreground/[0.018] tracking-tighter leading-none">
          KAIZEN
        </span>
      </div>
    </footer>
  );
}
