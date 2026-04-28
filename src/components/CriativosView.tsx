// Criativos consolidado: Da IA (StudioView) + Da Meta (synced ads, read-only) em tabs.
// Reduz 2 entries da sidebar (Criativos + Estudio AI) pra 1.

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StudioView } from './creatives-studio/StudioView';
import CreativesViewMeta from './CreativesView';

type Tab = 'ia' | 'meta';

export default function CriativosView() {
  const [tab, setTab] = useState<Tab>('ia');

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 md:px-6 pt-4 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="ia">Criados pela IA</TabsTrigger>
            <TabsTrigger value="meta">Sincronizados da Meta</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div>
        {tab === 'ia' && <StudioView />}
        {tab === 'meta' && <CreativesViewMeta />}
      </div>
    </div>
  );
}
