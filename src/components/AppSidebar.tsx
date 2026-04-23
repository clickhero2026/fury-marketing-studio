import { MessageSquare, BarChart3, ImagePlus, TrendingUp, ShieldCheck, Zap, Rocket, Wallet, Settings, Plus, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { OrganizationSwitcher } from "@/components/auth/OrganizationSwitcher";
import { UserMenu } from "@/components/auth/UserMenu";
import { Logo } from "@/components/shared/Logo";

type View = "chat" | "dashboard" | "creatives" | "analysis" | "compliance" | "fury" | "publisher" | "budget";

interface AppSidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "chat", label: "Assistente IA", icon: MessageSquare },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "creatives", label: "Criativos", icon: ImagePlus },
  { id: "analysis", label: "Analise", icon: TrendingUp },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "fury", label: "FURY", icon: Zap },
  { id: "publisher", label: "Publicar", icon: Rocket },
  { id: "budget", label: "Orcamento Smart", icon: Wallet },
];

const AppSidebar = ({ currentView, onViewChange }: AppSidebarProps) => {
  const navigate = useNavigate();

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl md:w-[240px] xl:w-[260px]">
      {/* Topo: logo + org switcher + botao novo */}
      <div className="shrink-0">
        <div className="px-6 pb-2 pt-8">
          <div className="hover-lift cursor-pointer transition-all duration-300">
            <Logo size="md" />
          </div>
        </div>

        <div className="px-4 py-4">
          <OrganizationSwitcher />
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={() => onViewChange("chat")}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
            <span>Nova conversa</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground opacity-50">
          Main Menu
        </div>
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm border border-sidebar-border"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
                  )}
                />
                <span className="truncate">{item.label}</span>
                {active && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="shrink-0 space-y-1 border-t border-sidebar-border p-4">
        <button
          onClick={() => navigate('/integrations')}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
        >
          <Plug className="h-4 w-4 text-sidebar-foreground/60 group-hover:text-sidebar-foreground" />
          <span className="truncate">Integracoes</span>
        </button>
        <UserMenu />
      </div>
    </aside>
  );
};

export default AppSidebar;
