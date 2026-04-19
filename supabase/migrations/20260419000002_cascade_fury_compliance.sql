-- Adicionar ON DELETE CASCADE nas FKs de fury_* e compliance_*
-- Motivo: permitir disconnect completo da integration sem FK violation
-- (campaigns/creatives tem ON DELETE CASCADE de integrations, mas fury/compliance
-- apontavam pra campaigns/creatives sem cascade, travando o DELETE em cascata)

-- 1. fury_evaluations.campaign_id → campaigns.id
ALTER TABLE fury_evaluations DROP CONSTRAINT IF EXISTS fury_evaluations_campaign_id_fkey;
ALTER TABLE fury_evaluations
  ADD CONSTRAINT fury_evaluations_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- 2. fury_actions.campaign_id → campaigns.id
ALTER TABLE fury_actions DROP CONSTRAINT IF EXISTS fury_actions_campaign_id_fkey;
ALTER TABLE fury_actions
  ADD CONSTRAINT fury_actions_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- 3. compliance_scores.creative_id → creatives.id
ALTER TABLE compliance_scores DROP CONSTRAINT IF EXISTS compliance_scores_creative_id_fkey;
ALTER TABLE compliance_scores
  ADD CONSTRAINT compliance_scores_creative_id_fkey
  FOREIGN KEY (creative_id) REFERENCES creatives(id) ON DELETE CASCADE;

-- 4. compliance_violations.creative_id → creatives.id
ALTER TABLE compliance_violations DROP CONSTRAINT IF EXISTS compliance_violations_creative_id_fkey;
ALTER TABLE compliance_violations
  ADD CONSTRAINT compliance_violations_creative_id_fkey
  FOREIGN KEY (creative_id) REFERENCES creatives(id) ON DELETE CASCADE;

-- 5. compliance_actions.creative_id → creatives.id
ALTER TABLE compliance_actions DROP CONSTRAINT IF EXISTS compliance_actions_creative_id_fkey;
ALTER TABLE compliance_actions
  ADD CONSTRAINT compliance_actions_creative_id_fkey
  FOREIGN KEY (creative_id) REFERENCES creatives(id) ON DELETE CASCADE;
