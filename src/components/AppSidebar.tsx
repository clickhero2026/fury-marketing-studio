import { MessageSquare, BarChart3, ImagePlus, TrendingUp, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrganizationSwitcher } from "@/components/auth/OrganizationSwitcher";
import { UserMenu } from "@/components/auth/UserMenu";

type View = "chat" | "dashboard" | "creatives" | "analysis";

interface AppSidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "chat", label: "Assistente IA", icon: MessageSquare },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "creatives", label: "Criativos", icon: ImagePlus },
  { id: "analysis", label: "Analise", icon: TrendingUp },
];

const AppSidebar = ({ currentView, onViewChange }: AppSidebarProps) => {
  return (
    <aside className="w-[260px] sidebar-gradient flex flex-col h-screen border-r border-sidebar-border">
      {/* Logo */}
      <div className="px-5 pt-5 pb-3">
        <img
          src="/logo-dark.png"
          alt="ClickHero"
          className="h-7 w-auto"
        />
      </div>

      {/* Organization Switcher */}
      <div className="px-4 pb-3 border-b border-sidebar-border">
        <OrganizationSwitcher />
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={() => onViewChange("chat")}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium brand-gradient text-white hover:opacity-90 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Nova conversa
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all",
              currentView === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className={cn(
              "w-[18px] h-[18px] transition-colors",
              currentView === item.id ? "text-primary" : ""
            )} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-0.5">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all">
          <Settings className="w-[18px] h-[18px]" />
          Configuracoes
        </button>
        <UserMenu />
      </div>
    </aside>
  );
};

export default AppSidebar;
