import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

export default function AnnouncementBar() {
  return (
    <Link
      href="#"
      className="inline-flex items-center gap-2 px-1 pr-3 py-1 rounded-full bg-blue-600 text-white text-xs font-medium shine-sweep hover:brightness-110 transition-all cursor-pointer group"
    >
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
        <Sparkles size={11} />
      </span>
      <span className="tracking-wide">Kaizen v1.0 &mdash; Now in Beta</span>
      <ArrowRight
        size={12}
        className="opacity-70 group-hover:translate-x-0.5 transition-transform"
      />
    </Link>
  );
}
