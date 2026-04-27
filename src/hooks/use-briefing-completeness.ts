// Hook de completude do briefing: consome v_company_briefing_status.
// Spec: .kiro/specs/briefing-onboarding/ (task 4.3)

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type {
  BriefingMissingField,
  BriefingStatus,
  BriefingStatusRow,
} from '@/types/briefing';

const STALE_MS = 5 * 60 * 1000;

// Campos que bloqueiam geracao de criativo quando faltam.
const BLOCKS_CREATIVE: BriefingMissingField[] = [
  'niche',
  'short_description',
  'primary_offer',
  'visual_identity',
];

// Campos que bloqueiam publicacao de campanha quando faltam.
const BLOCKS_PUBLISH: BriefingMissingField[] = [
  'niche',
  'primary_offer',
];

export interface BriefingCompletenessState {
  status: BriefingStatus;
  score: number;
  isComplete: boolean;
  missingFields: BriefingMissingField[];
  blocksCreativeGeneration: boolean;
  blocksCampaignPublish: boolean;
}

const DEFAULT_STATE: BriefingCompletenessState = {
  status: 'not_started',
  score: 0,
  isComplete: false,
  missingFields: [],
  blocksCreativeGeneration: true,
  blocksCampaignPublish: true,
};

export function useBriefingCompleteness() {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['briefing-status', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<BriefingCompletenessState> => {
      if (!companyId) return DEFAULT_STATE;

      const [statusRes, briefingRes] = await Promise.all([
        supabase
          .from('v_company_briefing_status' as never)
          .select('company_id, is_complete, score, missing_fields')
          .eq('company_id', companyId)
          .maybeSingle(),
        supabase
          .from('company_briefings' as never)
          .select('status')
          .eq('company_id', companyId)
          .maybeSingle(),
      ]);

      const statusRow = (statusRes.data as unknown as BriefingStatusRow | null) ?? null;
      const briefingRow = briefingRes.data as { status?: BriefingStatus } | null;

      if (!statusRow) {
        return DEFAULT_STATE;
      }

      const missing = statusRow.missing_fields ?? [];
      const blocksCreative =
        !statusRow.is_complete && BLOCKS_CREATIVE.some((f) => missing.includes(f));
      const blocksPublish =
        !statusRow.is_complete && BLOCKS_PUBLISH.some((f) => missing.includes(f));

      return {
        status: briefingRow?.status ?? (statusRow.is_complete ? 'complete' : 'incomplete'),
        score: statusRow.score,
        isComplete: statusRow.is_complete,
        missingFields: missing,
        blocksCreativeGeneration: blocksCreative,
        blocksCampaignPublish: blocksPublish,
      };
    },
  });

  return {
    ...(query.data ?? DEFAULT_STATE),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () =>
      queryClient.invalidateQueries({ queryKey: ['briefing-status', companyId] }),
  };
}
