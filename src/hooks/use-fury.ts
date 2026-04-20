import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface FuryAction {
  id: string;
  campaign_name: string | null;
  campaign_external_id: string | null;
  rule_key: string;
  rule_display_name: string | null;
  action_type: 'pause' | 'alert' | 'suggest' | 'revert';
  status: 'pending' | 'executed' | 'reverted' | 'expired';
  metric_name: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  revert_before: string | null;
  created_at: string;
}

export interface FuryRule {
  id: string;
  rule_key: string;
  display_name: string;
  description: string | null;
  is_enabled: boolean;
  auto_execute: boolean;
  threshold_value: number;
  threshold_unit: string;
  consecutive_days: number;
  action_type: string;
}

export interface FuryStats {
  actionsToday: number;
  pendingAlerts: number;
  campaignsEvaluated: number;
  actionsExecuted: number;
}

// ============================================================
// useFuryActions — feed com refetchInterval 30s
// ============================================================

export function useFuryActions(filter?: string) {
  return useQuery<FuryAction[]>({
    queryKey: ['fury-actions', filter],
    queryFn: async () => {
      let query = supabase
        .from('fury_actions' as never)
        .select('id, campaign_name, campaign_external_id, rule_key, rule_display_name, action_type, status, metric_name, metric_value, threshold_value, revert_before, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter && filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FuryAction[];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ============================================================
// useFuryRules — CRUD
// ============================================================

export function useFuryRules() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery<FuryRule[]>({
    queryKey: ['fury-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fury_rules' as never)
        .select('id, rule_key, display_name, description, is_enabled, auto_execute, threshold_value, threshold_unit, consecutive_days, action_type')
        .order('rule_key');
      if (error) throw error;
      return (data ?? []) as FuryRule[];
    },
  });

  const updateRule = useMutation({
    mutationFn: async (update: { id: string; is_enabled?: boolean; auto_execute?: boolean; threshold_value?: number; consecutive_days?: number }) => {
      const { id, ...fields } = update;
      const { error } = await supabase
        .from('fury_rules' as never)
        .update({ ...fields, updated_at: new Date().toISOString() } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fury-rules'] });
      toast({ title: 'Regra atualizada' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  return { rules: query.data ?? [], isLoading: query.isLoading, updateRule };
}

// ============================================================
// useFuryEvaluate — trigger manual
// ============================================================

export function useFuryEvaluate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');
      const { data, error } = await supabase.functions.invoke('fury-evaluate', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {},
      });
      if (error) throw error;
      return data as { status: string; stats: FuryStats };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fury-actions'] });
      queryClient.invalidateQueries({ queryKey: ['fury-stats'] });
      const s = data.stats;
      toast({
        title: 'FURY avaliou',
        description: `${s.campaignsEvaluated ?? 0} campanhas, ${(s as any).rules_triggered ?? 0} regras disparadas, ${s.actionsExecuted ?? 0} acoes executadas.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro FURY', description: err.message, variant: 'destructive' });
    },
  });

  return { evaluate: () => mutation.mutate(), isEvaluating: mutation.isPending };
}

// ============================================================
// useFuryStats — KPIs
// ============================================================

export function useFuryStats() {
  return useQuery<FuryStats>({
    queryKey: ['fury-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      // Actions today
      const { data: todayActions } = await supabase
        .from('fury_actions' as never)
        .select('status')
        .gte('created_at', today);

      const actions = (todayActions ?? []) as Array<{ status: string }>;
      const actionsToday = actions.length;
      const pendingAlerts = actions.filter((a) => a.status === 'pending').length;
      const actionsExecuted = actions.filter((a) => a.status === 'executed').length;

      // Campaigns evaluated (last scan)
      const { data: lastScan } = await supabase
        .from('fury_scan_logs' as never)
        .select('campaigns_evaluated')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        actionsToday,
        pendingAlerts,
        campaignsEvaluated: (lastScan as { campaigns_evaluated?: number })?.campaigns_evaluated ?? 0,
        actionsExecuted,
      };
    },
    staleTime: 30_000,
  });
}

// ============================================================
// useFuryRevert — revert action
// ============================================================

export function useFuryRevert() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (actionId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');
      const { data, error } = await supabase.functions.invoke('fury-evaluate', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { revert_action_id: actionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fury-actions'] });
      queryClient.invalidateQueries({ queryKey: ['fury-stats'] });
      toast({ title: 'Acao revertida', description: 'Campanha reativada na Meta.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao reverter', description: err.message, variant: 'destructive' });
    },
  });
}
