// Listagem do inventario Meta sincronizado pelo deep scan.
// Spec: meta-deep-scan Corte A (UI parte).
//
// 3 sub-secoes em sub-tabs: Business Managers / Ad Sets / Pixels
// + botao varredura no topo + busca/filtro por adset

import { useState } from 'react';
import { Building2, Layers3, Activity, ShieldCheck, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useBusinessManagers, useAdsets, useMetaPixels } from '@/hooks/use-meta-inventory';
import { DeepScanButton } from './DeepScanButton';

type SubTab = 'bms' | 'adsets' | 'pixels';

function fmtCurrency(cents: number | null): string {
  if (cents == null) return '—';
  return `R$ ${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}sem`;
}

function statusVariant(status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!status) return 'outline';
  if (status === 'ACTIVE') return 'default';
  if (status === 'PAUSED') return 'secondary';
  if (status.includes('DISAPPROVED') || status.includes('DELETED') || status === 'ARCHIVED') return 'destructive';
  return 'outline';
}

export function MetaInventoryTab() {
  const [tab, setTab] = useState<SubTab>('bms');
  const [adsetSearch, setAdsetSearch] = useState('');
  const [adsetStatus, setAdsetStatus] = useState<string>('all');

  const bmsQuery = useBusinessManagers();
  const adsetsQuery = useAdsets({ search: adsetSearch, status: adsetStatus });
  const pixelsQuery = useMetaPixels();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">Conexoes Meta</h3>
          <p className="text-xs text-muted-foreground">
            Business Managers, Ad Sets e Pixels sincronizados da sua conta.
          </p>
        </div>
        <DeepScanButton />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)}>
        <TabsList>
          <TabsTrigger value="bms" className="gap-2">
            <Building2 className="h-3.5 w-3.5" />
            Business Managers
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{bmsQuery.data?.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="adsets" className="gap-2">
            <Layers3 className="h-3.5 w-3.5" />
            Ad Sets
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{adsetsQuery.data?.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pixels" className="gap-2">
            <Activity className="h-3.5 w-3.5" />
            Pixels
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{pixelsQuery.data?.length ?? 0}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* === BMs === */}
        <TabsContent value="bms" className="mt-4">
          {bmsQuery.isLoading && <p className="text-sm text-muted-foreground p-4">Carregando...</p>}
          {!bmsQuery.isLoading && (bmsQuery.data?.length ?? 0) === 0 && (
            <div className="text-center py-12 border border-dashed rounded-lg space-y-3">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Nenhuma Business Manager sincronizada ainda. Click em "Varredura profunda" acima.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {(bmsQuery.data ?? []).map((bm) => (
              <div key={bm.id} className="p-3 rounded-lg border border-border bg-card flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{bm.name ?? bm.external_id}</span>
                    {bm.vertical && <Badge variant="outline" className="text-[10px]">{bm.vertical}</Badge>}
                    {bm.verification_status && (
                      <Badge variant={bm.verification_status === 'verified' ? 'default' : 'outline'} className="text-[10px] gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {bm.verification_status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ID: {bm.external_id} · Criada em {fmtDate(bm.created_time)} · Sincronizada {fmtRelative(bm.last_scanned_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* === Ad Sets === */}
        <TabsContent value="adsets" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={adsetSearch}
                onChange={(e) => setAdsetSearch(e.target.value)}
                placeholder="Buscar ad set por nome..."
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-primary/50"
              />
            </div>
            <select
              value={adsetStatus}
              onChange={(e) => setAdsetStatus(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-primary/50"
            >
              <option value="all">Todos status</option>
              <option value="ACTIVE">Ativos</option>
              <option value="PAUSED">Pausados</option>
              <option value="ARCHIVED">Arquivados</option>
              <option value="ADSET_PAUSED">Adset pausado</option>
              <option value="CAMPAIGN_PAUSED">Campanha pausada</option>
            </select>
          </div>

          {adsetsQuery.isLoading && <p className="text-sm text-muted-foreground p-4">Carregando...</p>}
          {!adsetsQuery.isLoading && (adsetsQuery.data?.length ?? 0) === 0 && (
            <div className="text-center py-12 border border-dashed rounded-lg space-y-3">
              <Layers3 className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {adsetSearch || adsetStatus !== 'all'
                  ? 'Nenhum ad set bate com o filtro.'
                  : 'Nenhum ad set sincronizado ainda. Click em "Varredura profunda".'}
              </p>
            </div>
          )}
          <div className="space-y-2">
            {(adsetsQuery.data ?? []).map((adset) => (
              <div key={adset.id} className="p-3 rounded-lg border border-border bg-card flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 shrink-0">
                  <Layers3 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{adset.name ?? adset.external_id}</span>
                    <Badge variant={statusVariant(adset.effective_status)} className="text-[10px]">
                      {adset.effective_status ?? adset.status ?? '—'}
                    </Badge>
                    {adset.optimization_goal && (
                      <Badge variant="outline" className="text-[10px]">{adset.optimization_goal}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                    <span>Diario: {fmtCurrency(adset.daily_budget)}</span>
                    <span>Total: {fmtCurrency(adset.lifetime_budget)}</span>
                    <span>Restante: {fmtCurrency(adset.budget_remaining)}</span>
                    <span>Sincr: {fmtRelative(adset.last_scanned_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* === Pixels === */}
        <TabsContent value="pixels" className="mt-4">
          {pixelsQuery.isLoading && <p className="text-sm text-muted-foreground p-4">Carregando...</p>}
          {!pixelsQuery.isLoading && (pixelsQuery.data?.length ?? 0) === 0 && (
            <div className="text-center py-12 border border-dashed rounded-lg space-y-3">
              <Activity className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Nenhum pixel sincronizado ainda. Click em "Varredura profunda".
              </p>
            </div>
          )}
          <div className="space-y-2">
            {(pixelsQuery.data ?? []).map((px) => (
              <div key={px.id} className="p-3 rounded-lg border border-border bg-card flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{px.name ?? px.external_id}</span>
                    {px.is_unavailable && (
                      <Badge variant="destructive" className="text-[10px]">Indisponivel</Badge>
                    )}
                    {px.last_fired_time && (
                      <Badge variant="outline" className="text-[10px]">
                        Disparado {fmtRelative(px.last_fired_time)}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ID: {px.external_id} · Conta: {px.ad_account_id ?? '—'} · Criado em {fmtDate(px.creation_time)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
