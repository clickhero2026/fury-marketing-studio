# Project Structure

## Organization Philosophy

Feature-first com agrupamento por dominio. Componentes UI na raiz de `components/`, sub-pastas por dominio funcional. Hooks, types e integracoes separados por responsabilidade.

## Directory Patterns

### Views (Paginas Principais)
**Location**: `src/components/*View.tsx`  
**Purpose**: As 4 views principais do SPA (Chat, Dashboard, Criativos, Analise)  
**Example**: `DashboardView.tsx`, `ChatView.tsx`, `CreativesView.tsx`, `AnalysisView.tsx`

### UI Components (Design System)
**Location**: `src/components/ui/`  
**Purpose**: Componentes base shadcn/ui (38+ componentes Radix customizados)  
**Example**: `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`

### Domain Components
**Location**: `src/components/<domain>/`  
**Purpose**: Componentes organizados por dominio funcional  
**Example**: `src/components/auth/`, `src/components/campaigns/`

### Hooks
**Location**: `src/hooks/`  
**Purpose**: Custom hooks (React Query, utilities, auth)  
**Example**: `use-toast.ts`, `use-mobile.tsx`, `use-auth.ts`

### Types
**Location**: `src/types/`  
**Purpose**: TypeScript types organizados por dominio  
**Example**: `src/types/campaigns.ts`, `src/types/meta-ads.ts`

### Integrations
**Location**: `src/integrations/supabase/`  
**Purpose**: Cliente Supabase e types gerados  
**Example**: `client.ts`, `types.ts`

### Contexts
**Location**: `src/contexts/`  
**Purpose**: React Contexts para estado global (auth, theme)  
**Example**: `AuthContext.tsx`

### Pages
**Location**: `src/pages/`  
**Purpose**: Rotas de pagina (Index como layout principal)  
**Example**: `Index.tsx`, `Login.tsx`, `Register.tsx`, `NotFound.tsx`

## Naming Conventions

- **Files (components)**: PascalCase (`DashboardView.tsx`, `AppSidebar.tsx`)
- **Files (hooks)**: kebab-case com prefixo `use-` (`use-toast.ts`, `use-auth.ts`)
- **Files (utils)**: kebab-case (`utils.ts`)
- **Components**: PascalCase (`<DashboardView />`)
- **Functions/hooks**: camelCase (`useAuth()`, `formatCurrency()`)
- **Types/Interfaces**: PascalCase (`Campaign`, `MetricData`)
- **Constants**: UPPER_SNAKE_CASE (`BATCH_SIZE`, `API_VERSION`)

## Import Organization

```typescript
// 1. React/external libs
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Internal (absolute via alias)
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// 3. Types
import type { Campaign } from '@/types/campaigns';

// 4. Relative (same module)
import { MetricCard } from './MetricCard';
```

**Path Aliases**:
- `@/`: Maps to `src/`

## Code Organization Principles

1. **Componentes max 200 linhas** — Quebrar em sub-componentes se ultrapassar
2. **Hooks para logica** — Extrair logica de componentes para hooks customizados
3. **Types por dominio** — Cada dominio tem seu arquivo de types em `src/types/`
4. **4 estados visuais obrigatorios** — Loading, Error, Empty, Data em todo componente que busca dados
5. **Nunca prop drilling > 2 niveis** — Usar hooks ou context
6. **Nunca useEffect + fetch** — Sempre TanStack Query para server state

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
