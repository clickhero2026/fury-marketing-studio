-- Migration: RPC pra atualizar status de proposed_rule em chat_messages
-- Spec: fury-learning
--
-- Problema: chat_messages nao tem policy de UPDATE pra clients (escrita
-- exclusiva via service_role no edge function ai-chat). useAcceptRuleProposal
-- e useRejectRuleProposal tentavam UPDATE direto via PostgREST e era
-- silenciosamente bloqueado pela RLS.
--
-- Solucao: RPC SECURITY DEFINER que valida ownership da conversation
-- e faz UPDATE controlado em metadata.proposed_rule.status.

CREATE OR REPLACE FUNCTION public.set_message_proposal_status(
  p_message_id uuid,
  p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation_id uuid;
  v_user_id uuid;
  v_metadata jsonb;
BEGIN
  IF p_new_status NOT IN ('pending', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT cm.conversation_id, cm.metadata
    INTO v_conversation_id, v_metadata
    FROM public.chat_messages cm
   WHERE cm.id = p_message_id;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'message not found' USING ERRCODE = '42704';
  END IF;

  -- Valida que a conversa pertence ao user atual
  SELECT cc.user_id INTO v_user_id
    FROM public.chat_conversations cc
   WHERE cc.id = v_conversation_id;

  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- Valida que existe um proposed_rule pra atualizar
  IF v_metadata IS NULL OR v_metadata->'proposed_rule' IS NULL THEN
    RAISE EXCEPTION 'no proposed_rule on message' USING ERRCODE = '22023';
  END IF;

  -- UPDATE jsonb mantendo todos os outros campos
  UPDATE public.chat_messages
     SET metadata = jsonb_set(
       metadata,
       '{proposed_rule,status}',
       to_jsonb(p_new_status),
       false
     )
   WHERE id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_message_proposal_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_message_proposal_status(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_message_proposal_status IS
  'Atualiza metadata.proposed_rule.status de uma chat_message. Valida ownership via chat_conversations.user_id = auth.uid(). Status validos: pending, accepted, rejected.';

-- =================== DEDUP CONSTRAINT ===================
-- Evita duplicar behavior_rules / creative_pipeline_rules / fury_rules
-- aprendidas da MESMA mensagem (caso user clique salvar 2x).
-- Unique parcial em (company_id, learned_from_message_id) WHERE NOT NULL.

CREATE UNIQUE INDEX IF NOT EXISTS behavior_rules_unique_per_message_uidx
  ON public.behavior_rules(company_id, learned_from_message_id)
  WHERE learned_from_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS creative_pipeline_rules_unique_per_message_uidx
  ON public.creative_pipeline_rules(company_id, learned_from_message_id)
  WHERE learned_from_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fury_rules_unique_per_message_uidx
  ON public.fury_rules(company_id, learned_from_message_id)
  WHERE learned_from_message_id IS NOT NULL;
