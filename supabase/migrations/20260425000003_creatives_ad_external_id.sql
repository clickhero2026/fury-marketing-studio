-- Migration: ad_external_id em creatives (hotfix preview)
-- Spec: as-built (extensao do meta-sync-dashboard)
--
-- A Meta Ad Preview API exige o ad_id (nao creative_id). Atualmente
-- creatives.external_id guarda creative.id. Adiciona ad_external_id pra
-- guardar tambem o ad.id (parent), que serve pra chamar
-- /{ad_id}/previews?ad_format=... e renderizar iframe do criativo no app.

ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS ad_external_id text;

CREATE INDEX IF NOT EXISTS creatives_ad_external_idx
  ON public.creatives(ad_external_id)
  WHERE ad_external_id IS NOT NULL;

COMMENT ON COLUMN public.creatives.ad_external_id IS 'Meta ad.id (parent do creative). Necessario pra Ad Preview API.';
