-- Migration: Multi-step Plan Mode (Sprint B2)
-- Spec: .kiro/specs/multi-agent-foundation/ (Sprint B2 — fast-track AS-BUILT)
--
-- Quando IA propoe N acoes destrutivas (ex: pausar 3 campanhas + ajustar budget),
-- agrupa num unico "plano" aprovado em batch (uma decisao -> N execucoes).

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  requested_by_agent text NOT NULL DEFAULT 'ai-chat',

  human_summary text NOT NULL,
  rationale text,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'expired',
    'executed',
    'partial',
    'failed'
  )),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),

  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  executed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE;

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS plan_step_order integer;

CREATE INDEX IF NOT EXISTS approvals_plan_id_idx
  ON public.approvals(plan_id, plan_step_order)
  WHERE plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plans_company_status_idx
  ON public.plans(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS plans_pending_expires_idx
  ON public.plans(expires_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.set_plans_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_set_updated_at ON public.plans;
CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_plans_updated_at();

DROP TRIGGER IF EXISTS auto_set_company_id_plans ON public.plans;
CREATE TRIGGER auto_set_company_id_plans
  BEFORE INSERT ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_select" ON public.plans;
CREATE POLICY "plans_select" ON public.plans
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "plans_insert" ON public.plans;
CREATE POLICY "plans_insert" ON public.plans
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "plans_update" ON public.plans;
CREATE POLICY "plans_update" ON public.plans
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plans;
  END IF;
END $$;

-- Cron: expirar plans pendentes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-plans') THEN
    PERFORM cron.unschedule('expire-pending-plans');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-pending-plans',
  '* * * * *',
  $$
    UPDATE public.plans
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < now()
  $$
);

COMMENT ON TABLE public.plans IS 'Multi-step plans (B2): IA agrupa N acoes destrutivas. Aprovacao em batch dispara execucao sequencial dos approvals filhos.';
