import React from "react";
import { cn } from "../utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
}

export function Button({ 
  children, 
  className, 
  variant = "primary", 
  ...props 
}: ButtonProps) {
  const variants = {
    primary: "bg-white text-black hover:bg-gray-200",
    secondary: "bg-white/10 text-white hover:bg-white/20",
    outline: "bg-transparent border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white",
    ghost: "bg-transparent text-gray-500 hover:text-white"
  };

  return (
    <button
      className={cn(
        "py-2 px-4 font-bold uppercase text-xs tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
