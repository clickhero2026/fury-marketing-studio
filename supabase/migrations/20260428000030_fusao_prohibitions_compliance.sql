-- Migration: fusao company_prohibitions -> compliance_rules
-- User flagou duplicacao: 2 tabelas com mesmo proposito (lista de termos
-- proibidos). Solucao: compliance_rules vira canonica; company_prohibitions
-- vira espelho via trigger bidirecional pra evitar drift.

-- 1. Adiciona coluna category em compliance_rules pra preservar semantica
ALTER TABLE public.compliance_rules
  ADD COLUMN IF NOT EXISTS category text
  CHECK (category IS NULL OR category IN ('word', 'topic', 'visual'));

CREATE INDEX IF NOT EXISTS idx_compliance_rules_category
  ON public.compliance_rules(company_id, category)
  WHERE category IS NOT NULL;

-- 2. Backfill: company_prohibitions (source='user') -> compliance_rules
INSERT INTO public.compliance_rules
  (company_id, rule_type, value, severity, is_active, source, category, created_at, updated_at)
SELECT
  cp.company_id,
  CASE WHEN cp.category = 'visual' THEN 'custom' ELSE 'blacklist_term' END AS rule_type,
  cp.value,
  'warning' AS severity,
  true AS is_active,
  CASE WHEN cp.source = 'vertical_default' THEN 'vertical_default' ELSE 'user' END AS source,
  cp.category,
  cp.created_at,
  cp.created_at
FROM public.company_prohibitions cp
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_rules cr
   WHERE cr.company_id = cp.company_id
     AND cr.value = cp.value
     AND COALESCE(cr.category, '') = COALESCE(cp.category, '')
);

-- 3. Trigger: INSERT em company_prohibitions -> espelha em compliance_rules
CREATE OR REPLACE FUNCTION public.sync_prohibition_to_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Insere se nao existir (idempotente)
  INSERT INTO public.compliance_rules
    (company_id, rule_type, value, severity, is_active, source, category)
  VALUES (
    NEW.company_id,
    CASE WHEN NEW.category = 'visual' THEN 'custom' ELSE 'blacklist_term' END,
    NEW.value,
    'warning',
    true,
    CASE WHEN NEW.source = 'vertical_default' THEN 'vertical_default' ELSE 'user' END,
    NEW.category
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_prohibition_to_rule_trigger ON public.company_prohibitions;
CREATE TRIGGER sync_prohibition_to_rule_trigger
  AFTER INSERT ON public.company_prohibitions
  FOR EACH ROW EXECUTE FUNCTION public.sync_prohibition_to_rule();

-- 4. Trigger inverso: DELETE em compliance_rules -> apaga em prohibitions
CREATE OR REPLACE FUNCTION public.sync_rule_delete_to_prohibition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.company_prohibitions
   WHERE company_id = OLD.company_id
     AND value = OLD.value
     AND COALESCE(category, '') = COALESCE(OLD.category, '');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_rule_delete_to_prohibition_trigger ON public.compliance_rules;
CREATE TRIGGER sync_rule_delete_to_prohibition_trigger
  AFTER DELETE ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.sync_rule_delete_to_prohibition();

-- 5. Trigger: DELETE em company_prohibitions -> apaga em compliance_rules
CREATE OR REPLACE FUNCTION public.sync_prohibition_delete_to_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.compliance_rules
   WHERE company_id = OLD.company_id
     AND value = OLD.value
     AND COALESCE(category, '') = COALESCE(OLD.category, '')
     AND source IN ('user', 'vertical_default')
     AND rule_type IN ('blacklist_term', 'custom');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_prohibition_delete_to_rule_trigger ON public.company_prohibitions;
CREATE TRIGGER sync_prohibition_delete_to_rule_trigger
  AFTER DELETE ON public.company_prohibitions
  FOR EACH ROW EXECUTE FUNCTION public.sync_prohibition_delete_to_rule();

-- 6. Trigger inverso: INSERT em compliance_rules (rule_type=blacklist_term) -> espelha em prohibitions
CREATE OR REPLACE FUNCTION public.sync_rule_to_prohibition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- So sincroniza se for user-editavel (nao meta_default)
  IF NEW.source NOT IN ('user', 'vertical_default') THEN
    RETURN NEW;
  END IF;
  IF NEW.rule_type NOT IN ('blacklist_term', 'custom') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.company_prohibitions
    (company_id, category, value, source)
  VALUES (
    NEW.company_id,
    COALESCE(NEW.category, CASE WHEN NEW.rule_type = 'custom' THEN 'visual' ELSE 'word' END),
    NEW.value,
    CASE WHEN NEW.source = 'vertical_default' THEN 'vertical_default' ELSE 'user' END
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_rule_to_prohibition_trigger ON public.compliance_rules;
CREATE TRIGGER sync_rule_to_prohibition_trigger
  AFTER INSERT ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.sync_rule_to_prohibition();

COMMENT ON COLUMN public.compliance_rules.category IS
  'Categoria semantica (word/topic/visual) — copiada de company_prohibitions na fusao 2026-04-28.';
