import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import ChatView from "@/components/ChatView";
import DashboardView from "@/components/DashboardView";
import CreativesView from "@/components/CreativesView";
import AnalysisView from "@/components/AnalysisView";

type View = "chat" | "dashboard" | "creatives" | "analysis";

const viewTitles: Record<View, string> = {
  chat: "Assistente IA",
  dashboard: "Dashboard",
  creatives: "Criativos",
  analysis: "Análise",
};

const Index = () => {
  const [currentView, setCurrentView] = useState<View>("chat");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-6">
          <h2 className="text-sm font-semibold text-foreground">{viewTitles[currentView]}</h2>
        </header>
        <div className="flex-1 overflow-hidden">
          {currentView === "chat" && <ChatView />}
          {currentView === "dashboard" && <DashboardView />}
          {currentView === "creatives" && <CreativesView />}
          {currentView === "analysis" && <AnalysisView />}
        </div>
      </main>
    </div>
  );
};

export default Index;
