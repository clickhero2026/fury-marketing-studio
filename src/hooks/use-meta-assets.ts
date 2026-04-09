import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: string;
  currency: string;
  business?: { id: string; name: string };
}

export interface MetaBusiness {
  id: string;
  name: string;
}

export interface MetaPage {
  id: string;
  name: string;
  category: string;
  access_token?: string;
}

interface AssetsResponse {
  ad_accounts: MetaAdAccount[];
  businesses: MetaBusiness[];
  pages: MetaPage[];
  selected_account_ids: string[];
  selected_page_ids: string[];
  source: 'cache' | 'api';
}

interface SaveAssetsPayload {
  ad_accounts: Array<{
    id: string;
    name?: string;
    account_status?: string;
    currency?: string;
    business_id?: string;
    business_name?: string;
  }>;
  pages: Array<{
    id: string;
    name?: string;
    category?: string;
    access_token?: string;
  }>;
}

export function useMetaAssets(enabled = false) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available assets from Meta
  const {
    data: assets,
    isLoading,
    error,
    refetch,
  } = useQuery<AssetsResponse>({
    queryKey: ['meta-assets'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const { data, error } = await supabase.functions.invoke('meta-list-assets', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      return data as AssetsResponse;
    },
    enabled,
    staleTime: 60_000, // 1 min
  });

  // Save selected assets
  const saveMutation = useMutation({
    mutationFn: async (payload: SaveAssetsPayload) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const { data, error } = await supabase.functions.invoke('meta-save-assets', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: payload,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meta-integration'] });
      queryClient.invalidateQueries({ queryKey: ['meta-assets'] });
      toast({
        title: 'Ativos salvos',
        description: `${data.saved.ad_accounts} conta(s) e ${data.saved.pages} pagina(s) selecionadas.`,
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
    isSaving: saveMutation.isPending,
  };
}
