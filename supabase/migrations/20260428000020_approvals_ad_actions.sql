-- Migration: aprovacoes ganham action_types pause_ad / reactivate_ad
-- Spec: continuacao das tools do chat (controle granular)
--
-- Drop+recria do CHECK (Postgres nao tem ALTER CHECK direto).

ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS approvals_action_type_check;
ALTER TABLE public.approvals ADD CONSTRAINT approvals_action_type_check
  CHECK (action_type IN (
    'pause_campaign',
    'reactivate_campaign',
    'update_budget',
    'pause_ad',
    'reactivate_ad'
  ));
