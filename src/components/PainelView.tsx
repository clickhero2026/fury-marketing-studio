// Painel consolidado: Resumo (Dashboard) + Analise + Orcamento Smart em tabs.
// Reduz 3 entries da sidebar pra 1 entry com tabs.

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DashboardView from './DashboardView';
import AnalysisView from './AnalysisView';
import BudgetSmartView from './budget/BudgetSmartView';

type Tab = 'resumo' | 'analise' | 'orcamento';

export default function PainelView() {
  const [tab, setTab] = useState<Tab>('resumo');

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 md:px-6 pt-4 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="analise">Analise</TabsTrigger>
            <TabsTrigger value="orcamento">Orcamento</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="px-0">
        {tab === 'resumo' && <DashboardView />}
        {tab === 'analise' && <AnalysisView />}
        {tab === 'orcamento' && <BudgetSmartView />}
      </div>
    </div>
  );
}
