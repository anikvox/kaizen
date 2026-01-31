import { Github, Twitter } from "lucide-react";
import Link from "next/link";

export default function Footer() {
    return (
        <footer id="contact" className="w-full border-t border-border mt-24 bg-background">
            <div className="w-full max-w-5xl mx-auto flex flex-col py-12 lg:py-24 px-6 md:px-4">
                <div className="flex flex-col md:flex-row justify-between gap-12 md:gap-8">
                    <div className="space-y-6 md:w-1/3">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="w-10 h-10 bg-blue-600 flex items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110 shadow-lg shadow-blue-500/20">
                                <div className="w-5 h-5 bg-white rotate-45" />
                            </div>
                            <span className="text-2xl font-black font-heading tracking-tighter uppercase text-foreground">Kaizen</span>
                        </Link>

                        <div className="flex items-center gap-4">
                            <a href="https://twitter.com" target="_blank" className="p-2.5 rounded-xl bg-secondary hover:bg-blue-500/10 hover:text-blue-500 transition-all duration-300">
                                <Twitter size={20} />
                            </a>
                            <a href="https://github.com" target="_blank" className="p-2.5 rounded-xl bg-secondary hover:bg-foreground hover:text-background transition-all duration-300">
                                <Github size={20} />
                            </a>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button className="px-5 py-2 bg-blue-600 text-white text-xs font-bold font-heading rounded-lg hover:bg-blue-500 transition-colors uppercase tracking-widest shadow-blue-500/20 shadow-lg">
                                Get Started
                            </button>
                            <button className="px-5 py-2 border border-border text-foreground text-xs font-bold font-heading rounded-lg hover:bg-secondary transition-colors uppercase tracking-widest">
                                Learn More
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-10 md:w-2/3 md:justify-items-end">
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold font-heading text-blue-500 uppercase tracking-widest">Product</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li><Link href="#" className="hover:text-foreground transition-colors">Extension</Link></li>
                                <li><Link href="#" className="hover:text-foreground transition-colors">Dashboard</Link></li>
                                <li><Link href="#" className="hover:text-foreground transition-colors">Architecture</Link></li>
                            </ul>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-sm font-bold font-heading text-blue-500 uppercase tracking-widest">Resources</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li><Link href="#" className="hover:text-foreground transition-colors">Manifesto</Link></li>
                                <li><Link href="#" className="hover:text-foreground transition-colors">Documentation</Link></li>
                                <li><Link href="#" className="hover:text-foreground transition-colors">Source Code</Link></li>
                            </ul>
                        </div>

                        <div className="space-y-4 hidden md:block">
                            <h4 className="text-sm font-bold font-heading text-blue-500 uppercase tracking-widest">Privacy</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li><Link href="#" className="hover:text-foreground transition-colors">Terms</Link></li>
                                <li><Link href="#" className="hover:text-foreground transition-colors">Privacy</Link></li>
                                <li><Link href="#" className="hover:text-foreground transition-colors">Cookies</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
                    <p>© 2026 KAIZEN_SYSTEMS. All rights reserved.</p>
                    <div className="flex gap-6">
                        <Link href="#" className="hover:text-foreground transition-colors">Privacy Policy</Link>
                        <Link href="#" className="hover:text-foreground transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </div>

            <div className="w-full text-center pb-8 overflow-hidden pointer-events-none select-none">
                <h1 className="text-[12vw] md:text-[16vw] font-black font-heading uppercase text-foreground/[0.03] tracking-tighter leading-none whitespace-nowrap">
                    KAIZEN
                </h1>
            </div>
        </footer>
    );
}
