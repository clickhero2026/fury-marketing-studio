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
        .eq('rule_type', 'blacklist_term')
        .order('severity', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComplianceRule[];
    },
    staleTime: 60_000,
  });

  const addRule = useMutation({
    mutationFn: async (rule: { value: string; severity: 'info' | 'warning' | 'critical' }) => {
      const { error } = await supabase
        .from('compliance_rules' as never)
        .insert({
          rule_type: 'blacklist_term',
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
        description: `${s.ads_analyzed ?? 0} anuncios analisados. ${s.ads_critical ?? 0} criticos, ${s.ads_paused ?? 0} pausados.`,
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
