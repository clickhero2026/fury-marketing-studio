-- Migration: Fury Learning — core tables
-- Spec: .kiro/specs/fury-learning/
-- Task: T1.1
--
-- Cria 4 tabelas novas (creative_assets, behavior_rules, creative_pipeline_rules,
-- rule_proposal_events) e estende fury_rules + creatives com colunas opcionais.
-- ADITIVO. Nenhuma tabela existente perde colunas.

-- 1. Assets reusaveis (logos, watermarks, fonts)
CREATE TABLE IF NOT EXISTS public.creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('logo','watermark','overlay','font','other')),
  storage_path text NOT NULL,
  original_filename text,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/svg+xml')),
  width int,
  height int,
  parent_id uuid REFERENCES public.creative_assets(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creative_assets_company ON public.creative_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_creative_assets_type ON public.creative_assets(company_id, asset_type);

-- 2. Regras de comportamento (preferencias / system prompt)
CREATE TABLE IF NOT EXISTS public.behavior_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{"level":"global"}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  proposal_status text NOT NULL DEFAULT 'manual'
    CHECK (proposal_status IN ('pending','accepted','rejected','manual')),
  confidence numeric,
  learned_from_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  original_text text,
  last_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_behavior_rules_active ON public.behavior_rules(company_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_behavior_rules_message ON public.behavior_rules(learned_from_message_id);

-- 3. Regras de pipeline de criativo
CREATE TABLE IF NOT EXISTS public.creative_pipeline_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL,
  transform_type text NOT NULL
    CHECK (transform_type IN ('logo_overlay','caption','cta_text','font','color_filter','watermark','crop','custom')),
  transform_params jsonb NOT NULL,
  applies_to jsonb NOT NULL DEFAULT '{"media_types":["image"],"scope":{"level":"global"}}'::jsonb,
  priority int NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  proposal_status text NOT NULL DEFAULT 'manual'
    CHECK (proposal_status IN ('pending','accepted','rejected','manual')),
  confidence numeric,
  learned_from_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  original_text text,
  last_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_rules_active
  ON public.creative_pipeline_rules(company_id, is_enabled, priority);
CREATE INDEX IF NOT EXISTS idx_pipeline_rules_message
  ON public.creative_pipeline_rules(learned_from_message_id);

-- 4. Estender fury_rules (regras de acao existentes) com origem de aprendizado
ALTER TABLE public.fury_rules
  ADD COLUMN IF NOT EXISTS learned_from_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_text text,
  ADD COLUMN IF NOT EXISTS proposal_status text NOT NULL DEFAULT 'manual'
    CHECK (proposal_status IN ('pending','accepted','rejected','manual')),
  ADD COLUMN IF NOT EXISTS confidence numeric;

-- 5. Auditoria de aplicacao de regras em criativos
ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS pipeline_applied_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_source_path text;

-- 6. Telemetria de proposicoes
CREATE TABLE IF NOT EXISTS public.rule_proposal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('behavior','action','creative_pipeline')),
  action text NOT NULL CHECK (action IN ('proposed','accepted','rejected','edited')),
  rule_id uuid,
  confidence numeric,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposal_events_company
  ON public.rule_proposal_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_events_message
  ON public.rule_proposal_events(message_id);
