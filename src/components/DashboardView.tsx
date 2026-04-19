import { memo, useMemo, useState } from 'react';
import { useCampaignMetrics } from '@/hooks/use-campaigns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashFilters, type Period } from './dashboard/DashFilters';
import { DashKpiGrid, type MetricRow } from './dashboard/DashKpiGrid';
import { DashCharts } from './dashboard/DashCharts';
import { DashFuryTimeline } from './dashboard/DashFuryTimeline';

function periodDays(p: Period): number {
  if (p === 'today') return 1;
  if (p === '7d') return 7;
  return 30;
}

function dateRange(p: Period): { start: string; end: string } {
  const end = new Date().toISOString().split('T')[0];
  const days = periodDays(p);
  const start = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0];
  return { start, end };
}

function previousDateRange(p: Period): { start: string; end: string } {
  const days = periodDays(p);
  const start = new Date(Date.now() - 2 * days * 86400_000).toISOString().split('T')[0];
  const end = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0];
  return { start, end };
}

const DashboardView = () => {
  const [period, setPeriod] = useState<Period>('30d');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);

  // Buscar sempre 60 dias pra ter current + previous
  const metricsQ = useCampaignMetrics(60);

  // Ad accounts pra filtro
  const { data: accounts = [] } = useQuery<Array<{ account_id: string; account_name: string | null }>>({
    queryKey: ['ad-accounts-for-dash'],
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_ad_accounts')
        .select('account_id, account_name')
        .is('deleted_at', null);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const all = metricsQ.data ?? [];

  // Partition em current + previous
  const { currentMetrics, previousMetrics, campaignNames } = useMemo(() => {
    const { start: curStart, end: curEnd } = dateRange(period);
    const { start: prevStart, end: prevEnd } = previousDateRange(period);

    const curr: MetricRow[] = [];
    const prev: MetricRow[] = [];
    const names = new Set<string>();

    for (const m of all) {
      if (!m.data) continue;
      if (m.campanha) names.add(m.campanha);

      // Aplica filtros
      if (selectedCampaigns.length > 0 && m.campanha && !selectedCampaigns.includes(m.campanha)) continue;
      // (accounts filter requer join — v1 ignora se nao tem mapeamento campanha→account no metric)

      if (m.data >= curStart && m.data <= curEnd) curr.push(m as MetricRow);
      else if (m.data >= prevStart && m.data <= prevEnd) prev.push(m as MetricRow);
    }

    return { currentMetrics: curr, previousMetrics: prev, campaignNames: [...names].sort() };
  }, [all, period, selectedCampaigns]);

  const loading = metricsQ.isLoading;
  const error = metricsQ.isError;

  return (
    <div className="p-4 md:p-6 xl:p-8 space-y-4 md:space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Dashboard</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">Visao geral das campanhas Meta Ads</p>
        </div>
        <div className={cn(
          'flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium',
          error ? 'bg-danger/10 text-danger' : 'bg-emerald-500/10 text-emerald-400'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', error ? 'bg-danger' : 'bg-emerald-500 animate-pulse')} />
          {error ? 'Erro' : loading ? 'Carregando...' : 'Ao vivo (5 min)'}
        </div>
      </div>

      {/* Filters */}
      <DashFilters
        period={period}
        onPeriodChange={setPeriod}
        accounts={accounts}
        selectedAccounts={selectedAccounts}
        onSelectedAccountsChange={setSelectedAccounts}
        campaigns={campaignNames}
        selectedCampaigns={selectedCampaigns}
        onSelectedCampaignsChange={setSelectedCampaigns}
      />

      {/* Error state */}
      {error && (
        <div className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-400" />
          <p className="text-sm text-muted-foreground">Erro ao carregar metricas</p>
          <Button size="sm" variant="outline" onClick={() => metricsQ.refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* KPIs */}
      {!error && (
        <DashKpiGrid
          currentMetrics={currentMetrics}
          previousMetrics={previousMetrics}
          loading={loading}
        />
      )}

      {/* Charts + Timeline — stack em telas medias, lado a lado em xl (≥1280px) */}
      {!error && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <DashCharts metrics={currentMetrics} loading={loading} />
          </div>
          <div className="xl:col-span-1 min-h-[400px] xl:min-h-[600px]">
            <DashFuryTimeline />
          </div>
        </div>
      )}

      {/* Empty state (carregou mas sem dados) */}
      {!error && !loading && currentMetrics.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <p className="text-sm text-muted-foreground mb-2">Nenhuma metrica no periodo selecionado.</p>
          <p className="text-xs text-muted-foreground">Va em Integracoes e clique em Sincronizar, ou escolha outro periodo.</p>
        </div>
      )}
    </div>
  );
};

export default memo(DashboardView);
