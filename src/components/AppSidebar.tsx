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
    <aside className="w-[200px] md:w-[220px] xl:w-[240px] 2xl:w-[260px] sidebar-gradient flex flex-col h-screen border-r border-sidebar-border shrink-0">
      {/* Topo fixo: logo + org switcher + botao novo */}
      <div className="shrink-0">
        <div className="px-5 pt-5 pb-3">
          <img src="/logo-dark.png" alt="ClickHero" className="h-7 w-auto" />
        </div>

        <div className="px-4 pb-3 border-b border-sidebar-border">
          <OrganizationSwitcher />
        </div>

        <div className="p-3">
          <button
            onClick={() => onViewChange("chat")}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium brand-gradient text-white hover:opacity-90 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Nova conversa
          </button>
        </div>
      </div>

      {/* Navigation — rola se nao couber */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5 scrollbar-thin">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all",
              currentView === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className={cn(
              "w-[18px] h-[18px] transition-colors shrink-0",
              currentView === item.id ? "text-primary" : ""
            )} />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer fixo: Integracoes + Configuracoes + User */}
      <div className="shrink-0 p-3 border-t border-sidebar-border space-y-0.5">
        <button
          onClick={() => navigate('/integrations')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all"
        >
          <Plug className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate">Integracoes</span>
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all">
          <Settings className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate">Configuracoes</span>
        </button>
        <UserMenu />
      </div>
    </aside>
  );
};

export default AppSidebar;
