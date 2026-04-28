-- Migration: chat_messages adicionar coluna metadata jsonb
-- Spec: chat-multimodal + fury-learning
--
-- Ambas features assumiam que chat_messages tinha coluna metadata mas ela
-- nao existe. INSERTs com metadata estavam falhando silenciosamente:
--   - chat-multimodal: { attachments: [ids] } nao persistia em user msg
--   - fury-learning: { proposed_rule } nao persistia em assistant msg
-- Resultado: mensagens nao salvavam de jeito nenhum (PostgREST 400).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS chat_messages_metadata_proposed_rule_idx
  ON public.chat_messages ((metadata->>'proposed_rule'))
  WHERE metadata ? 'proposed_rule';

COMMENT ON COLUMN public.chat_messages.metadata IS
  'JSON livre. Usado por chat-multimodal (attachments[]) e fury-learning (proposed_rule). Pode ser NULL.';
