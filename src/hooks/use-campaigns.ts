import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CampaignRow {
  id: string;
  external_id: string | null;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  budget: number | null;
  spend: string | null;
}

export interface MetricRow {
  data: string | null;
  campanha: string | null;
  impressoes: number | null;
  cliques: number | null;
  cpc: number | null;
  cpm: number | null;
  investimento: number | null;
  conversas_iniciadas: number | null;
  custo_conversa: number | null;
  website_purchase_roas: number | null;
}

export interface CreativeRow {
  id: string;
  external_id: string | null;
  name: string | null;
  type: string | null;
  image_url: string | null;
  headline: string | null;
  text: string | null;
  call_to_action: string | null;
  status: string | null;
  detected_media_type: string | null;
}

export function useCampaigns() {
  return useQuery<CampaignRow[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, external_id, name, status, effective_status, objective, budget, spend')
        .eq('platform', 'meta')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
    staleTime: 60_000,
    refetchInterval: 300_000, // 5 min — Dash do Dono real-time
    refetchOnWindowFocus: false,
  });
}

export function useCampaignMetrics(days = 30) {
  return useQuery<MetricRow[]>({
    queryKey: ['campaign-metrics', days],
    queryFn: async () => {
      const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('campaign_metrics')
        .select('data, campanha, impressoes, cliques, cpc, cpm, investimento, conversas_iniciadas, custo_conversa, website_purchase_roas')
        .gte('data', start)
        .order('data', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MetricRow[];
    },
    staleTime: 120_000, // metrics mudam lento, evita re-fetch desnecessario
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreatives() {
  return useQuery<CreativeRow[]>({
    queryKey: ['creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creatives')
        .select('id, external_id, name, type, image_url, headline, text, call_to_action, status, detected_media_type')
        .eq('platform', 'meta')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CreativeRow[];
    },
    staleTime: 30_000,
  });
}
