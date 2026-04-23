import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, badge, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-8 md:flex-row md:items-end md:justify-between md:gap-8 border-b border-white/5 mb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-4xl font-bold tracking-tighter text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="text-base text-zinc-500 font-medium">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}
