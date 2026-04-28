import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed';

export type ApprovalActionType = 'pause_campaign' | 'reactivate_campaign' | 'update_budget' | 'pause_ad' | 'reactivate_ad';

export interface Approval {
  id: string;
  company_id: string;
  conversation_id: string | null;
  message_id: string | null;
  requested_by_agent: string;
  action_type: ApprovalActionType;
  payload: Record<string, unknown>;
  human_summary: string;
  status: ApprovalStatus;
  expires_at: string;
  decided_by: string | null;
  decided_at: string | null;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  execution_error: string | null;
  plan_id: string | null;
  plan_step_order: number | null;
  created_at: string;
  updated_at: string;
}

export function useApprovals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Apenas approvals AVULSOS (sem plan_id) — os com plan_id sao renderizados
      // dentro do PlanCard via use-plans.
      const { data, error } = await supabase
        .from('approvals' as never)
        .select('*')
        .is('plan_id', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!mounted) return;
      if (error) {
        console.error('[useApprovals] load error:', error);
      } else if (data) {
        setApprovals(data as unknown as Approval[]);
      }
      setIsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('approvals-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals' },
        (payload) => {
          // Ignorar eventos de approvals com plan_id (esses sao geridos por use-plans)
          const newRow = payload.new as Approval | undefined;
          const oldRow = payload.old as Approval | undefined;
          if (payload.eventType === 'INSERT' && newRow?.plan_id == null) {
            setApprovals((prev) => [newRow, ...prev]);
          } else if (payload.eventType === 'UPDATE' && newRow?.plan_id == null) {
            setApprovals((prev) =>
              prev.map((a) => (a.id === newRow.id ? newRow : a))
            );
          } else if (payload.eventType === 'DELETE' && oldRow?.plan_id == null) {
            setApprovals((prev) => prev.filter((a) => a.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const decide = useCallback(
    async (approvalId: string, decision: 'approve' | 'reject') => {
      setDecidingId(approvalId);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Nao autenticado');

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey =
          (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
          (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

        const res = await fetch(`${supabaseUrl}/functions/v1/approval-action`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ approval_id: approvalId, decision }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }

        const hasExecError = decision === 'approve' && !!body.error;
        toast({
          title: hasExecError
            ? 'Aprovado mas falhou'
            : decision === 'approve'
              ? 'Acao aprovada'
              : 'Acao rejeitada',
          description: hasExecError
            ? String(body.error).substring(0, 200)
            : decision === 'approve'
              ? 'Executada com sucesso'
              : 'Acao cancelada',
          variant: hasExecError ? 'destructive' : 'default',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        toast({
          title: 'Erro ao decidir',
          description: msg,
          variant: 'destructive',
        });
      } finally {
        setDecidingId(null);
      }
    },
    [toast]
  );

  const pending = approvals.filter((a) => a.status === 'pending');
  const history = approvals.filter((a) => a.status !== 'pending');

  return {
    approvals,
    pending,
    history,
    isLoading,
    decidingId,
    decide,
  };
}
