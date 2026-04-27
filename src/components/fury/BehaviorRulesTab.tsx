// Tab: regras de comportamento (preferencias persistidas no system prompt).
// Spec: .kiro/specs/fury-learning/ (T5.3)

import { Sparkles } from 'lucide-react';
import { useActiveRules } from '@/hooks/useActiveRules';
import { RuleListItem } from './RuleListItem';

export function BehaviorRulesTab() {
  const { behavior, isLoading } = useActiveRules();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando...</div>;
  }
  if (!behavior.length) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
        <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        Sem regras de comportamento ainda. Diga ao Fury algo como "sempre responda em pt-BR formal" no chat.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {behavior.length} regra{behavior.length === 1 ? '' : 's'} de comportamento
      </div>
      {behavior.map((rule) => (
        <RuleListItem
          key={rule.id}
          table="behavior_rules"
          id={rule.id}
          name={rule.name}
          description={rule.description}
          is_enabled={rule.is_enabled}
          origin={rule.proposal_status === 'manual' ? 'manual' : 'chat'}
          confidence={rule.confidence}
        />
      ))}
    </div>
  );
}
