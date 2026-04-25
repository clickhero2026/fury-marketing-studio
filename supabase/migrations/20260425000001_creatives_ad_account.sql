-- Migration: creatives ganha ad_account_id (Sprint hotfix)
-- Spec: as-built (extensao do meta-sync-dashboard)
--
-- Problema: tabela `creatives` nao guardava qual ad account originou cada
-- criativo. Quando user trocava selecao de contas no asset picker, criativos
-- antigos ficavam orfaos no DB sem forma facil de filtrar/limpar.
--
-- Fix: adicionar coluna ad_account_id (text, ex: "act_1234567890") + index.
-- Sync passa a popular. UI passa a filtrar. Cleanup retroativo via JOIN
-- com campaigns.account.

ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Backfill: pega de campaigns.account quando possivel
UPDATE public.creatives cr
SET ad_account_id = c.account
FROM public.campaigns c
WHERE cr.campaign_id = c.id
  AND cr.ad_account_id IS NULL
  AND c.account IS NOT NULL;

CREATE INDEX IF NOT EXISTS creatives_ad_account_idx
  ON public.creatives(company_id, ad_account_id)
  WHERE ad_account_id IS NOT NULL;

COMMENT ON COLUMN public.creatives.ad_account_id IS 'Meta ad account id no formato act_XXXXX. Permite filtrar criativos por conta selecionada.';
