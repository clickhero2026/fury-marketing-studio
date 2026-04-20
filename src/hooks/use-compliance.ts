import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface ComplianceScore {
  id: string;
  company_id: string;
  creative_id: string;
  external_ad_id: string | null;
  copy_score: number | null;
  image_score: number | null;
  final_score: number;
  health_status: 'healthy' | 'warning' | 'critical';
  scanned_at: string;
  // joined from creatives
  creative_name?: string;
  creative_headline?: string;
  creative_image_url?: string;
  creative_type?: string;
}

export interface ComplianceViolation {
  id: string;
  violation_type: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  evidence: string | null;
  points_deducted: number;
}

export interface ComplianceRule {
  id: string;
  rule_type: string;
  value: string;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  is_active: boolean;
}

export interface ComplianceStats {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  paused: number;
}

// ============================================================
// useComplianceScores — lista paginada com join creatives
// ============================================================

export function useComplianceScores() {
  return useQuery<ComplianceScore[]>({
    queryKey: ['compliance-scores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_scores' as never)
        .select('id, company_id, creative_id, external_ad_id, copy_score, image_score, final_score, health_status, scanned_at')
        .order('scanned_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const scores = (data ?? []) as ComplianceScore[];

      // Fetch creative details
      if (scores.length > 0) {
        const creativeIds = [...new Set(scores.map((s) => s.creative_id))];
        const { data: creatives } = await supabase
          .from('creatives')
          .select('id, name, headline, image_url, type')
          .in('id', creativeIds);

        const creativeMap = new Map(
          (creatives ?? []).map((c) => [c.id, c]),
        );

        for (const score of scores) {
          const c = creativeMap.get(score.creative_id);
          if (c) {
            score.creative_name = c.name;
            score.creative_headline = c.headline;
            score.creative_image_url = c.image_url;
            score.creative_type = c.type;
          }
        }
      }

      return scores;
    },
    staleTime: 30_000,
  });
}

// ============================================================
// useComplianceViolations — violacoes de 1 anuncio
// ============================================================

export function useComplianceViolations(scoreId: string | null) {
  return useQuery<ComplianceViolation[]>({
    queryKey: ['compliance-violations', scoreId],
    queryFn: async () => {
      if (!scoreId) return [];
      const { data, error } = await supabase
        .from('compliance_violations' as never)
        .select('id, violation_type, severity, description, evidence, points_deducted')
        .eq('score_id', scoreId)
        .order('points_deducted', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComplianceViolation[];
    },
    enabled: !!scoreId,
    staleTime: 60_000,
  });
}

// ============================================================
// useComplianceRules — CRUD blacklist
// ============================================================

export function useComplianceRules() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery<ComplianceRule[]>({
    queryKey: ['compliance-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_rules' as never)
        .select('id, rule_type, value, severity, source, is_active')
        .in('rule_type', ['blacklist_term', 'required_term'])
        .order('severity', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComplianceRule[];
    },
    staleTime: 60_000,
  });

  const addRule = useMutation({
    mutationFn: async (rule: { value: string; severity: 'info' | 'warning' | 'critical'; ruleType?: string }) => {
      const { error } = await supabase
        .from('compliance_rules' as never)
        .insert({
          rule_type: rule.ruleType ?? 'blacklist_term',
          value: rule.value.toLowerCase().trim(),
          severity: rule.severity,
          source: 'user',
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
      toast({ title: 'Termo adicionado', description: 'Blacklist atualizada.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const removeRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from('compliance_rules' as never)
        .delete()
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
      toast({ title: 'Termo removido' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  return { rules: query.data ?? [], isLoading: query.isLoading, addRule, removeRule };
}

// ============================================================
// useComplianceScan — trigger manual
// ============================================================

export function useComplianceScan() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');

      const { data, error } = await supabase.functions.invoke('compliance-scan', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {},
      });
      if (error) throw error;
      return data as { status: string; stats: ComplianceStats & { errors?: string[] } };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-scores'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-stats'] });
      const s = data.stats;
      toast({
        title: 'Analise concluida',
        description: `${(s as any).ads_analyzed ?? s.total ?? 0} anuncios analisados. ${(s as any).ads_critical ?? s.critical ?? 0} criticos, ${(s as any).ads_paused ?? s.paused ?? 0} pausados.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro na analise', description: err.message, variant: 'destructive' });
    },
  });

  return { scan: () => mutation.mutate(), isScanning: mutation.isPending };
}

// ============================================================
// useComplianceStats — agregacao KPIs
// ============================================================

export function useComplianceStats() {
  return useQuery<ComplianceStats>({
    queryKey: ['compliance-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_scores' as never)
        .select('health_status');
      if (error) throw error;

      const rows = (data ?? []) as Array<{ health_status: string }>;
      const stats: ComplianceStats = { total: rows.length, healthy: 0, warning: 0, critical: 0, paused: 0 };
      for (const r of rows) {
        if (r.health_status === 'healthy') stats.healthy++;
        else if (r.health_status === 'warning') stats.warning++;
        else if (r.health_status === 'critical') stats.critical++;
      }

      // Count paused actions
      const { count } = await supabase
        .from('compliance_actions' as never)
        .select('id', { count: 'exact', head: true })
        .eq('action_type', 'auto_paused');
      stats.paused = count ?? 0;

      return stats;
    },
    staleTime: 30_000,
  });
}

// ============================================================
// useTakedownHistory — log de compliance_actions paginado
// ============================================================

export interface TakedownAction {
  id: string;
  action_type: string;
  external_ad_id: string | null;
  reason: string | null;
  performed_by: string;
  created_at: string;
  creative_name?: string;
  creative_image_url?: string;
  score_final?: number;
}

export function useTakedownHistory() {
  return useQuery<TakedownAction[]>({
    queryKey: ['takedown-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_actions' as never)
        .select('id, action_type, external_ad_id, reason, performed_by, created_at, creative_id, score_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      const actions = (data ?? []) as Array<TakedownAction & { creative_id?: string; score_id?: string }>;

      // Enrich with creative names + scores
      const creativeIds = [...new Set(actions.map((a) => a.creative_id).filter(Boolean))];
      const scoreIds = [...new Set(actions.map((a) => a.score_id).filter(Boolean))];

      const [creativesRes, scoresRes] = await Promise.all([
        creativeIds.length > 0
          ? supabase.from('creatives').select('id, name, image_url').in('id', creativeIds)
          : { data: [] },
        scoreIds.length > 0
          ? supabase.from('compliance_scores' as never).select('id, final_score').in('id', scoreIds)
          : { data: [] },
      ]);

      const creativeMap = new Map((creativesRes.data ?? []).map((c: { id: string; name: string; image_url: string }) => [c.id, c]));
      const scoreMap = new Map(((scoresRes.data ?? []) as Array<{ id: string; final_score: number }>).map((s) => [s.id, s]));

      return actions.map((a) => {
        const c = creativeMap.get(a.creative_id ?? '');
        const s = scoreMap.get(a.score_id ?? '');
        return {
          id: a.id,
          action_type: a.action_type,
          external_ad_id: a.external_ad_id,
          reason: a.reason,
          performed_by: a.performed_by,
          created_at: a.created_at,
          creative_name: (c as { name?: string })?.name ?? undefined,
          creative_image_url: (c as { image_url?: string })?.image_url ?? undefined,
          score_final: s?.final_score,
        };
      });
    },
    staleTime: 30_000,
  });
}

// ============================================================
// useReactivateAd — POST /{ad_id}?status=ACTIVE via meta-sync
// ============================================================

export function useReactivateAd() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ adId, creativeId }: { adId: string; creativeId?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');

      // Reactivate via direct function invoke
      const { data, error } = await supabase.functions.invoke('compliance-scan', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { reactivate_ad_id: adId, creative_id: creativeId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takedown-history'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-stats'] });
      toast({ title: 'Anuncio reativado', description: 'Status alterado para ACTIVE na Meta.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao reativar', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// useBrandGuide — brand_colors + brand_logo_url CRUD
// ============================================================

export interface BrandGuide {
  brand_colors: string[];
  brand_logo_url: string | null;
}

export function useBrandGuide() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery<BrandGuide>({
    queryKey: ['brand-guide'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('brand_colors, brand_logo_url')
        .single();
      if (error) throw error;
      return {
        brand_colors: (data?.brand_colors as string[] | null) ?? [],
        brand_logo_url: (data?.brand_logo_url as string | null) ?? null,
      };
    },
  });

  const update = useMutation({
    mutationFn: async (guide: Partial<BrandGuide>) => {
      // RLS garante que so a company do user autenticado e visivel
      const { data: co } = await supabase.from('companies').select('id').single();
      if (!co?.id) throw new Error('Empresa nao encontrada');
      const { error } = await supabase
        .from('companies')
        .update(guide as never)
        .eq('id', co.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-guide'] });
      toast({ title: 'Brand Guide salvo' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  return { brandGuide: query.data, isLoading: query.isLoading, updateBrandGuide: update };
}
