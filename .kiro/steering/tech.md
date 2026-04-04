# Technology Stack

## Architecture

SPA (Single Page Application) com navegacao por estado (`useState<View>`) em vez de rotas.
Frontend React renderizado no cliente, backend via Supabase (PostgreSQL + Edge Functions).
Integracao com Meta Ads via Graph API v22.0.

## Core Technologies

- **Language**: TypeScript (strict mode)
- **Framework**: React 18 + Vite 5
- **Runtime**: Node.js 20+ / Bun
- **Database**: Supabase (PostgreSQL + RLS)
- **Auth**: Supabase Auth
- **Hosting**: Vite dev server (local) / Deploy TBD

## Key Libraries

| Library | Versao | Proposito |
|---------|--------|-----------|
| TanStack Query v5 | ^5.x | Server state, caching, mutations |
| React Hook Form | ^7.x | Forms com validacao |
| Zod | ^3.x | Schema validation |
| shadcn/ui (Radix) | latest | Design system base |
| TailwindCSS | ^3.x | Styling utility-first |
| Recharts | ^2.x | Graficos e dashboards |
| Lucide React | latest | Icones |
| date-fns | ^3.x | Manipulacao de datas |
| cmdk | latest | Command palette |
| Framer Motion | via tailwindcss-animate | Animacoes |

## Development Standards

### Type Safety
- TypeScript strict mode habilitado
- Nunca usar `any` — preferir `unknown` + type guards
- Tipos definidos em `src/types/` por dominio

### Code Quality
- ESLint configurado
- Imports com path alias `@/` → `src/`
- Componentes max 200 linhas (quebrar em sub-componentes)

### Testing
- Vitest para unit tests
- Playwright para E2E
- Coverage target: >80%

## Development Environment

### Required Tools
- Node.js 20+ ou Bun
- npm ou bun como package manager
- Supabase CLI (para migrations e Edge Functions)

### Common Commands
```bash
# Dev: npm run dev
# Build: npm run build
# Lint: npm run lint
# Test: npm run test
# Test watch: npm run test:watch
```

## Key Technical Decisions

1. **SPA com views em vez de router** — Navegacao via `useState<View>` no `Index.tsx`, sem react-router
2. **Mock data first** — UI construida com dados mock, migrando para Supabase incrementalmente
3. **Supabase como backend completo** — Auth, Database, Edge Functions, Storage, Realtime
4. **shadcn/ui como design system** — Componentes Radix customizados com Tailwind + glassmorphism
5. **TanStack Query para server state** — Nunca usar useEffect+fetch para dados do servidor
6. **Meta Graph API v22.0** — Integracao direta para campanhas, insights, criativos
7. **Idioma da UI**: Portugues (pt-BR)

---
_Document standards and patterns, not every dependency_
