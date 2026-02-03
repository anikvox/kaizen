import { BookOpen, Github, Shield } from "lucide-react";
import Link from "next/link";

export default function Footer() {
    return (
        <footer id="contact" className="w-full border-t border-border mt-24 bg-background">
            <div className="w-full max-w-5xl mx-auto py-12 px-6 md:px-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                    {/* Logo and tagline */}
                    <div className="space-y-3">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="w-9 h-9 bg-blue-600 flex items-center justify-center rounded-xl transition-transform shadow-lg shadow-blue-500/20">
                                <div className="w-4 h-4 bg-white rotate-45" />
                            </div>
                            <span className="text-xl font-black font-heading tracking-tighter uppercase text-foreground">Kaizen</span>
                        </Link>
                        <p className="text-sm text-muted-foreground max-w-xs">
                            Privacy-first Chrome extension for personal growth and learning
                        </p>
                    </div>

                    {/* Links - Vertical Stack with Icons */}
                    <div className="flex flex-col items-start md:items-end gap-4 text-sm">
                        <Link 
                            href="#" 
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium"
                        >
                            <BookOpen size={16} />
                            Documentation
                        </Link>
                        <Link 
                            href="https://github.com" 
                            target="_blank"
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium"
                        >
                            <Github size={16} />
                            Source Code
                        </Link>
                        <Link 
                            href="#" 
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium"
                        >
                            <Shield size={16} />
                            Privacy Policy
                        </Link>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
                    <p>© 2026 Kaizen. All rights reserved</p>
                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
                        <p className="text-muted-foreground/60">
                            Built with privacy in mind
                        </p>
                        <span className="hidden sm:inline text-muted-foreground/40">•</span>
                        <a 
                            href="https://www.encodeclub.com/programmes/comet-resolution-v2-hackathon"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground/80 hover:text-foreground transition-colors"
                        >
                            Crafted for <span className="font-semibold">Commit To Change</span> Hackathon 2026
                        </a>
                    </div>
                </div>
            </div>

            {/* Large decorative text */}
            <div className="w-full text-center pb-8 overflow-hidden pointer-events-none select-none">
                <h1 className="text-[12vw] md:text-[16vw] font-black font-heading uppercase text-foreground/[0.03] tracking-tighter leading-none whitespace-nowrap">
                    KAIZEN
                </h1>
            </div>
        </footer>
    );
}
