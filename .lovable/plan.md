

# Plano: Refatoracao Visual Completa + Fix de Build

O projeto tem erros de build que precisam ser corrigidos primeiro, e depois faremos o polish visual completo.

---

## Fase 1 — Corrigir erros de build (pre-requisito)

Os erros vem de tipos Supabase desatualizados. Tabelas como `meta_ad_accounts`, `meta_pages`, e colunas como `auto_takedown_enabled` em `companies` nao existem no types.ts gerado.

1. **DashboardView.tsx** — Cast da query `meta_ad_accounts` com `as any` para contornar tipo inexistente
2. **AdStep.tsx** — Mesmo fix para query `meta_pages`
3. **ComplianceSettings.tsx** — Cast da query `companies` com `as any` para colunas nao mapeadas
4. **MetaAccountSelector.tsx** — O tipo `AssetsHierarchy` ja tem `ad_accounts` nos businesses, mas o componente tenta acessar `assets.ad_accounts` direto. Corrigir para usar `assets.personal_ad_accounts` e flatten dos businesses
5. **Edge Functions (ai-chat, meta-sync)** — Cast `supabaseAdmin` com `as any` nos parametros de funcao para contornar incompatibilidade de tipos do client

---

## Fase 2 — Polish visual global

Manter o tema ClickHero (preto #0c0d0a, branco #ecedef, laranja #cf6f03) mas tornar tudo mais refinado, compacto e elegante.

### 2.1 — Sidebar mais compacta e animada
- Icones de 18px para 16px
- Texto de 13px para 12px
- Padding reduzido nos items (py-2 para py-1.5)
- Logo menor (h-7 para h-6)
- Hover com transicao suave de background + scale sutil
- Botao "Nova conversa" mais compacto

### 2.2 — Login e Register mais elegantes
- Inputs mais compactos (h-11 para h-10)
- Animacao de entrada staggered (cada campo aparece com delay)
- Icone decorativo sutil no topo (em vez de so logo)
- Tipografia mais fina nos labels
- Efeito de glow sutil no card ao hover

### 2.3 — Dashboard KPI cards mais limpos
- Valor numerico com font-size ligeiramente menor mas com mais peso
- Icones dos KPIs de 18px para 15px
- Background do icone mais sutil
- Spacing interno reduzido (p-5 para p-4)

### 2.4 — PageHeader mais compacto
- Titulo de text-display-sm para text-2xl
- Descricao mais discreta
- Menos padding bottom (pb-6 para pb-4)

### 2.5 — Animacoes globais
- Adicionar `animate-fade-in` com translateY(4px) mais sutil (era 6px)
- Transicao de pagina (fade + slide sutil ao trocar de view)
- Hover lift em cards clicaveis (translateY(-1px) + shadow increase)
- Button press scale de 0.98 global
- Skeleton shimmer mais rapido e sutil

### 2.6 — Tipografia geral
- Body text de 14px para 13px onde aplicavel
- Labels e captions de 13px para 12px
- Muted text com opacity mais consistente (50% em vez de variar)
- Letter-spacing tighter em headings

### 2.7 — Cards e componentes
- Border radius mais consistente (rounded-xl global)
- Shadows mais sutis (shadow-e1 default, shadow-e2 hover)
- Borders mais finas e transparentes
- Glass card com backdrop-blur mais sutil

---

## Fase 3 — Commit e verificacao

- Build verde obrigatorio
- Verificar que nenhuma funcionalidade quebrou
- Apenas mudancas visuais, zero mudanca de logica

---

## Arquivos que serao editados

| Arquivo | Mudanca |
|---|---|
| `src/index.css` | Ajustar tokens, animacoes, utilities |
| `src/components/AppSidebar.tsx` | Sidebar compacta |
| `src/pages/Login.tsx` | Visual refinado |
| `src/pages/Register.tsx` | Visual refinado |
| `src/components/dashboard/KpiCard.tsx` | KPI compacto |
| `src/components/shared/PageHeader.tsx` | Header compacto |
| `src/components/DashboardView.tsx` | Fix tipos + visual |
| `src/components/publisher/AdStep.tsx` | Fix tipos |
| `src/components/compliance/ComplianceSettings.tsx` | Fix tipos |
| `src/components/meta/MetaAccountSelector.tsx` | Fix tipos |
| `supabase/functions/ai-chat/index.ts` | Fix tipos |
| `supabase/functions/meta-sync/index.ts` | Fix tipos |
| `tailwind.config.ts` | Ajustes de animacao |

