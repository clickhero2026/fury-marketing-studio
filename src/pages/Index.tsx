import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import ChatView from "@/components/ChatView";
import DashboardView from "@/components/DashboardView";
import CreativesView from "@/components/CreativesView";
import AnalysisView from "@/components/AnalysisView";
import ComplianceView from "@/components/compliance/ComplianceView";
import FuryView from "@/components/fury/FuryView";
import CampaignPublisherView from "@/components/publisher/CampaignPublisherView";
import BudgetSmartView from "@/components/budget/BudgetSmartView";
import { ThemeToggle } from "@/components/ThemeToggle";

type View = "chat" | "dashboard" | "creatives" | "analysis" | "compliance" | "fury" | "publisher" | "budget";

const viewTitles: Record<View, string> = {
  chat: "Assistente IA",
  dashboard: "Dashboard",
  creatives: "Criativos",
  analysis: "Analise",
  compliance: "Compliance",
  fury: "FURY",
  publisher: "Publicar Campanha",
  budget: "Orcamento Smart",
};

const Index = () => {
  const [currentView, setCurrentView] = useState<View>("chat");

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        
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
            {currentView === "analysis" && <AnalysisView />}
            {currentView === "compliance" && <ComplianceView />}
            {currentView === "fury" && <FuryView />}
            {currentView === "publisher" && <CampaignPublisherView />}
            {currentView === "budget" && <BudgetSmartView />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
