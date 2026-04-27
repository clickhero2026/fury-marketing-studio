// Mutations para aceitar/rejeitar/editar propostas de regra do chat.
// Spec: .kiro/specs/fury-learning/ (T3.4, T3.5)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { ProposedRulePayload, ProposedRuleEnvelope, RuleType } from '@/types/fury-rules';

interface AcceptArgs {
  messageId: string;
  proposed: ProposedRulePayload;
  edited?: boolean;
}

interface RejectArgs {
  messageId: string;
  ruleType: RuleType;
}

async function updateMessageMetadata(messageId: string, envelope: ProposedRuleEnvelope) {
  const { error } = await supabase
    .from('chat_messages' as never)
    .update({ metadata: { proposed_rule: envelope } })
    .eq('id', messageId);
  if (error) throw error;
}

export function useAcceptRuleProposal() {
  const { company, user } = useAuth();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, proposed, edited }: AcceptArgs) => {
      if (!companyId) throw new Error('Sem empresa associada');

      const baseFields = {
        company_id: companyId,
        created_by: user?.id ?? null,
        name: proposed.name,
        description: proposed.description,
        scope: proposed.scope,
        proposal_status: 'accepted' as const,
        confidence: proposed.confidence,
        learned_from_message_id: messageId,
        original_text: proposed.reasoning,
        is_enabled: true,
      };

      let ruleId: string | null = null;

      if (proposed.rule_type === 'behavior') {
        const { data, error } = await supabase
          .from('behavior_rules' as never)
          .insert(baseFields as never)
          .select('id')
          .single();
        if (error) throw error;
        ruleId = (data as { id: string }).id;
      } else if (proposed.rule_type === 'creative_pipeline') {
        const transformType = proposed.transform?.transform_type ?? 'custom';
        const { data, error } = await supabase
          .from('creative_pipeline_rules' as never)
          .insert({
            ...baseFields,
            transform_type: transformType,
            transform_params: proposed.transform?.params ?? {},
            applies_to: { media_types: ['image'], scope: proposed.scope },
            priority: 100,
          } as never)
          .select('id')
          .single();
        if (error) throw error;
        ruleId = (data as { id: string }).id;
      } else if (proposed.rule_type === 'action') {
        // fury_rules tem schema diferente
        const trig = proposed.trigger ?? {};
        const act = proposed.action ?? {};
        const { data, error } = await supabase
          .from('fury_rules' as never)
          .insert({
            company_id: companyId,
            display_name: proposed.name,
            description: proposed.description,
            rule_key: `learned_${Date.now()}`,
            action_type: act.type ?? 'alert',
            threshold_value: trig.value ?? 0,
            threshold_unit: trig.metric ?? 'cpl',
            consecutive_days: trig.consecutive_days ?? 1,
            auto_execute: act.type === 'pause',
            is_enabled: true,
            proposal_status: 'accepted',
            confidence: proposed.confidence,
            learned_from_message_id: messageId,
            original_text: proposed.reasoning,
          } as never)
          .select('id')
          .single();
        if (error) throw error;
        ruleId = (data as { id: string }).id;
      }

      // UPDATE mensagem -> status accepted
      await updateMessageMetadata(messageId, {
        proposed_rule: proposed,
        status: 'accepted',
        rule_type: proposed.rule_type,
        confidence: proposed.confidence,
      });

      // Telemetria
      await supabase.from('rule_proposal_events' as never).insert({
        company_id: companyId,
        user_id: user?.id ?? null,
        message_id: messageId,
        rule_type: proposed.rule_type,
        action: edited ? 'edited' : 'accepted',
        rule_id: ruleId,
        confidence: proposed.confidence,
      } as never);

      return { ruleId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fury-rules'] });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}

export function useRejectRuleProposal() {
  const { company, user } = useAuth();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, ruleType }: RejectArgs & { proposed?: ProposedRulePayload }) => {
      if (!companyId) throw new Error('Sem empresa associada');

      // Lemos a mensagem pra preservar o proposed_rule original
      const { data: msg } = await supabase
        .from('chat_messages' as never)
        .select('metadata')
        .eq('id', messageId)
        .maybeSingle();
      const meta = (msg as { metadata?: { proposed_rule?: ProposedRuleEnvelope } } | null)?.metadata;
      const existing = meta?.proposed_rule;

      if (existing?.proposed_rule) {
        await updateMessageMetadata(messageId, {
          proposed_rule: existing.proposed_rule,
          status: 'rejected',
          rule_type: existing.rule_type,
          confidence: existing.confidence,
        });
      }

      await supabase.from('rule_proposal_events' as never).insert({
        company_id: companyId,
        user_id: user?.id ?? null,
        message_id: messageId,
        rule_type: ruleType,
        action: 'rejected',
        confidence: existing?.confidence ?? null,
      } as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}
