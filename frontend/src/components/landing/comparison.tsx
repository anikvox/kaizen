import { X, Check, Settings2, Zap, FileText, PenTool } from 'lucide-react';

export default function Comparison() {
    return (
        <div className="w-full max-w-5xl mx-auto min-h-[75vh] flex flex-col justify-center px-4">
            <div className="relative flex justify-between items-center text-3xl md:text-5xl font-bold h-16 md:h-28 mb-8">
                <div className="relative w-full text-center h-full flex items-center justify-center bg-no-repeat bg-right">
                    <h3 className="text-muted-foreground/40 font-heading">Others</h3>
                    <div className="absolute top-1/2 -translate-y-1/2 right-0 w-full h-full bg-gradient-to-l from-muted/20 via-transparent to-transparent"></div>
                </div>

                <div className="relative w-full text-center h-full flex items-center justify-center bg-no-repeat">
                    <h3 className="font-heading theme-gradient">Kaizen</h3>
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-full bg-gradient-to-r from-blue-700/10 via-transparent to-transparent"></div>
                </div>

                <div className="absolute size-14 md:size-20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex justify-center items-center bg-background/10 backdrop-blur-[1px] border-4 md:border-8 border-background/50 overflow-hidden cursor-pointer hover:scale-110 duration-500 transition-all ease-out z-20">
                    <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                        <div className="w-4 h-4 md:w-8 md:h-8 bg-white rotate-45" />
                    </div>
                </div>
            </div>

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-px bg-border/50 rounded-xl md:rounded-3xl border border-border/50 overflow-hidden shadow-2xl">
                <div className="relative w-full h-full p-8 md:p-12 bg-background border-r border-border/50">
                    <div className="w-full border-b border-border text-center text-xl md:text-2xl font-bold font-heading pb-6 mb-8 text-muted-foreground/60">
                        <h3>Standard Productivity</h3>
                    </div>
                    <div className="text-sm md:text-lg space-y-4">
                        {othersItems.map((item, index) => (
                            <div key={index} className="flex gap-3 items-center group">
                                <span className="p-1.5 rounded-full bg-muted text-muted-foreground group-hover:bg-red-500/10 group-hover:text-red-500 transition-colors">{item.icon}</span>
                                <span className="text-muted-foreground group-hover:text-foreground transition-colors">{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative w-full h-full p-8 md:p-12 bg-gradient-to-b from-blue-500/10 via-background to-background">
                    <Shine />
                    <div className="w-full border-b border-blue-500/20 text-center text-xl md:text-2xl font-bold font-heading pb-6 mb-8 theme-gradient">
                        <h3>Kaizen Cognitive Engine</h3>
                    </div>
                    <div className="text-sm md:text-lg space-y-4 font-bold">
                        {productItems.map((item, index) => (
                            <div key={index} className="flex gap-3 items-center group/pros">
                                <span className="p-1.5 rounded-full bg-blue-500/10 text-blue-500 group-hover/pros:bg-blue-600 group-hover/pros:text-white transition-all duration-300">{item.icon}</span>
                                <span className="text-foreground group-hover/pros:text-blue-600 transition-colors">{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

const Shine = () => {
    return (
        <svg
            width="170"
            height="92"
            viewBox="0 0 170 92"
            fill="none"
            className="absolute top-0 left-1/2 -translate-x-1/2 opacity-30 pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M34.4048 0H133.571L170 91.0714H0L34.4048 0Z"
                fill="url(#paint0_linear)"
                fillOpacity="0.2"
            />
            <defs>
                <linearGradient
                    id="paint0_linear"
                    x1="83.9881"
                    y1="0"
                    x2="83.9881"
                    y2="52.619"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop stopColor="#3b82f6" />
                    <stop offset="1" stopColor="#1e3a8a" stopOpacity="0" />
                </linearGradient>
            </defs>
        </svg>
    );
};

const othersItems = [
    {
        icon: <X size={16} />,
        text: "Centralized Cloud Indexing",
    },
    {
        icon: <X size={16} />,
        text: "Opaque Data Harvesting",
    },
    {
        icon: <X size={16} />,
        text: "Forced Subscription Models",
    },
    {
        icon: <X size={16} />,
        text: "Algorithmically Biased Feeds",
    },
    {
        icon: <X size={16} />,
        text: "Thermal Throttling & Lag",
    },
];

const productItems = [
    {
        icon: <Check size={16} />,
        text: "On-Device Gemini Inference",
    },
    {
        icon: <Settings2 size={16} />,
        text: "Zero-Knowledge Local Storage",
    },
    {
        icon: <Zap size={16} />,
        text: "Deterministic Concurrency",
    },
    {
        icon: <FileText size={16} />,
        text: "Full Data Sovereignty",
    },
    {
        icon: <PenTool size={16} />,
        text: "Passive Focus Guardianship",
    },
];
