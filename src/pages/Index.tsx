import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { BriefingCompletenessBanner } from "@/components/briefing/BriefingCompletenessBanner";
import { useBriefingCompleteness } from "@/hooks/use-briefing-completeness";
import ChatView from "@/components/ChatView";
import DashboardView from "@/components/DashboardView";
import CreativesView from "@/components/CreativesView";
import AnalysisView from "@/components/AnalysisView";
import ComplianceView from "@/components/compliance/ComplianceView";
import FuryView from "@/components/fury/FuryView";
import CampaignPublisherView from "@/components/publisher/CampaignPublisherView";
import BudgetSmartView from "@/components/budget/BudgetSmartView";
import ApprovalsView from "@/components/ApprovalsView";
import AiHealthView from "@/components/AiHealthView";
import MemoryView from "@/components/knowledge/MemoryView";
import { StudioView } from "@/components/creatives-studio/StudioView";
import { ThemeToggle } from "@/components/ThemeToggle";

type View = "chat" | "dashboard" | "creatives" | "studio" | "analysis" | "compliance" | "fury" | "publisher" | "budget" | "approvals" | "ai-health" | "memory";

const viewTitles: Record<View, string> = {
  chat: "Assistente IA",
  dashboard: "Dashboard",
  creatives: "Criativos",
  studio: "Estudio AI",
  analysis: "Analise",
  compliance: "Compliance",
  fury: "FURY",
  publisher: "Publicar Campanha",
  budget: "Orcamento Smart",
  approvals: "Aprovacoes",
  "ai-health": "Saude do AI",
  memory: "Memoria",
};

const VIEW_STORAGE_KEY = "clickhero:currentView";
const VALID_VIEWS: View[] = ["chat", "dashboard", "creatives", "studio", "analysis", "compliance", "fury", "publisher", "budget", "approvals", "ai-health", "memory"];

function loadInitialView(): View {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved && VALID_VIEWS.includes(saved as View)) return saved as View;
  } catch { /* ignore — SSR/private mode */ }
  return "chat";
}

const Index = () => {
  const [currentView, setCurrentView] = useState<View>(loadInitialView);
  const { status: briefingStatus, isLoading: briefingLoading } = useBriefingCompleteness();

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, currentView);
    } catch { /* ignore */ }
  }, [currentView]);

  // R1.1 + R1.6: redirect pos-cadastro pro wizard quando briefing nao foi iniciado,
  // EXCETO se o usuario ja clicou "Pular por enquanto" (flag em localStorage).
  // Sem essa guarda, "Pular" causa loop infinito de redirect.
  const hasSkipped = (() => {
    try { return !!localStorage.getItem('briefing:skipped-at'); } catch { return false; }
  })();
  if (!briefingLoading && briefingStatus === 'not_started' && !hasSkipped) {
    return <Navigate to="/briefing/wizard" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        <BriefingCompletenessBanner />

        <header className="h-16 border-b border-border bg-background/50 backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              {viewTitles[currentView]}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="h-8 w-8 rounded-full bg-zinc-800 border border-white/10" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-premium">
          <div className="fade-in h-full">
            {currentView === "chat" && <ChatView />}
            {currentView === "dashboard" && <DashboardView />}
            {currentView === "creatives" && <CreativesView />}
            {currentView === "studio" && <StudioView />}
            {currentView === "analysis" && <AnalysisView />}
            {currentView === "compliance" && <ComplianceView />}
            {currentView === "fury" && <FuryView />}
            {currentView === "publisher" && <CampaignPublisherView />}
            {currentView === "budget" && <BudgetSmartView />}
            {currentView === "approvals" && <ApprovalsView />}
            {currentView === "ai-health" && <AiHealthView />}
            {currentView === "memory" && <MemoryView />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
