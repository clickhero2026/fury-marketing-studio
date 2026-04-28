import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BriefingMemory {
  id: string;
  content: string;
  category: string | null;
  importance: number;
}

export interface BriefingMetrics {
  spend_now: number;
  spend_prev: number;
  impr_now: number;
  impr_prev: number;
  clicks_now: number;
  clicks_prev: number;
  conv_now: number;
  conv_prev: number;
  ctr_now: number | null;
  ctr_prev: number | null;
  spend_change_pct: number | null;
  conv_change_pct: number | null;
}

export interface ProactiveBriefing {
  generated_at: string;
  memories: BriefingMemory[];
  pending_approvals: number;
  pending_plans: number;
  compliance_alerts?: {
    total: number;
    samples: Array<{ id: string; name: string; effective_status: string; updated_at: string }>;
  };
  metrics: BriefingMetrics | null;
  has_data: boolean;
}

export interface BriefingInsight {
  kind: 'memory' | 'metric_drop' | 'metric_jump' | 'pending_actions' | 'compliance_alert';
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'success' | 'danger';
}

export function useProactiveBriefing() {
  const [briefing, setBriefing] = useState<ProactiveBriefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.rpc('get_proactive_briefing' as never);
      if (mounted) {
        setBriefing((data as unknown as ProactiveBriefing) ?? null);
        setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const insights = briefing ? buildInsights(briefing) : [];

  return { briefing, insights, isLoading };
}

function buildInsights(b: ProactiveBriefing): BriefingInsight[] {
  const out: BriefingInsight[] = [];

  // Compliance alerts (Meta DISAPPROVED, WITH_ISSUES, etc) — prioridade alta
  const ca = b.compliance_alerts;
  if (ca && ca.total > 0) {
    const sample = ca.samples?.[0];
    out.push({
      kind: 'compliance_alert',
      title: `${ca.total} anuncio${ca.total > 1 ? 's' : ''} com problema na Meta`,
      body: sample
        ? `Mais recente: "${sample.name}" — status ${sample.effective_status}`
        : 'Anuncios marcados como DISAPPROVED, WITH_ISSUES ou pendentes de revisao.',
      severity: 'danger',
    });
  }

  // Pending actions
  if (b.pending_approvals > 0 || b.pending_plans > 0) {
    const total = b.pending_approvals + b.pending_plans;
    out.push({
      kind: 'pending_actions',
      title: `${total} acao${total > 1 ? 'es' : ''} aguardando aprovacao`,
      body:
        b.pending_plans > 0
          ? `Tem ${b.pending_plans} plano(s) e ${b.pending_approvals} acao(es) avulsa(s) na fila — confira em Aprovacoes.`
          : `${b.pending_approvals} acao(es) na fila de Aprovacoes.`,
      severity: 'warning',
    });
  }

  // Metric changes
  const m = b.metrics;
  if (m && b.has_data) {
    if (m.spend_change_pct != null && Math.abs(m.spend_change_pct) >= 25) {
      const up = m.spend_change_pct > 0;
      out.push({
        kind: up ? 'metric_jump' : 'metric_drop',
        title: `Gasto ${up ? 'subiu' : 'caiu'} ${Math.abs(m.spend_change_pct).toFixed(1)}%`,
        body: `Ultimos 7d: US$ ${m.spend_now.toFixed(2)} (vs US$ ${m.spend_prev.toFixed(2)} na semana anterior).`,
        severity: up ? 'warning' : 'info',
      });
    }
    if (m.conv_change_pct != null && Math.abs(m.conv_change_pct) >= 30) {
      const up = m.conv_change_pct > 0;
      out.push({
        kind: up ? 'metric_jump' : 'metric_drop',
        title: `Conversoes ${up ? 'subiram' : 'cairam'} ${Math.abs(m.conv_change_pct).toFixed(1)}%`,
        body: `Ultimos 7d: ${m.conv_now} (vs ${m.conv_prev} na semana anterior).`,
        severity: up ? 'success' : 'warning',
      });
    }
    if (m.ctr_now != null && m.ctr_prev != null && m.ctr_prev > 0) {
      const ctrChange = ((m.ctr_now - m.ctr_prev) / m.ctr_prev) * 100;
      if (Math.abs(ctrChange) >= 20) {
        const up = ctrChange > 0;
        out.push({
          kind: up ? 'metric_jump' : 'metric_drop',
          title: `CTR ${up ? 'subiu' : 'caiu'} ${Math.abs(ctrChange).toFixed(1)}%`,
          body: `${(m.ctr_now * 100).toFixed(2)}% vs ${(m.ctr_prev * 100).toFixed(2)}% na semana anterior.`,
          severity: up ? 'success' : 'warning',
        });
      }
    }
  }

  // Memory highlights (max 1)
  if (b.memories.length > 0) {
    const top = b.memories[0];
    out.push({
      kind: 'memory',
      title: 'Notei sobre voce',
      body: top.content,
      severity: 'info',
    });
  }

  return out.slice(0, 3);
}
