-- Migration: Fury Learning — pipeline-assets bucket + storage policies
-- Spec: .kiro/specs/fury-learning/
-- Task: T1.3
--
-- Bucket privado pra logos/watermarks/overlays usados pelo apply-creative-pipeline.
-- Path convention: <company_id>/<asset_id>.<ext>

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pipeline-assets',
  'pipeline-assets',
  false,
  5242880,  -- 5 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "pipeline_assets_storage_select" ON storage.objects;
CREATE POLICY "pipeline_assets_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'pipeline-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "pipeline_assets_storage_insert" ON storage.objects;
CREATE POLICY "pipeline_assets_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'pipeline-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "pipeline_assets_storage_update" ON storage.objects;
CREATE POLICY "pipeline_assets_storage_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'pipeline-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "pipeline_assets_storage_delete" ON storage.objects;
CREATE POLICY "pipeline_assets_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'pipeline-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );
