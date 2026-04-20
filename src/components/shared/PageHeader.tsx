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
        "flex flex-col gap-4 pb-6 md:flex-row md:items-start md:justify-between md:gap-8",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="text-display-sm font-semibold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {description ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
