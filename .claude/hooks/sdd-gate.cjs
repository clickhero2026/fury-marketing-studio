#!/usr/bin/env node
/**
 * SDD Gate — PreToolUse hook for ClickHero
 *
 * Bloqueia criacao de Edge Functions / migrations SEM spec correspondente em .kiro/specs/.
 * Avisa (nao bloqueia) ao editar arquivos ja protegidos por spec, listando a spec relevante.
 *
 * Bypass:
 *   - Arquivo sentinela: .kiro/.fast-track (tocar para pular, removido apos 1 uso)
 *   - Env var SDD_BYPASS=1
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SPECS_DIR = path.join(ROOT, '.kiro', 'specs');
const FAST_TRACK = path.join(ROOT, '.kiro', '.fast-track');

function readJsonStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(buf)); } catch { resolve({}); }
    });
  });
}

function listSpecs() {
  try {
    return fs.readdirSync(SPECS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch { return []; }
}

function specMatchesFile(specName, relPath) {
  // Heuristica: se o nome da spec aparece no caminho OU o arquivo menciona a spec
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  const token = specName.toLowerCase();
  if (norm.includes(token)) return true;
  // Fragmentos curtos: "meta-oauth", "meta-list-assets" etc.
  const parts = token.split('-').filter((p) => p.length >= 4);
  return parts.some((p) => norm.includes(p));
}

function consumeFastTrack() {
  if (fs.existsSync(FAST_TRACK)) {
    try { fs.unlinkSync(FAST_TRACK); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function classify(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  // Protected: Edge Functions + migrations
  if (/^supabase\/functions\/[^/]+\/index\.(ts|js)$/.test(rel)) {
    return { protected: true, kind: 'edge-function', rel };
  }
  if (/^supabase\/migrations\/.+\.sql$/.test(rel)) {
    return { protected: true, kind: 'migration', rel };
  }
  return { protected: false, rel };
}

(async () => {
  const data = await readJsonStdin();
  const toolName = data.tool_name || data.toolName || '';
  const toolInput = data.tool_input || data.input || {};
  const filePath = toolInput.file_path || toolInput.path || '';

  if (!['Write', 'Edit'].includes(toolName)) { process.exit(0); }
  if (!filePath) { process.exit(0); }

  const info = classify(filePath);
  if (!info.protected) { process.exit(0); }

  if (process.env.SDD_BYPASS === '1' || consumeFastTrack()) {
    console.error(`[sdd-gate] bypass ativado para ${info.rel} — lembre de criar spec AS-BUILT depois.`);
    process.exit(0);
  }

  const specs = listSpecs();
  const matching = specs.filter((s) => specMatchesFile(s, info.rel));
  const isCreate = toolName === 'Write' && !fs.existsSync(filePath);

  if (matching.length === 0 && isCreate) {
    // Bloqueio: nova Edge Function / migration sem spec
    const msg = [
      `SDD GATE: criacao bloqueada de ${info.rel}`,
      '',
      `Tipo detectado: ${info.kind} (novo arquivo)`,
      'Nenhuma spec em .kiro/specs/ cobre esse caminho.',
      '',
      'Proximo passo:',
      '  1. Rodar /kiro:spec-init <nome-da-feature>',
      '  2. Escrever requirements + design + tasks',
      '  3. Implementar conforme tasks',
      '',
      'Bypass (fast-track, cria spec AS-BUILT depois):',
      '  - tocar arquivo: touch .kiro/.fast-track',
      '  - ou: SDD_BYPASS=1 em env',
      '',
      `Specs existentes (${specs.length}): ${specs.join(', ')}`,
    ].join('\n');
    process.stderr.write(msg);
    process.exit(2);
  }

  // Edit em arquivo protegido sem spec clara — apenas avisa
  if (matching.length === 0) {
    console.error(`[sdd-gate] AVISO: editando ${info.rel} sem spec clara. Considere documentar a mudanca em .kiro/specs/.`);
  } else {
    console.error(`[sdd-gate] spec relevante: .kiro/specs/${matching[0]}/ — leia antes de editar.`);
  }
  process.exit(0);
})();
