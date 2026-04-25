// B4: Approval/plan actions vinculadas a uma conversation.
// Combina use-approvals + use-plans filtrando por conversation_id, expoe
// pendentes pra renderizar botoes inline no chat.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Approval } from '@/hooks/use-approvals';
import type { Plan, PlanWithSteps } from '@/hooks/use-plans';

export function useConversationActions(conversationId: string | null) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planSteps, setPlanSteps] = useState<Approval[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!conversationId) {
      setApprovals([]);
      setPlans([]);
      setPlanSteps([]);
      return;
    }
    const [{ data: appData }, { data: planData }] = await Promise.all([
      supabase
        .from('approvals' as never)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
      supabase
        .from('plans' as never)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
    ]);
    const allApprovals = (appData as unknown as Approval[]) ?? [];
    setApprovals(allApprovals.filter((a) => a.plan_id == null));
    setPlanSteps(allApprovals.filter((a) => a.plan_id != null));
    setPlans((planData as unknown as Plan[]) ?? []);
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refetch quando approvals/plans mudam
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conv-actions-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals', filter: `conversation_id=eq.${conversationId}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plans', filter: `conversation_id=eq.${conversationId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  const decideApproval = useCallback(
    async (approvalId: string, decision: 'approve' | 'reject') => {
      setDecidingId(approvalId);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Nao autenticado');
        const url = import.meta.env.VITE_SUPABASE_URL as string;
        const apikey =
          (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
          (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
        const res = await fetch(`${url}/functions/v1/approval-action`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ approval_id: approvalId, decision }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

        const hasExecError = decision === 'approve' && !!body.error;
        toast({
          title: hasExecError ? 'Falhou ao executar' : decision === 'approve' ? 'Aprovado' : 'Rejeitado',
          description: hasExecError
            ? String(body.error).substring(0, 200)
            : decision === 'approve'
              ? 'Acao executada com sucesso'
              : 'Acao cancelada',
          variant: hasExecError ? 'destructive' : 'default',
        });
        await load();
      } catch (err) {
        toast({
          title: 'Erro',
          description: err instanceof Error ? err.message : 'Falha',
          variant: 'destructive',
        });
      } finally {
        setDecidingId(null);
      }
    },
    [toast, load]
  );

  const decidePlan = useCallback(
    async (planId: string, decision: 'approve' | 'reject') => {
      setDecidingId(planId);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Nao autenticado');
        const url = import.meta.env.VITE_SUPABASE_URL as string;
        const apikey =
          (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
          (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
        const res = await fetch(`${url}/functions/v1/plan-action`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan_id: planId, decision }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

        const planStatus = body.status as string;
        const isPartial = planStatus === 'partial';
        const isOk = planStatus === 'executed' || planStatus === 'rejected';

        toast({
          title: decision === 'approve' ? 'Plano executado' : 'Plano rejeitado',
          description: isPartial
            ? `${body.executed}/${body.total} executadas, ${body.failed} falharam`
            : isOk
              ? decision === 'approve'
                ? `${body.total} acoes executadas`
                : 'Acoes canceladas'
              : 'Falhou',
          variant: isOk ? 'default' : 'destructive',
        });
        await load();
      } catch (err) {
        toast({
          title: 'Erro',
          description: err instanceof Error ? err.message : 'Falha',
          variant: 'destructive',
        });
      } finally {
        setDecidingId(null);
      }
    },
    [toast, load]
  );

  const plansWithSteps: PlanWithSteps[] = plans.map((p) => ({
    ...p,
    steps: planSteps.filter((s) => s.plan_id === p.id),
  }));

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const pendingPlans = plansWithSteps.filter((p) => p.status === 'pending');

  return {
    approvals,
    plans: plansWithSteps,
    pendingApprovals,
    pendingPlans,
    decidingId,
    decideApproval,
    decidePlan,
  };
}
