-- Migration: HITL Approvals Queue
-- Spec: .kiro/specs/multi-agent-foundation/ (Sprint A1)
-- Padroes seguidos:
--   - company_id (nao organization_id) por consistencia com restantes business tables
--   - RLS via current_user_company_id() helper
--   - Trigger auto_set_company_id_on_insert
--   - Realtime publication

CREATE TABLE IF NOT EXISTS public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Origem (de onde veio a sugestao da acao)
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  requested_by_agent text NOT NULL DEFAULT 'ai-chat',

  -- O que sera executado se aprovado
  action_type text NOT NULL CHECK (action_type IN (
    'pause_campaign',
    'reactivate_campaign',
    'update_budget'
  )),
  payload jsonb NOT NULL,                 -- {campaign_id, campaign_external_id, campaign_name, ...}
  human_summary text NOT NULL,            -- texto curto pra UI: "Pausar campanha 'Black Friday Promo'"

  -- Estado
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'expired',
    'executed',
    'failed'
  )),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),

  -- Quem decidiu
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,

  -- Resultado da execucao (se approved)
  executed_at timestamptz,
  execution_result jsonb,
  execution_error text,

  -- Auditoria
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approvals_company_status_idx
  ON public.approvals(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS approvals_pending_expires_idx
  ON public.approvals(expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS approvals_conversation_idx
  ON public.approvals(conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

-- Updated_at trigger (segue padrao do projeto)
CREATE OR REPLACE FUNCTION public.set_approvals_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approvals_set_updated_at ON public.approvals;
CREATE TRIGGER approvals_set_updated_at
  BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_approvals_updated_at();

-- Auto-set company_id no insert (usa helper existente set_company_id_on_insert)
DROP TRIGGER IF EXISTS auto_set_company_id_approvals ON public.approvals;
CREATE TRIGGER auto_set_company_id_approvals
  BEFORE INSERT ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- RLS
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approvals_select" ON public.approvals;
CREATE POLICY "approvals_select" ON public.approvals
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "approvals_insert" ON public.approvals;
CREATE POLICY "approvals_insert" ON public.approvals
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "approvals_update" ON public.approvals;
CREATE POLICY "approvals_update" ON public.approvals
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

-- Realtime publication (pra ApprovalsView via Realtime channel)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.approvals;
  END IF;
END $$;

COMMENT ON TABLE public.approvals IS 'HITL approval queue para acoes destrutivas sugeridas pelo AI Chat. Usuario aprova/rejeita via ApprovalsView. Approvals pending expiram em 5min.';
