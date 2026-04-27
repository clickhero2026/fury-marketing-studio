// Tab: regras de pipeline de criativo (logos, watermarks, fontes...).
// Spec: .kiro/specs/fury-learning/ (T5.3)

import { ImagePlus } from 'lucide-react';
import { useActiveRules } from '@/hooks/useActiveRules';
import { RuleListItem } from './RuleListItem';
import { TRANSFORM_TYPE_LABELS } from '@/types/fury-rules';

export function CreativePipelineTab() {
  const { pipeline, isLoading } = useActiveRules();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando...</div>;
  }
  if (!pipeline.length) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
        <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        Sem regras de pipeline ainda. Anexe uma logo no chat e diga "use sempre essa logo no canto superior direito".
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {pipeline.length} regra{pipeline.length === 1 ? '' : 's'} de pipeline
      </div>
      {pipeline.map((rule) => (
        <RuleListItem
          key={rule.id}
          table="creative_pipeline_rules"
          id={rule.id}
          name={rule.name}
          description={rule.description}
          is_enabled={rule.is_enabled}
          origin={rule.proposal_status === 'manual' ? 'manual' : 'chat'}
          confidence={rule.confidence}
          badge={TRANSFORM_TYPE_LABELS[rule.transform_type]}
        />
      ))}
    </div>
  );
}
