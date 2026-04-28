-- Bump quota do plano 'free' enquanto nao temos billing/upgrade na UI.
-- Sem essa mudanca usuarios novos batiam $2/mes muito rapido (1 GPT-image
-- ~$0.20, 10 imagens ja consumiam tudo) — frustrante na fase de validacao.
-- Reverter quando billing real estiver conectado.

UPDATE public.creative_plan_quotas
SET creatives_per_day_max = 20,
    creatives_per_month_max = 100,
    cost_usd_per_month_max = 20.00
WHERE plan = 'free';
