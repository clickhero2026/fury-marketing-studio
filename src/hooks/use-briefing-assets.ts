// Hook de assets visuais do briefing (logos + mood board).
// Spec: .kiro/specs/briefing-onboarding/ (task 4.2)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  BRIEFING_ASSET_ALLOWED_MIMES,
  BRIEFING_ASSET_MAX_BYTES,
  MOOD_BOARD_MAX_ITEMS,
  SIGNED_URL_TTL_SECONDS,
  type AssetError,
  type AssetKind,
  type AssetMime,
  type BrandingAsset,
  type Result,
} from '@/types/briefing';

const BUCKET = 'company-assets';

function isAllowedMime(mime: string): mime is AssetMime {
  return (BRIEFING_ASSET_ALLOWED_MIMES as string[]).includes(mime);
}

function extFromMime(mime: AssetMime): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
  }
}

async function enrichWithSignedUrls(list: BrandingAsset[]): Promise<BrandingAsset[]> {
  return Promise.all(
    list.map(async (asset) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...asset, signed_url: signed?.signedUrl };
    }),
  );
}

export function useBriefingAssets() {
  const { company, role } = useAuth();
  const companyId = company?.id ?? null;
  const isReadOnly = role !== 'owner' && role !== 'admin';
  const queryClient = useQueryClient();

  const assetsQuery = useQuery({
    queryKey: ['briefing-assets', companyId],
    enabled: !!companyId,
    staleTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async (): Promise<BrandingAsset[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_branding_assets' as never)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return enrichWithSignedUrls((data as unknown as BrandingAsset[]) ?? []);
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['briefing-assets', companyId] });
    queryClient.invalidateQueries({ queryKey: ['briefing-status', companyId] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (params: {
      file: File;
      kind: AssetKind;
    }): Promise<Result<BrandingAsset, AssetError>> => {
      if (!companyId || isReadOnly) {
        return { ok: false, error: { kind: 'unauthorized' } };
      }
      if (params.file.size > BRIEFING_ASSET_MAX_BYTES) {
        return { ok: false, error: { kind: 'too_large', maxBytes: BRIEFING_ASSET_MAX_BYTES } };
      }
      if (!isAllowedMime(params.file.type)) {
        return { ok: false, error: { kind: 'unsupported_mime' } };
      }
      // Mood board: limite client-side (R4.3)
      if (params.kind === 'mood_board') {
        const count = (assetsQuery.data ?? []).filter((a) => a.kind === 'mood_board').length;
        if (count >= MOOD_BOARD_MAX_ITEMS) {
          return { ok: false, error: { kind: 'mood_board_limit_reached', max: MOOD_BOARD_MAX_ITEMS } };
        }
      }
      // Logos sao unicos: substituir se ja existir.
      if (params.kind === 'logo_primary' || params.kind === 'logo_alt') {
        const existing = (assetsQuery.data ?? []).find((a) => a.kind === params.kind);
        if (existing) {
          await supabase.storage.from(BUCKET).remove([existing.storage_path]);
          await supabase.from('company_branding_assets' as never).delete().eq('id', existing.id);
        }
      }

      const mime = params.file.type as AssetMime;
      const ext = extFromMime(mime);
      const uuid = crypto.randomUUID();
      const storagePath = `${companyId}/branding/${params.kind}/${uuid}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, params.file, { contentType: mime, upsert: false });
      if (uploadErr) {
        return { ok: false, error: { kind: 'network', message: uploadErr.message } };
      }

      const { data, error: insertErr } = await supabase
        .from('company_branding_assets' as never)
        .insert({
          company_id: companyId,
          kind: params.kind,
          storage_path: storagePath,
          mime_type: mime,
          size_bytes: params.file.size,
        } as never)
        .select()
        .single();

      if (insertErr || !data) {
        // Rollback do Storage se o INSERT falhou
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return {
          ok: false,
          error: { kind: 'network', message: insertErr?.message ?? 'insert failed' },
        };
      }

      const enriched = (await enrichWithSignedUrls([data as unknown as BrandingAsset]))[0];
      return { ok: true, value: enriched };
    },
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (assetId: string): Promise<Result<void, AssetError>> => {
      if (!companyId || isReadOnly) {
        return { ok: false, error: { kind: 'unauthorized' } };
      }
      const target = (assetsQuery.data ?? []).find((a) => a.id === assetId);
      if (!target) return { ok: true, value: undefined };

      const { error: deleteErr } = await supabase
        .from('company_branding_assets' as never)
        .delete()
        .eq('id', assetId);
      if (deleteErr) {
        return { ok: false, error: { kind: 'network', message: deleteErr.message } };
      }
      // Best-effort: remove do Storage. Se falhar, fica orfao — limpeza periodica fora desta spec.
      await supabase.storage.from(BUCKET).remove([target.storage_path]);
      return { ok: true, value: undefined };
    },
    onSuccess: invalidate,
  });

  return {
    assets: assetsQuery.data ?? [],
    isLoading: assetsQuery.isLoading,
    isError: assetsQuery.isError,
    isReadOnly,
    upload: uploadMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    refreshSignedUrls: () =>
      queryClient.invalidateQueries({ queryKey: ['briefing-assets', companyId] }),
  };
}
