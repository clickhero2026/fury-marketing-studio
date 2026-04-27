// Compliance light pre+pos-geracao para criativos.
// Spec: ai-creative-generation (task 3.4 — R10.1, R10.2, R10.3, R10.4, R10.5)
//
// 2 fases:
//   1. PRE-geracao: checa concept/instruction contra blocklist baseline + briefing prohibitions.
//      - briefing_hits: SEMPRE bloqueia (sem override possivel)
//      - baseline severity=block_unless_override: exige flag override
//      - baseline severity=warn: so sinaliza
//   2. POS-geracao: OCR via gpt-4o-mini para detectar texto na imagem; match na blocklist
//      vira compliance_warning=true (nao bloqueia geracao — so alerta)

const OPENAI_VISION_URL = 'https://api.openai.com/v1/chat/completions';
const VISION_MODEL = 'gpt-4o-mini';

export interface BlocklistTerm {
  term: string;
  category: string;
  severity: 'warn' | 'block_unless_override';
}

export interface BriefingProhibitions {
  words: string[];
  topics: string[];
  visualRules: string[];
}

export interface ComplianceTextResult {
  baseline_hits: { term: string; severity: 'warn' | 'block_unless_override' }[];
  briefing_hits: string[];
  /** Bloqueio hard (briefing) — sem override possivel. */
  hard_block: boolean;
  /** Soft block: requer flag explicita override_blocklist_warning. */
  requires_override: boolean;
}

/**
 * Verifica concept + instruction contra blocklist baseline + briefing prohibitions.
 * Lower-case + word-boundary basico para evitar match parcial confuso.
 */
export function checkComplianceText(
  concept: string,
  instruction: string | undefined,
  briefing: BriefingProhibitions,
  blocklist: BlocklistTerm[],
): ComplianceTextResult {
  const haystack = `${concept} ${instruction ?? ''}`.toLowerCase();

  // 1) Briefing prohibitions — bloqueio hard
  const briefingTerms = [
    ...briefing.words,
    ...briefing.topics,
    ...briefing.visualRules,
  ].map((s) => s.toLowerCase().trim()).filter((s) => s.length > 0);

  const briefing_hits: string[] = [];
  for (const term of briefingTerms) {
    if (haystack.includes(term)) {
      briefing_hits.push(term);
    }
  }

  // 2) Blocklist baseline
  const baseline_hits: ComplianceTextResult['baseline_hits'] = [];
  for (const entry of blocklist) {
    const t = entry.term.toLowerCase().trim();
    if (haystack.includes(t)) {
      baseline_hits.push({ term: entry.term, severity: entry.severity });
    }
  }

  const hard_block = briefing_hits.length > 0;
  const requires_override = !hard_block
    && baseline_hits.some((h) => h.severity === 'block_unless_override');

  return { baseline_hits, briefing_hits, hard_block, requires_override };
}

export interface OcrCheckResult {
  detected_text: string;
  ocr_hits: string[];
  has_warning: boolean;
}

/**
 * OCR pos-geracao: chama gpt-4o-mini com a imagem, extrai texto visivel,
 * confronta com a blocklist (so warn — nunca bloqueia o criativo aqui).
 */
export async function runOcrCheck(
  imageBytes: Uint8Array,
  mimeType: string,
  blocklist: BlocklistTerm[],
  openaiKey: string,
): Promise<OcrCheckResult> {
  let binary = '';
  for (let i = 0; i < imageBytes.length; i += 8192) {
    binary += String.fromCharCode(...imageBytes.subarray(i, i + 8192));
  }
  const b64 = btoa(binary);
  const dataUrl = `data:${mimeType};base64,${b64}`;

  let detected = '';
  try {
    const resp = await fetch(OPENAI_VISION_URL, {
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
            content:
              'Voce extrai EXATAMENTE o texto visivel em uma imagem. Retorne JSON {"text": "..."} com todo o texto literal que aparece na imagem em uma string unica. Se nao houver texto, retorne {"text": ""}.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extraia o texto desta imagem.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
        max_tokens: 400,
      }),
    });
    if (resp.ok) {
      const json = await resp.json();
      const raw = json.choices?.[0]?.message?.content ?? '{}';
      try {
        detected = (JSON.parse(raw).text as string | undefined) ?? '';
      } catch { /* keep '' */ }
    }
  } catch {
    // OCR falhou — segue sem warning (criativo nao bloqueia por isso)
  }

  const haystack = detected.toLowerCase();
  const ocr_hits: string[] = [];
  for (const entry of blocklist) {
    if (haystack.includes(entry.term.toLowerCase())) {
      ocr_hits.push(entry.term);
    }
  }

  return {
    detected_text: detected,
    ocr_hits,
    has_warning: ocr_hits.length > 0,
  };
}
