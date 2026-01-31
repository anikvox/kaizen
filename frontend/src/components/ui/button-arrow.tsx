import { Button, ButtonProps } from "./button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ButtonArrow(props: ButtonProps) {
    return (
        <Button {...props} className={cn("group h-10 px-6", props.className)}>
            <div className="flex items-center gap-1 font-bold">
                {props.children}
                <ArrowRight size={14} className="group-hover:translate-x-1 group-hover:rotate-180 transition-all transform-gpu duration-300 delay-75 ease-in-out" />
            </div>
        </Button>
    )
}
