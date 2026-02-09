import { cn } from "@kaizen/ui";

export function BentoGrid({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-3 max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

export function BentoGridItem({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bento-card row-span-1 rounded-2xl card-surface p-4",
        "justify-between flex flex-col space-y-4",
        className
      )}
    >
      {header}
      <div className="px-1">
        <div className="text-blue-600 dark:text-blue-400">{icon}</div>
        <div className="font-heading font-semibold text-foreground mb-1 mt-2 tracking-tight text-sm">
          {title}
        </div>
        <div className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </div>
      </div>
    </div>
  );
}
