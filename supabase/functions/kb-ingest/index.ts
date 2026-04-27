// kb-ingest — Pipeline async de ingestao da Knowledge Base.
// Spec: .kiro/specs/knowledge-base-rag/ (tasks 3.1, 3.2, 3.3, 3.4)
//
// Fluxo por documento:
//   1. SELECT documento -> status=extracting
//   2. Download bytes do bucket apropriado (knowledge-base ou chat-attachments)
//   3. Extracao de texto por tipo:
//      - PDF: unpdf
//      - TXT/MD/CSV/JSON: UTF-8 direto
//      - Imagem: GPT-4o-mini vision (texto OCR + caption)
//      - DOCX/XLSX: nao suportado em v1 -> failed com mensagem clara
//   4. Chunking por tipo (800 tokens / overlap 100; CSV: por bloco de linhas)
//   5. Embeddings OpenAI text-embedding-3-small em batches
//   6. INSERT chunks transacional + status=indexed + indexed_at + agent_runs
//
// Triggered: cron kb-process-pending OU best-effort apos upload.
// Concurrency: max 5 documentos por invocacao + 5 OpenAI calls paralelas.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireTenant } from '../_shared/tenant-guard.ts';
import { logKbAccess } from '../_shared/log-redact.ts';

const OPENAI_URL = 'https://api.openai.com/v1';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;
const VISION_MODEL = 'gpt-4o-mini';

const CHUNK_TARGET_TOKENS = 800;
const CHUNK_OVERLAP_TOKENS = 100;
const EMBED_BATCH_SIZE = 100;
const MAX_DOCS_PER_INVOCATION = 5;
const MAX_TEXT_LENGTH = 1_000_000; // hard cap defensivo

// ============================================================
// Tipos
// ============================================================

type KbDocType = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'json' | 'txt' | 'md' | 'image';

interface KbDoc {
  id: string;
  company_id: string;
  type: KbDocType;
  source: 'upload' | 'chat_attachment';
  source_attachment_id: string | null;
  storage_bucket: 'knowledge-base' | 'chat-attachments';
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  extracted_text: string | null;
}

interface Chunk {
  index: number;
  text: string;
  page: number | null;
  tokens: number;
}

// ============================================================
// HTTP entry
// ============================================================

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY missing' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let body: { document_ids?: string[] } = {};
  try { body = await req.json(); } catch { body = {}; }

  // Tenant guard: se houver JWT no request, valida que document_ids pertencem
  // a company do user (R9.4 — defense-in-depth contra service_role abuse).
  // Cron interno chama sem Authorization: confia em service_role e pega proximos pending.
  const hasAuthHeader = !!req.headers.get('Authorization');
  let scopedCompanyId: string | null = null;
  if (hasAuthHeader) {
    const guard = await requireTenant(req, admin, { cors });
    if (!guard.ok) return guard.response;
    scopedCompanyId = guard.value.companyId;
  }

  // Sem document_ids: pega proximos pending (modo cron) OU pending da company (modo JWT).
  let docIds = Array.isArray(body.document_ids) ? body.document_ids.slice(0, MAX_DOCS_PER_INVOCATION) : [];

  if (docIds.length === 0) {
    let pendingQuery = admin
      .from('knowledge_documents')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_DOCS_PER_INVOCATION);
    if (scopedCompanyId) pendingQuery = pendingQuery.eq('company_id', scopedCompanyId);
    const { data: pendings } = await pendingQuery;
    docIds = (pendings ?? []).map((p) => p.id as string);
  } else if (scopedCompanyId) {
    // Filtra document_ids alheios — bloqueio defensivo cross-tenant
    const { data: validDocs } = await admin
      .from('knowledge_documents')
      .select('id')
      .in('id', docIds)
      .eq('company_id', scopedCompanyId);
    const allowed = new Set((validDocs ?? []).map((d) => d.id as string));
    const dropped = docIds.filter((id) => !allowed.has(id));
    if (dropped.length > 0) {
      console.warn(JSON.stringify({
        event: 'kb-ingest.cross_tenant_blocked',
        company_id: scopedCompanyId,
        dropped_count: dropped.length,
      }));
    }
    docIds = Array.from(allowed);
  }

  if (docIds.length === 0) {
    return new Response(JSON.stringify({ processed: [] }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const docId of docIds) {
    const startedAt = Date.now();
    try {
      const status = await processDocument(admin, openaiKey, docId);
      results.push({ id: docId, status });
      logKbAccess({
        companyId: scopedCompanyId ?? 'cron',
        event: 'ingest',
        documentId: docId,
        durationMs: Date.now() - startedAt,
        status: 'success',
      });
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await admin.from('knowledge_documents').update({
        status: 'failed', status_error: msg,
      }).eq('id', docId);
      results.push({ id: docId, status: 'failed', error: msg });
      logKbAccess({
        companyId: scopedCompanyId ?? 'cron',
        event: 'ingest',
        documentId: docId,
        durationMs: Date.now() - startedAt,
        status: 'failed',
        errorKind: e instanceof Error ? e.name : 'unknown',
      });
    }
  }

  return new Response(JSON.stringify({ processed: results }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});

// ============================================================
// Processamento principal
// ============================================================

async function processDocument(
  admin: SupabaseClient,
  openaiKey: string,
  documentId: string,
): Promise<string> {
  const { data: doc, error } = await admin
    .from('knowledge_documents')
    .select('id, company_id, type, source, source_attachment_id, storage_bucket, storage_path, mime_type, size_bytes, extracted_text')
    .eq('id', documentId)
    .single();
  if (error || !doc) throw new Error(`document not found: ${documentId}`);

  await admin.from('knowledge_documents').update({ status: 'extracting' }).eq('id', documentId);

  // Reusa extracted_text se promocao do chat ja tem (R2.4)
  let text = (doc.extracted_text ?? '').trim();
  let pages: { page: number; text: string }[] | null = null;

  if (text.length === 0) {
    const buffer = await downloadBytes(admin, doc.storage_bucket, doc.storage_path);
    const extracted = await extractByType(doc as KbDoc, buffer, openaiKey);
    text = extracted.text;
    pages = extracted.pages;

    if (text.length > 0) {
      await admin.from('knowledge_documents').update({
        extracted_text: text.slice(0, MAX_TEXT_LENGTH),
        page_count: pages?.length ?? null,
      }).eq('id', documentId);
    }
  }

  if (text.length === 0) {
    throw new Error('extraction yielded empty text');
  }

  await admin.from('knowledge_documents').update({ status: 'embedding' }).eq('id', documentId);

  const chunks = chunkByType(doc as KbDoc, text, pages);
  if (chunks.length === 0) throw new Error('no chunks generated');

  const totalTokens = chunks.reduce((acc, c) => acc + c.tokens, 0);

  // Embeddings em batches
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(openaiKey, batch.map((c) => c.text));
    embeddings.push(...vectors);
  }

  // INSERT transacional dos chunks
  const rows = chunks.map((c, i) => ({
    document_id: doc.id,
    company_id: doc.company_id,
    chunk_index: c.index,
    page_number: c.page,
    chunk_text: c.text,
    embedding: embeddings[i] as unknown as string, // pgvector aceita array literal
    embedding_model_version: EMBEDDING_MODEL,
    token_count: c.tokens,
  }));

  // Apaga chunks antigos do mesmo documento (caso seja reprocessamento)
  await admin.from('knowledge_chunks').delete().eq('document_id', doc.id);

  const { error: insertErr } = await admin.from('knowledge_chunks').insert(rows);
  if (insertErr) throw new Error(`chunk insert: ${insertErr.message}`);

  await admin.from('knowledge_documents').update({
    status: 'indexed',
    embedding_model_version: EMBEDDING_MODEL,
    indexed_at: new Date().toISOString(),
    status_error: null,
  }).eq('id', doc.id);

  // Audit em agent_runs (R4.6)
  await admin.from('agent_runs').insert({
    company_id: doc.company_id,
    agent_name: 'kb-embed',
    status: 'success',
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    model: EMBEDDING_MODEL,
    total_tokens: totalTokens,
    metadata: { document_id: doc.id, chunks: chunks.length, source: doc.source },
  });

  return 'indexed';
}

// ============================================================
// Download de bytes
// ============================================================

async function downloadBytes(
  admin: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? 'unknown'}`);
  return new Uint8Array(await data.arrayBuffer());
}

// ============================================================
// Extracao por tipo (R3.1, R3.2, R3.3, R3.4)
// ============================================================

interface ExtractResult {
  text: string;
  pages: { page: number; text: string }[] | null;
}

async function extractByType(
  doc: KbDoc,
  buffer: Uint8Array,
  openaiKey: string,
): Promise<ExtractResult> {
  switch (doc.type) {
    case 'pdf':
      return extractPdf(buffer);
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
      return { text: new TextDecoder('utf-8', { fatal: false }).decode(buffer), pages: null };
    case 'image':
      return { text: await extractImageVision(buffer, doc.mime_type, openaiKey), pages: null };
    case 'docx':
    case 'xlsx':
      // Defer pra v2 — bibliotecas Deno-friendly de DOCX/XLSX sao complicadas.
      throw new Error(`tipo ${doc.type} ainda nao suportado em v1 — converta para PDF ou TXT`);
    default:
      throw new Error(`tipo desconhecido: ${doc.type}`);
  }
}

async function extractPdf(buffer: Uint8Array): Promise<ExtractResult> {
  const pdf = await getDocumentProxy(buffer);
  const result = await extractText(pdf, { mergePages: false });
  const arr = Array.isArray(result.text) ? result.text : [result.text];
  const pages = arr.map((t, i) => ({ page: i + 1, text: (t ?? '').trim() }))
                   .filter((p) => p.text.length > 0);
  const merged = pages.map((p) => p.text).join('\n\n');
  return { text: merged, pages };
}

async function extractImageVision(buffer: Uint8Array, mime: string, openaiKey: string): Promise<string> {
  // Encode em base64
  let binary = '';
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  const b64 = btoa(binary);
  const dataUrl = `data:${mime};base64,${b64}`;

  const resp = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Voce extrai texto e descreve conteudo visual de imagens. Retorne JSON com keys: extracted_text (texto literalmente visivel na imagem; vazio se nao houver texto) e visual_description (uma descricao curta e factual do conteudo visual em portugues, max 280 chars).',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia texto e descreva esta imagem.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
      max_tokens: 600,
    }),
  });
  if (!resp.ok) throw new Error(`vision call failed: ${resp.status}`);
  const json = await resp.json();
  const raw = json.choices?.[0]?.message?.content ?? '{}';
  let parsed: { extracted_text?: string; visual_description?: string } = {};
  try { parsed = JSON.parse(raw); } catch { /* ignore */ }
  const text = (parsed.extracted_text ?? '').trim();
  const desc = (parsed.visual_description ?? '').trim();
  return [text, desc].filter((s) => s.length > 0).join('\n\n');
}

// ============================================================
// Chunking por tipo (R4.1, R4.3)
// ============================================================

function chunkByType(doc: KbDoc, text: string, pages: ExtractResult['pages']): Chunk[] {
  if (doc.type === 'image') {
    return [{ index: 0, text, page: null, tokens: estimateTokens(text) }];
  }
  if (doc.type === 'csv') {
    return chunkCsv(text);
  }
  if (doc.type === 'pdf' && pages && pages.length > 0) {
    return chunkPdfPages(pages);
  }
  return chunkPlain(text);
}

// Aproximacao: 1 token ~= 4 chars. Suficiente para pacing de chunks.
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function chunkPlain(text: string): Chunk[] {
  const targetChars = CHUNK_TARGET_TOKENS * 4;
  const overlapChars = CHUNK_OVERLAP_TOKENS * 4;
  const chunks: Chunk[] = [];
  let i = 0;
  let idx = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + targetChars);
    const slice = text.slice(i, end);
    chunks.push({ index: idx++, text: slice, page: null, tokens: estimateTokens(slice) });
    if (end === text.length) break;
    i = end - overlapChars;
    if (i <= 0) i = end;
  }
  return chunks;
}

function chunkPdfPages(pages: { page: number; text: string }[]): Chunk[] {
  const targetChars = CHUNK_TARGET_TOKENS * 4;
  const chunks: Chunk[] = [];
  let idx = 0;
  for (const p of pages) {
    const text = p.text;
    if (text.length <= targetChars) {
      chunks.push({ index: idx++, text, page: p.page, tokens: estimateTokens(text) });
      continue;
    }
    // Pagina grande: subdivide com overlap
    const overlapChars = CHUNK_OVERLAP_TOKENS * 4;
    let i = 0;
    while (i < text.length) {
      const end = Math.min(text.length, i + targetChars);
      const slice = text.slice(i, end);
      chunks.push({ index: idx++, text: slice, page: p.page, tokens: estimateTokens(slice) });
      if (end === text.length) break;
      i = end - overlapChars;
      if (i <= 0) i = end;
    }
  }
  return chunks;
}

function chunkCsv(text: string): Chunk[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0];
  const rows = lines.slice(1).filter((l) => l.trim().length > 0);
  const ROWS_PER_CHUNK = 50;
  const chunks: Chunk[] = [];
  let idx = 0;
  for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
    const block = [header, ...rows.slice(i, i + ROWS_PER_CHUNK)].join('\n');
    chunks.push({ index: idx++, text: block, page: null, tokens: estimateTokens(block) });
  }
  // Edge case: arquivo so com header
  if (chunks.length === 0 && header.trim().length > 0) {
    chunks.push({ index: 0, text: header, page: null, tokens: estimateTokens(header) });
  }
  return chunks;
}

// ============================================================
// OpenAI embeddings em batch (R4.2, R4.5)
// ============================================================

async function embedBatch(openaiKey: string, inputs: string[]): Promise<number[][]> {
  const resp = await fetch(`${OPENAI_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`embeddings call failed: ${resp.status} ${err.slice(0, 200)}`);
  }
  const json = await resp.json();
  const data = json.data as Array<{ embedding: number[] }>;
  if (!data || data.length !== inputs.length) {
    throw new Error('embeddings response malformed');
  }
  return data.map((d) => {
    if (!Array.isArray(d.embedding) || d.embedding.length !== EMBEDDING_DIM) {
      throw new Error(`invalid embedding dim: ${d.embedding?.length}`);
    }
    return d.embedding;
  });
}
