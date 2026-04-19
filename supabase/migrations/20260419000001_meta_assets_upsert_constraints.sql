-- Unique constraints para permitir upsert nos ativos Meta selecionaveis
-- Necessario pro MetaAssetPicker (meta-save-assets usa onConflict)

-- 1. Dedup antes de adicionar constraint (caso tenha duplicatas historicas)
WITH dup_accounts AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, account_id ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
  FROM meta_ad_accounts
)
DELETE FROM meta_ad_accounts WHERE id IN (SELECT id FROM dup_accounts WHERE rn > 1);

WITH dup_pages AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, page_id ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
  FROM meta_pages
)
DELETE FROM meta_pages WHERE id IN (SELECT id FROM dup_pages WHERE rn > 1);

-- 2. Adicionar UNIQUE constraints
DO $$ BEGIN
  ALTER TABLE meta_ad_accounts ADD CONSTRAINT meta_ad_accounts_company_account_uniq UNIQUE (company_id, account_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE meta_pages ADD CONSTRAINT meta_pages_company_page_uniq UNIQUE (company_id, page_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- meta_business_managers ja tem UNIQUE (external_id, company_id) da deep-scan migration
