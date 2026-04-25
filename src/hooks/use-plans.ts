import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Approval } from '@/hooks/use-approvals';

export type PlanStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'partial'
  | 'failed';

export interface Plan {
  id: string;
  company_id: string;
  conversation_id: string | null;
  message_id: string | null;
  requested_by_agent: string;
  human_summary: string;
  rationale: string | null;
  status: PlanStatus;
  expires_at: string;
  decided_by: string | null;
  decided_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanWithSteps extends Plan {
  steps: Approval[];
}

export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [steps, setSteps] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const [{ data: planRows }, { data: stepRows }] = await Promise.all([
      supabase
        .from('plans' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('approvals' as never)
        .select('*')
        .not('plan_id', 'is', null)
        .order('plan_step_order', { ascending: true }),
    ]);
    setPlans((planRows as unknown as Plan[]) ?? []);
    setSteps((stepRows as unknown as Approval[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('plans-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plans' },
        () => {
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const decide = useCallback(
    async (planId: string, decision: 'approve' | 'reject') => {
      setDecidingId(planId);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Nao autenticado');

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey =
          (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
          (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

        const res = await fetch(`${supabaseUrl}/functions/v1/plan-action`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan_id: planId, decision }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

        const planStatus = body.status as PlanStatus;
        const isFullSuccess = planStatus === 'executed' || planStatus === 'rejected';
        const isPartial = planStatus === 'partial';

        toast({
          title: decision === 'approve' ? 'Plano aprovado' : 'Plano rejeitado',
          description: isPartial
            ? `${body.executed}/${body.total} executadas, ${body.failed} falharam`
            : decision === 'approve'
              ? planStatus === 'executed'
                ? `${body.total} acoes executadas com sucesso`
                : 'Falhou na execucao'
              : `${body.steps_count} acoes canceladas`,
          variant: isFullSuccess ? 'default' : 'destructive',
        });
        await load();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        toast({ title: 'Erro ao decidir plano', description: msg, variant: 'destructive' });
      } finally {
        setDecidingId(null);
      }
    },
    [toast, load]
  );

  // Combina plan + steps
  const plansWithSteps: PlanWithSteps[] = plans.map((p) => ({
    ...p,
    steps: steps.filter((s) => s.plan_id === p.id),
  }));

  const pending = plansWithSteps.filter((p) => p.status === 'pending');
  const history = plansWithSteps.filter((p) => p.status !== 'pending');

  return {
    plans: plansWithSteps,
    pending,
    history,
    isLoading,
    decidingId,
    decide,
  };
}
