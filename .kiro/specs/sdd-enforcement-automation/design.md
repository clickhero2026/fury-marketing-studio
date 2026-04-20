# SDD Enforcement Automation — Design

> Status: AS-BUILT (2026-04-20)

## Componentes

### 1. Hook script: `.claude/hooks/sdd-gate.cjs`
Node CJS (sem dependencias externas). Le JSON do stdin, extrai `tool_name` e
`tool_input.file_path`, classifica como protected/not-protected e decide.

Matriz de decisao:
| tool_name | file_path | exists? | spec match? | action |
|-----------|-----------|---------|-------------|--------|
| Write | protected | no | any | se match: allow; se nao: BLOCK (exit 2) |
| Write | protected | yes | any | allow (overwrite permitido) |
| Edit | protected | yes | match | allow + log spec |
| Edit | protected | yes | no match | allow + warning |
| * | not protected | * | * | allow |

### 2. Registro em `.claude/settings.json`
```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Write|Edit", "hooks": [
      { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/sdd-gate.cjs" }
    ]}
  ]
}
```

### 3. Steering: `.kiro/steering/sdd-enforcement.md`
Arvore de decisao visual. Loaded em toda sessao via CLAUDE.md steering rule.

### 4. Bypass sentinel: `.kiro/.fast-track`
- Gitignored (ephemera de sessao)
- Deletado no primeiro uso pelo hook
- Uso: `touch .kiro/.fast-track` antes do Write problematico

## Heuristica de match de spec

```js
function specMatchesFile(specName, relPath) {
  const norm = relPath.toLowerCase();
  const token = specName.toLowerCase();
  if (norm.includes(token)) return true;
  const parts = token.split('-').filter((p) => p.length >= 4);
  return parts.some((p) => norm.includes(p));
}
```

Exemplo: spec `meta-oauth-asset-picker` casa com:
- `supabase/functions/meta-oauth-callback/` (via fragmento "meta")
- `src/components/meta/MetaAssetPicker.tsx` (via fragmentos "meta" e "asset")

## Trade-offs

- **Falsos positivos**: path com "meta" casa com qualquer spec "meta-*" — aceitavel
  porque a IA sempre pode listar e escolher a spec certa.
- **Falsos negativos**: spec com nome totalmente diferente do path nao casa.
  Mitigacao: convencao de nomear specs com prefixos consistentes com as pastas.
