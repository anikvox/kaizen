import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function AnnouncementBar() {
    return (
        <Link
            href="#"
            className="bg-gradient-to-r from-blue-800/50 to-blue-600/30 border-blue-800/80 border border-b-0 rounded-full flex justify-between p-1 text-xs items-center gap-2 shine shine-hover hover:scale-105 duration-100 transition-transform transform-gpu ease-in-out cursor-pointer group"
        >
            <div className="px-[0.35rem] py-[0.125rem] rounded-">
                ✨
            </div>
            <p className="text-white">Announcing Kaizen</p>
            <ArrowRight
                size={14}
                className="text-blue-200 -translate-x-1 group-hover:-translate-x-[2px] duration-200 delay-75 transition-transform transform-gpu ease-in-out"
            />
        </Link>
    );
}
