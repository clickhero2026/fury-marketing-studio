// Tipos do dominio fury-learning.
// Spec: .kiro/specs/fury-learning/

export type RuleType = 'behavior' | 'action' | 'creative_pipeline';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'manual';
export type ScopeLevel = 'global' | 'campaign' | 'adset' | 'creative' | 'ad_account';

export interface RuleScope {
  level: ScopeLevel;
  id?: string;
}

export interface BehaviorRule {
  id: string;
  company_id: string;
  name: string;
  description: string;
  scope: RuleScope;
  is_enabled: boolean;
  proposal_status: ProposalStatus;
  confidence: number | null;
  learned_from_message_id: string | null;
  original_text: string | null;
  last_applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PipelineTransformType =
  | 'logo_overlay'
  | 'caption'
  | 'cta_text'
  | 'font'
  | 'color_filter'
  | 'watermark'
  | 'crop'
  | 'custom';

export interface LogoOverlayParams {
  asset_id?: string;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
  padding_pct?: number;
  opacity?: number;
  max_size_pct?: number;
}

export interface CreativePipelineRule {
  id: string;
  company_id: string;
  name: string;
  description: string;
  transform_type: PipelineTransformType;
  transform_params: Record<string, unknown>;
  applies_to: { media_types?: string[]; scope?: RuleScope };
  priority: number;
  is_enabled: boolean;
  proposal_status: ProposalStatus;
  confidence: number | null;
  learned_from_message_id: string | null;
  original_text: string | null;
  last_applied_at: string | null;
  created_at: string;
  updated_at: string;
}

// fury_rules existente — atributos de regras de acao
export interface ActionRule {
  id: string;
  company_id: string;
  rule_key: string;
  display_name: string;
  description: string | null;
  action_type: string;
  threshold_value: number;
  threshold_unit: string;
  consecutive_days: number;
  auto_execute: boolean | null;
  is_enabled: boolean | null;
  proposal_status?: ProposalStatus;
  confidence?: number | null;
  learned_from_message_id?: string | null;
  original_text?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Proposed rule (vinda do tool propose_rule, persistida em chat_messages.metadata)
export interface ProposedRulePayload {
  rule_type: RuleType;
  confidence: number;
  name: string;
  description: string;
  scope: RuleScope;
  reasoning: string;
  trigger?: {
    metric?: string;
    operator?: '>' | '>=' | '<' | '<=' | '==';
    value?: number;
    window_days?: number;
    consecutive_days?: number;
  };
  action?: { type?: 'pause' | 'alert' | 'suggest'; params?: Record<string, unknown> };
  transform?: { transform_type?: PipelineTransformType; params?: Record<string, unknown> };
}

export interface ProposedRuleEnvelope {
  proposed_rule: ProposedRulePayload;
  status: 'pending' | 'accepted' | 'rejected';
  rule_type: RuleType;
  confidence: number;
}

// Labels PT-BR
export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  behavior: 'Comportamento',
  action: 'Acao automatica',
  creative_pipeline: 'Pipeline de criativo',
};

export const SCOPE_LEVEL_LABELS: Record<ScopeLevel, string> = {
  global: 'Global',
  campaign: 'Campanha',
  adset: 'Adset',
  creative: 'Criativo',
  ad_account: 'Conta de anuncios',
};

export const TRANSFORM_TYPE_LABELS: Record<PipelineTransformType, string> = {
  logo_overlay: 'Logo sobreposta',
  caption: 'Legenda',
  cta_text: 'CTA texto',
  font: 'Fonte',
  color_filter: 'Filtro de cor',
  watermark: 'Marca d\'agua',
  crop: 'Crop',
  custom: 'Custom',
};
