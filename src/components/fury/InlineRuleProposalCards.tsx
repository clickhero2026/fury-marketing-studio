// Container que busca e renderiza as propostas pendentes da conversa atual.
// Spec: .kiro/specs/fury-learning/ (T4.3)

import { useRuleProposals } from '@/hooks/useRuleProposals';
import { RuleProposalCard } from './RuleProposalCard';

interface Props {
  conversationId: string | null;
}

export function InlineRuleProposalCards({ conversationId }: Props) {
  const { data: proposals } = useRuleProposals(conversationId);
  if (!conversationId || !proposals || proposals.length === 0) return null;

  return (
    <div className="space-y-2">
      {proposals.map((p) => (
        <RuleProposalCard key={p.message_id} messageId={p.message_id} envelope={p.envelope} />
      ))}
    </div>
  );
}
