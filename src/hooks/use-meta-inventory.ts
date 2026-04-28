// Hooks de leitura do inventario Meta sincronizado pelo meta-deep-scan.
// Spec: meta-deep-scan Corte A (UI parte do slice).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const STALE_MS = 60_000;

export interface BusinessManager {
  id: string;
  external_id: string;
  name: string | null;
  vertical: string | null;
  primary_page: string | null;
  verification_status: string | null;
  two_factor_type: string | null;
  created_time: string | null;
  last_scanned_at: string | null;
  created_at: string;
}

export interface AdsetRow {
  id: string;
  external_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  campaign_id: string | null;
  campaign_external_id: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  budget_remaining: number | null;
  optimization_goal: string | null;
  start_time: string | null;
  end_time: string | null;
  last_scanned_at: string | null;
}

export interface MetaPixelRow {
  id: string;
  external_id: string;
  name: string | null;
  last_fired_time: string | null;
  creation_time: string | null;
  is_unavailable: boolean | null;
  ad_account_id: string | null;
  last_scanned_at: string | null;
}

export function useBusinessManagers() {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  return useQuery({
    queryKey: ['meta-business-managers', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<BusinessManager[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('meta_business_managers' as never)
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BusinessManager[];
    },
  });
}

export function useAdsets(filters?: { status?: string; search?: string }) {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  return useQuery({
    queryKey: ['adsets', companyId, filters],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<AdsetRow[]> => {
      if (!companyId) return [];
      let q = supabase
        .from('adsets' as never)
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(500);
      if (filters?.status && filters.status !== 'all') {
        q = q.eq('effective_status', filters.status);
      }
      if (filters?.search?.trim()) {
        q = q.ilike('name', `%${filters.search.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AdsetRow[];
    },
  });
}

export function useMetaPixels() {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  return useQuery({
    queryKey: ['meta-pixels', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<MetaPixelRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('meta_pixels' as never)
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MetaPixelRow[];
    },
  });
}
