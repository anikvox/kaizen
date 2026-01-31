import { Shield, Target, Zap, Eye, PenTool, ShieldAlert } from 'lucide-react';

interface Feature {
    id: number
    name: string
    description: string
    icon: JSX.Element
}

const iconSize = 18

const FeaturesData: Feature[] = [
    {
        id: 1,
        name: "Edge-Native Intelligence",
        description: "Zero-knowledge inference. Gemini Nano runs locally in your browser kernel. Your data never leaves the silicon.",
        icon: <Shield size={iconSize} />,
    },
    {
        id: 2,
        name: "Cognitive Telemetry",
        description: "High-fidelity focus tracking with 3s granularity. Map the topography of your attention in real-time.",
        icon: <Target size={iconSize} />,
    },
    {
        id: 3,
        name: "Temporal Compression",
        description: "Transform hours of deep research into actionable deltas. Auto-generated context for your past self.",
        icon: <Zap size={iconSize} />,
    },
    {
        id: 4,
        name: "Multimodal Vision",
        description: "Native image understanding and autonomous captioning. Context-aware perception for every pixel.",
        icon: <Eye size={iconSize} />,
    },
    {
        id: 5,
        name: "Semantic Refinement",
        description: "Real-time summarization and translation via native browser APIs. Precision editing at the edge.",
        icon: <PenTool size={iconSize} />,
    },
    {
        id: 6,
        name: "Algorithmic Guardrails",
        description: "Detect doom-scrolling before it drains your flow. Passive behavior analysis for active humans.",
        icon: <ShieldAlert size={iconSize} />,
    },
]

const FeaturesGrid = () => {
    return (
        <div>
            <div className="mt-8 grid w-full grid-cols-2 gap-12 md:grid-cols-2 lg:grid-cols-3">
                {FeaturesData.map((feature) => {
                    return (
                        <div key={feature.id} className="width-fit text-left group">
                            <div className="mb-2 w-fit rounded-lg bg-blue-600 p-1.5 text-center text-white transition-transform group-hover:scale-110 shadow-lg shadow-blue-500/20">
                                {feature.icon}
                            </div>
                            <div className="text-md mb-1 font-bold font-heading text-foreground group-hover:text-blue-500 transition-colors">
                                {feature.name}
                            </div>
                            <div className="font-regular max-w-sm text-xs text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                                {feature.description}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export const FeaturesWithHeading = () => {
    return (
        <div className="flex w-full max-w-5xl mx-auto flex-col items-center justify-center px-4">
            <h1 className="mb-2 max-w-3xl text-center text-2xl md:text-3xl font-bold font-heading tracking-tighter text-foreground">
                Kaizen is not like other productivity tools
            </h1>
            <p className="max-w-md text-center text-sm text-muted-foreground leading-relaxed">
                Kaizen is a cognitive architecture designed to augment your natural focus without compromising your digital sovereignty.
            </p>
            <FeaturesGrid />
        </div>
    )
}
