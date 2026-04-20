import { MessageSquare, BarChart3, ImagePlus, TrendingUp, ShieldCheck, Zap, Rocket, Wallet, Settings, Plus, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { OrganizationSwitcher } from "@/components/auth/OrganizationSwitcher";
import { UserMenu } from "@/components/auth/UserMenu";

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
    <aside className="flex h-screen w-[200px] shrink-0 flex-col border-r border-sidebar-border sidebar-gradient md:w-[220px] xl:w-[240px] 2xl:w-[260px]">
      {/* Topo: logo + org switcher + botao novo */}
      <div className="shrink-0">
        <div className="px-5 pb-3 pt-5">
          <img src="/logo-dark.png" alt="ClickHero" className="h-7 w-auto" />
        </div>

        <div className="border-b border-sidebar-border px-4 pb-3">
          <OrganizationSwitcher />
        </div>

        <div className="p-3">
          <button
            onClick={() => onViewChange("chat")}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#cf6f03_0%,#e8850a_100%)] px-3 py-2.5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),_0_2px_8px_-2px_rgb(207_111_3/0.5)] transition-all duration-base ease-smooth hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.22),_0_4px_12px_-2px_rgb(207_111_3/0.6)] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 transition-transform duration-base ease-smooth group-hover:rotate-90" />
            <span>Nova conversa</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="scrollbar-dark min-h-0 flex-1 overflow-y-auto px-3 py-1">
        <div className="mb-1 px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50">
          Workspace
        </div>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-base ease-smooth",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-e1"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                {/* Indicador lateral animado */}
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-base ease-smooth",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                  )}
                />
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    active ? "text-primary" : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground",
                  )}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer: Integracoes + Configuracoes + User */}
      <div className="shrink-0 space-y-0.5 border-t border-sidebar-border p-3">
        <button
          onClick={() => navigate('/integrations')}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition-all duration-base ease-smooth hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <Plug className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/70 transition-colors group-hover:text-sidebar-accent-foreground" strokeWidth={1.8} />
          <span className="truncate">Integracoes</span>
        </button>
        <button className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition-all duration-base ease-smooth hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground">
          <Settings className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/70 transition-colors group-hover:text-sidebar-accent-foreground" strokeWidth={1.8} />
          <span className="truncate">Configuracoes</span>
        </button>
        <UserMenu />
      </div>
    </aside>
  );
};

export default AppSidebar;
