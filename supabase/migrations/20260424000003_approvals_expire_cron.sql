-- Migration: Auto-expire pending approvals (Sprint A4)
-- Spec: .kiro/specs/multi-agent-foundation/
--
-- Habilita pg_cron (se necessario) e agenda job que marca approvals com
-- status='pending' e expires_at < now() como 'expired'. Roda a cada minuto.
--
-- Sem isso, approvals expirados ficam orfaos no DB (UI ja mostra "Expirado"
-- no countdown mas o status nao atualiza).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Job idempotente: cron.schedule lanca conflito se ja existir com mesmo nome.
-- Removemos antes de re-criar para permitir re-run da migration.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-approvals') THEN
    PERFORM cron.unschedule('expire-pending-approvals');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-pending-approvals',
  '* * * * *',  -- a cada minuto
  $$
    UPDATE public.approvals
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < now()
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Job scheduler nativo do Postgres. Usado pra expirar approvals pendentes e (futuramente) outros tasks recorrentes.';
