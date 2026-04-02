import { MessageSquare, BarChart3, ImagePlus, TrendingUp, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type View = "chat" | "dashboard" | "creatives" | "analysis";

interface AppSidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "chat", label: "Assistente IA", icon: MessageSquare },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "creatives", label: "Criativos", icon: ImagePlus },
  { id: "analysis", label: "Análise", icon: TrendingUp },
];

const AppSidebar = ({ currentView, onViewChange }: AppSidebarProps) => {
  return (
    <aside className="w-64 sidebar-gradient flex flex-col h-screen border-r border-sidebar-border">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg chat-gradient flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-sidebar-accent-foreground">Meta Ads</h1>
            <p className="text-xs text-sidebar-foreground">Manager AI</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={() => onViewChange("chat")}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Nova conversa
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              currentView === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
          <Settings className="w-4 h-4" />
          Configurações
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
