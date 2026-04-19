import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types — nova estrutura hierarquica
// ============================================================

export interface EnrichedAccount {
  id: string;              // act_XXXXX
  account_id?: string;     // XXXXX
  name: string;
  currency?: string;
  account_status?: number;
  timezone_name?: string;
  amount_spent?: string;   // total acumulado (cents ou unidades dependendo do retorno)
  business_id: string | null;
  is_owned: boolean;
  active_campaigns_count: number;
  spend_last_30d: number;
}

export interface EnrichedPage {
  id: string;
  name: string;
  category?: string;
  picture?: { data?: { url?: string } };
  business_id: string | null;
  is_owned: boolean;
}

export interface BusinessNode {
  id: string;
  name: string;
  verification_status: string | null;
  ad_accounts: EnrichedAccount[];
  pages: EnrichedPage[];
}

export interface AssetsHierarchy {
  businesses: BusinessNode[];
  personal_ad_accounts: EnrichedAccount[];
  personal_pages: EnrichedPage[];
  selected_account_ids: string[];
  selected_page_ids: string[];
  source: string;
}

export interface SaveAssetsPayload {
  ad_accounts: Array<{
    id: string;
    name?: string;
    account_status?: number | string;
    currency?: string;
    business_id?: string | null;
    business_name?: string | null;
  }>;
  pages: Array<{
    id: string;
    name?: string;
    category?: string;
    access_token?: string;
    business_id?: string | null;
    business_name?: string | null;
  }>;
}

// ============================================================
// Legacy types — mantido pra compat com MetaAccountSelector antigo
// ============================================================

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: string;
  currency: string;
  business?: { id: string; name: string };
}

export interface MetaPage {
  id: string;
  name: string;
  category: string;
  access_token?: string;
}

// ============================================================

export function useMetaAssets(enabled = false) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: assets,
    isLoading,
    error,
    refetch,
  } = useQuery<AssetsHierarchy>({
    queryKey: ['meta-assets'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');

      const { data, error } = await supabase.functions.invoke('meta-list-assets', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      return data as AssetsHierarchy;
    },
    enabled,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: SaveAssetsPayload) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');

      const { data, error } = await supabase.functions.invoke('meta-save-assets', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: payload,
      });
      if (error) throw error;
      return data as { success: boolean; saved: { ad_accounts: number; pages: number } };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['meta-integration'] });
      queryClient.invalidateQueries({ queryKey: ['meta-assets'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-metrics'] });

      // Fire-and-forget: dispara sync completo em background pra popular o app
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        supabase.functions.invoke('meta-sync', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
        supabase.functions.invoke('meta-deep-scan', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      });

      toast({
        title: 'Ativos salvos',
        description: `${data.saved.ad_accounts} conta(s) e ${data.saved.pages} pagina(s). Sincronizacao iniciada.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  return {
    assets,
    isLoading,
    error,
    refetch,
    saveAssets: saveMutation.mutate,
    saveAssetsAsync: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
