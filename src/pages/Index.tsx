import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import ChatView from "@/components/ChatView";
import DashboardView from "@/components/DashboardView";
import CreativesView from "@/components/CreativesView";
import AnalysisView from "@/components/AnalysisView";
import ComplianceView from "@/components/compliance/ComplianceView";

type View = "chat" | "dashboard" | "creatives" | "analysis" | "compliance";

const viewTitles: Record<View, string> = {
  chat: "Assistente IA",
  dashboard: "Dashboard",
  creatives: "Criativos",
  analysis: "Analise",
  compliance: "Compliance",
};

const Index = () => {
  const [currentView, setCurrentView] = useState<View>("chat");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 border-b border-border/60 bg-background flex items-center px-6">
          <h2 className="text-[13px] font-semibold text-foreground tracking-tight">
            {viewTitles[currentView]}
          </h2>
        </header>
        <div className="flex-1 overflow-hidden">
          {currentView === "chat" && <ChatView />}
          {currentView === "dashboard" && <DashboardView />}
          {currentView === "creatives" && <CreativesView />}
          {currentView === "analysis" && <AnalysisView />}
          {currentView === "compliance" && <ComplianceView />}
        </div>
      </main>
    </div>
  );
};

export default Index;
