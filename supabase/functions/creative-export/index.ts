// creative-export — ZIP de criativos aprovados.
// Spec: .kiro/specs/ai-creative-generation/ (task 6.1 — R7.6)
//
// Pipeline:
//   1. Tenant guard + Zod (max 50 ids)
//   2. Fetch rows e valida company_id + status IN ('approved', 'published')
//   3. Download bytes em paralelo (limite 5 simultaneos)
//   4. Monta ZIP via fflate (deno-friendly, zero deps nativas)
//   5. Upload no proprio bucket sob {company}/exports/{uuid}.zip
//   6. Retorna signed URL TTL 5min
//
// Sem hashes/transformacoes — bytes saem como foram gerados.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import { zipSync, strToU8 } from 'https://esm.sh/fflate@0.8.2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireTenant } from '../_shared/tenant-guard.ts';
import { logCreativeAccess } from '../_shared/log-redact.ts';

const MAX_IDS = 50;
const PARALLEL_DOWNLOADS = 5;
const SIGNED_URL_TTL_SEC = 300; // 5 min

const ExportRequestSchema = z.object({
  creative_ids: z.array(z.string().uuid()).min(1).max(MAX_IDS),
});

interface CreativeRow {
  id: string;
  storage_path: string;
  mime_type: string;
  format: string;
  title: string | null;
  status: string;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405, cors);

  const startedAt = Date.now();
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const guard = await requireTenant(req, admin, { cors });
  if (!guard.ok) return guard.response;
  const { userId, companyId } = guard.value;

  let body: unknown;
  try { body = await req.json(); } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, cors);
  }
  const parsed = ExportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'validation', issues: parsed.error.flatten() }, 422, cors);
  }
  const { creative_ids } = parsed.data;

  // Fetch rows + valida tenant + status
  const { data: rowsRaw, error: fetchErr } = await admin
    .from('creatives_generated')
    .select('id, company_id, storage_path, mime_type, format, title, status')
    .in('id', creative_ids);
  if (fetchErr) {
    return jsonResponse({ error: 'fetch_failed', detail: fetchErr.message }, 500, cors);
  }

  const rows = ((rowsRaw ?? []) as Array<CreativeRow & { company_id: string }>)
    .filter((r) => r.company_id === companyId)
    .filter((r) => r.status === 'approved' || r.status === 'published');

  if (rows.length === 0) {
    return jsonResponse(
      { error: 'no_eligible_creatives', message: 'Nenhum criativo aprovado/publicado encontrado entre os IDs.' },
      404, cors,
    );
  }

  // Download paralelo limitado
  const fileMap: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  for (let i = 0; i < rows.length; i += PARALLEL_DOWNLOADS) {
    const batch = rows.slice(i, i + PARALLEL_DOWNLOADS);
    const downloads = await Promise.all(
      batch.map(async (r) => {
        const { data: blob, error } = await admin.storage
          .from('generated-creatives').download(r.storage_path);
        if (error || !blob) return null;
        return { row: r, bytes: new Uint8Array(await blob.arrayBuffer()) };
      }),
    );
    for (const d of downloads) {
      if (!d) continue;
      const ext = mimeToExt(d.row.mime_type);
      const baseName = sanitizeFileName(d.row.title ?? d.row.id);
      let name = `${baseName}-${d.row.format}.${ext}`;
      // Garante unicidade no zip
      let k = 2;
      while (usedNames.has(name)) {
        name = `${baseName}-${d.row.format}-${k}.${ext}`;
        k++;
      }
      usedNames.add(name);
      fileMap[name] = d.bytes;
    }
  }

  if (Object.keys(fileMap).length === 0) {
    return jsonResponse({ error: 'all_downloads_failed' }, 500, cors);
  }

  // Manifest opcional (audit-friendly)
  const manifest = rows.map((r) => ({
    id: r.id, format: r.format, status: r.status, title: r.title,
  }));
  fileMap['manifest.json'] = strToU8(JSON.stringify({
    company_id: companyId,
    generated_at: new Date().toISOString(),
    files: manifest,
  }, null, 2));

  // Monta ZIP
  const zipped = zipSync(fileMap, { level: 6 });

  // Upload em bucket sob exports/{uuid}.zip
  const exportId = crypto.randomUUID();
  const zipPath = `${companyId}/exports/${exportId}.zip`;
  const { error: upErr } = await admin.storage
    .from('generated-creatives')
    .upload(zipPath, zipped, { contentType: 'application/zip', upsert: false });
  if (upErr) {
    return jsonResponse({ error: 'zip_upload_failed', detail: upErr.message }, 500, cors);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from('generated-creatives')
    .createSignedUrl(zipPath, SIGNED_URL_TTL_SEC);
  if (signErr || !signed?.signedUrl) {
    return jsonResponse({ error: 'sign_failed' }, 500, cors);
  }

  logCreativeAccess({
    companyId, userId, event: 'export',
    count: rows.length,
    durationMs: Date.now() - startedAt,
    status: 'success',
  });

  return jsonResponse({
    download_url: signed.signedUrl,
    expires_at: new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString(),
    file_count: rows.length,
    skipped: creative_ids.length - rows.length,
  }, 200, cors);
});

// ============================================================
// Helpers
// ============================================================

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function mimeToExt(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

function sanitizeFileName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'creative';
}
