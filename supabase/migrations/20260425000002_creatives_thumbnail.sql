-- Migration: thumbnail + video_id em creatives (hotfix)
-- Spec: as-built (extensao do meta-sync-dashboard)
--
-- Cards de criativo viam <ImagePlus/VideoIcon> placeholder porque o sync nao
-- guardava thumbnail (so image_url, que costuma vir null pra videos). Adiciona
-- colunas e o sync passa a popular.

ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS video_id text,
  ADD COLUMN IF NOT EXISTS effective_object_story_id text;

COMMENT ON COLUMN public.creatives.thumbnail_url IS 'URL do thumbnail (cobertura) — para video usa preview frame; para imagem dinamica usa fallback.';
COMMENT ON COLUMN public.creatives.video_id IS 'Meta video ID (creative.video_id). Usado para fetch de source/preview.';
COMMENT ON COLUMN public.creatives.effective_object_story_id IS 'Post ID do anuncio (formato: page_id_post_id) — usado para embed/preview via FB plugins.';
