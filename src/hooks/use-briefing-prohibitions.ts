// Hook de proibicoes do briefing + defaults por vertical regulada.
// Spec: .kiro/specs/briefing-onboarding/ (task 4.4)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type {
  BriefingError,
  CompanyProhibition,
  ProhibitionCategory,
  Result,
} from '@/types/briefing';

const STALE_MS = 5 * 60 * 1000;

// R5.4: defaults sugeridos para verticais reguladas.
type RegulatedVertical = 'health' | 'finance' | 'infoproduct' | 'weight_loss';

const VERTICAL_DEFAULTS: Record<
  RegulatedVertical,
  { category: ProhibitionCategory; value: string }[]
> = {
  health: [
    { category: 'topic', value: 'Promessa de cura ou resultado garantido' },
    { category: 'topic', value: 'Antes e depois sem disclaimer' },
    { category: 'word', value: 'cura' },
    { category: 'word', value: 'milagre' },
  ],
  finance: [
    { category: 'topic', value: 'Garantia de retorno financeiro' },
    { category: 'word', value: 'lucro garantido' },
    { category: 'word', value: 'enriquecer rapido' },
  ],
  infoproduct: [
    { category: 'topic', value: 'Promessa de resultado em prazo especifico' },
    { category: 'word', value: 'ficar rico' },
    { category: 'word', value: 'sucesso garantido' },
  ],
  weight_loss: [
    { category: 'topic', value: 'Antes e depois sem laudo medico' },
    { category: 'word', value: 'emagreca X kg em Y dias' },
    { category: 'visual', value: 'Fotos com closeup em barriga ou partes do corpo' },
  ],
};

export function suggestVertical(niche: string | null): RegulatedVertical | null {
  if (!niche) return null;
  const n = niche.toLowerCase();
  if (/saude|medic|clinic|fisioterapia|nutric|dentista|psicolog/.test(n)) return 'health';
  if (/financ|invest|cripto|trading|bolsa|forex/.test(n)) return 'finance';
  if (/emagrec|peso|fitness|estetica/.test(n)) return 'weight_loss';
  if (/curso|infoprodut|coach|mentoria|treinamento/.test(n)) return 'infoproduct';
  return null;
}

export function useBriefingProhibitions() {
  const { company, role } = useAuth();
  const companyId = company?.id ?? null;
  const isReadOnly = role !== 'owner' && role !== 'admin';
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['briefing-prohibitions', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<CompanyProhibition[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_prohibitions' as never)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as CompanyProhibition[]) ?? [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['briefing-prohibitions', companyId] });
    queryClient.invalidateQueries({ queryKey: ['briefing-status', companyId] });
  };

  const addMutation = useMutation({
    mutationFn: async (params: {
      category: ProhibitionCategory;
      value: string;
      source?: 'user' | 'vertical_default';
    }): Promise<Result<CompanyProhibition, BriefingError>> => {
      if (!companyId || isReadOnly) {
        return { ok: false, error: { kind: 'unauthorized' } };
      }
      if (!params.value.trim()) {
        return { ok: false, error: { kind: 'validation', fields: ['value'] } };
      }
      const { data, error } = await supabase
        .from('company_prohibitions' as never)
        .insert({
          company_id: companyId,
          category: params.category,
          value: params.value.trim(),
          source: params.source ?? 'user',
        } as never)
        .select()
        .single();
      if (error) {
        return { ok: false, error: { kind: 'network', message: error.message } };
      }
      return { ok: true, value: data as unknown as CompanyProhibition };
    },
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (prohibitionId: string): Promise<Result<void, BriefingError>> => {
      if (!companyId || isReadOnly) {
        return { ok: false, error: { kind: 'unauthorized' } };
      }
      const { error } = await supabase
        .from('company_prohibitions' as never)
        .delete()
        .eq('id', prohibitionId);
      if (error) {
        return { ok: false, error: { kind: 'network', message: error.message } };
      }
      return { ok: true, value: undefined };
    },
    onSuccess: invalidate,
  });

  const seedVerticalDefaultsMutation = useMutation({
    mutationFn: async (
      vertical: RegulatedVertical,
    ): Promise<Result<number, BriefingError>> => {
      if (!companyId || isReadOnly) {
        return { ok: false, error: { kind: 'unauthorized' } };
      }
      const defaults = VERTICAL_DEFAULTS[vertical] ?? [];
      if (defaults.length === 0) return { ok: true, value: 0 };

      const existing = query.data ?? [];
      const toInsert = defaults
        .filter(
          (d) =>
            !existing.some(
              (p) => p.category === d.category && p.value.toLowerCase() === d.value.toLowerCase(),
            ),
        )
        .map((d) => ({
          company_id: companyId,
          category: d.category,
          value: d.value,
          source: 'vertical_default' as const,
        }));

      if (toInsert.length === 0) return { ok: true, value: 0 };

      const { error } = await supabase
        .from('company_prohibitions' as never)
        .insert(toInsert as never);
      if (error) {
        return { ok: false, error: { kind: 'network', message: error.message } };
      }
      return { ok: true, value: toInsert.length };
    },
    onSuccess: invalidate,
  });

  return {
    prohibitions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isReadOnly,
    add: addMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    seedVerticalDefaults: seedVerticalDefaultsMutation.mutateAsync,
    suggestVertical,
  };
}
