import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';

/**
 * Extracao de texto de anexos do chat (documentos).
 * Spec: .kiro/specs/chat-multimodal/
 *
 * Suporta:
 *   - PDF (texto): unpdf -> texto plano
 *   - PDF scanned (so imagem): retorna 'skipped' (OCR fora do v1)
 *   - txt, md, csv, json: leitura direta UTF-8
 *
 * Imagens nunca chamam essa funcao (kind='image' -> skipped).
 *
 * Disparado em background pelo frontend apos upload.
 * Atualiza chat_attachments.extracted_text e extraction_status.
 */

const MAX_TEXT_LENGTH = 50_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let attachment_id: string | undefined;
  try {
    const body = await req.json();
    attachment_id = body.attachment_id;
    if (!attachment_id) {
      return Response.json({ error: 'attachment_id required' }, { status: 400, headers: corsHeaders });
    }

    const { data: att, error: fetchErr } = await supabase
      .from('chat_attachments')
      .select('id, kind, mime_type, storage_path, size_bytes')
      .eq('id', attachment_id)
      .single();

    if (fetchErr || !att) {
      return Response.json({ error: 'attachment not found' }, { status: 404, headers: corsHeaders });
    }

    if (att.kind !== 'document') {
      await supabase
        .from('chat_attachments')
        .update({ extraction_status: 'skipped' })
        .eq('id', attachment_id);
      return Response.json({ status: 'skipped', reason: 'not a document' }, { headers: corsHeaders });
    }

    const { data: blob, error: downloadErr } = await supabase.storage
      .from('chat-attachments')
      .download(att.storage_path);

    if (downloadErr || !blob) {
      throw new Error(`download failed: ${downloadErr?.message ?? 'unknown'}`);
    }

    const buffer = new Uint8Array(await blob.arrayBuffer());
    let text = '';

    if (att.mime_type === 'application/pdf') {
      try {
        const pdf = await getDocumentProxy(buffer);
        const result = await extractText(pdf, { mergePages: true });
        text = typeof result.text === 'string' ? result.text : (result.text as string[]).join('\n\n');
      } catch (e) {
        await supabase
          .from('chat_attachments')
          .update({
            extraction_status: 'skipped',
            extraction_error: `pdf parse: ${String(e).slice(0, 300)}`,
          })
          .eq('id', attachment_id);
        return Response.json({ status: 'skipped', reason: 'pdf parse failed' }, { headers: corsHeaders });
      }
    } else if (att.mime_type.startsWith('text/') || att.mime_type === 'application/json') {
      text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    } else {
      await supabase
        .from('chat_attachments')
        .update({
          extraction_status: 'skipped',
          extraction_error: `unsupported mime: ${att.mime_type}`,
        })
        .eq('id', attachment_id);
      return Response.json({ status: 'skipped', reason: 'unsupported mime' }, { headers: corsHeaders });
    }

    const trimmed = text.trim();
    if (!trimmed.length) {
      await supabase
        .from('chat_attachments')
        .update({
          extraction_status: 'skipped',
          extraction_error: 'no extractable text',
        })
        .eq('id', attachment_id);
      return Response.json({ status: 'skipped', reason: 'empty text' }, { headers: corsHeaders });
    }

    const truncated = trimmed.length > MAX_TEXT_LENGTH ? trimmed.slice(0, MAX_TEXT_LENGTH) : trimmed;

    await supabase
      .from('chat_attachments')
      .update({
        extracted_text: truncated,
        extraction_status: 'done',
      })
      .eq('id', attachment_id);

    return Response.json(
      {
        status: 'done',
        text_length: truncated.length,
        truncated: trimmed.length > MAX_TEXT_LENGTH,
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    const msg = String(e).slice(0, 500);
    if (attachment_id) {
      await supabase
        .from('chat_attachments')
        .update({ extraction_status: 'failed', extraction_error: msg })
        .eq('id', attachment_id);
    }
    return Response.json({ status: 'failed', error: msg }, { status: 200, headers: corsHeaders });
  }
});
