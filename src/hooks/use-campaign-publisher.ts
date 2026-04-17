import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface CampaignDraft {
  id: string;
  name: string;
  ad_account_id: string;
  campaign_data: Record<string, unknown>;
  adset_data: Record<string, unknown>;
  ad_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CampaignPublication {
  id: string;
  draft_id: string | null;
  name: string;
  status: 'draft' | 'validating' | 'compliance_check' | 'publishing' | 'live' | 'failed';
  current_step: string | null;
  compliance_score: number | null;
  compliance_violations: unknown;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_creative_id: string | null;
  meta_ad_id: string | null;
  error_stage: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface PublishPayload {
  draft_id?: string;
  ad_account_id?: string;
  campaign_data?: Record<string, unknown>;
  adset_data?: Record<string, unknown>;
  ad_data?: Record<string, unknown>;
  force?: boolean;
}

// ============================================================
// Drafts CRUD
// ============================================================

export function useCampaignDrafts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery<CampaignDraft[]>({
    queryKey: ['campaign-drafts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_drafts' as never)
        .select('id, name, ad_account_id, campaign_data, adset_data, ad_data, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignDraft[];
    },
  });

  const save = useMutation({
    mutationFn: async (draft: Omit<CampaignDraft, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
      const { id, ...fields } = draft;
      if (id) {
        const { error } = await supabase
          .from('campaign_drafts' as never)
          .update({ ...fields, updated_at: new Date().toISOString() } as never)
          .eq('id', id);
        if (error) throw error;
        return id;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from('campaign_drafts' as never)
          .insert({ ...fields, created_by: userData.user?.id } as never)
          .select('id').single();
        if (error) throw error;
        return (data as { id: string }).id;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-drafts'] });
      toast({ title: 'Draft salvo' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao salvar draft', description: err.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaign_drafts' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-drafts'] });
      toast({ title: 'Draft removido' });
    },
  });

  return { drafts: query.data ?? [], isLoading: query.isLoading, save, remove };
}

// ============================================================
// Publish (trigger Edge Function)
// ============================================================

export function useCampaignPublish() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PublishPayload) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');

      const { data, error } = await supabase.functions.invoke('campaign-publish', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: payload,
      });
      if (error) throw error;
      return data as {
        status?: string;
        publication_id?: string;
        meta_ids?: Record<string, string | null>;
        manager_url?: string;
        error?: string;
        validation_errors?: unknown;
        violations?: unknown;
        compliance_score?: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-publications'] });
      if (data.status === 'live') {
        toast({
          title: 'Campanha publicada!',
          description: data.manager_url ? 'Ver no Gerenciador Meta' : undefined,
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao publicar', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// Publication status (polling)
// ============================================================

export function useCampaignPublication(publicationId: string | null) {
  return useQuery<CampaignPublication | null>({
    queryKey: ['campaign-publication', publicationId],
    queryFn: async () => {
      if (!publicationId) return null;
      const { data, error } = await supabase
        .from('campaign_publications' as never)
        .select('*')
        .eq('id', publicationId)
        .maybeSingle();
      if (error) throw error;
      return (data as CampaignPublication | null) ?? null;
    },
    enabled: !!publicationId,
    refetchInterval: (q) => {
      const d = q.state.data as CampaignPublication | null | undefined;
      if (!d) return 2000;
      if (d.status === 'live' || d.status === 'failed') return false;
      return 2000;
    },
  });
}

// ============================================================
// Publications history
// ============================================================

export function useCampaignPublications(filter: 'all' | 'live' | 'failed' = 'all') {
  return useQuery<CampaignPublication[]>({
    queryKey: ['campaign-publications', filter],
    queryFn: async () => {
      let q = supabase
        .from('campaign_publications' as never)
        .select('id, draft_id, name, status, current_step, compliance_score, meta_campaign_id, meta_ad_id, error_stage, error_message, started_at, finished_at')
        .order('started_at', { ascending: false })
        .limit(50);
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CampaignPublication[];
    },
    staleTime: 30_000, // historico nao precisa refetch frequente — invalidacao manual apos publish e suficiente
  });
}
