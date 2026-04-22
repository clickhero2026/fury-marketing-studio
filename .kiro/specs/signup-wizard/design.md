# Design — Signup Wizard

## Arquitetura

### Fluxo

```
[/register]
  └── Register.tsx (state: currentStep 1|2|3 + formData aggregated)
        ├── Step 1: AccountStep — displayName, email, password, confirmPassword
        ├── Step 2: OrganizationStep — orgName, slug, plan
        └── Step 3: ProfileStep — avatarSeed (cor), review card
              └── onSubmit → useAuth.signUp({ ...allFields, plan, avatarSeed })
                    ├── supabase.auth.signUp (trigger cria profile)
                    ├── supabase.functions.invoke('create-organization')
                    ├── if plan !== 'free': supabase.from('organizations').update({ plan })
                    └── supabase.from('profiles').update({ avatar_url: `gradient:${seed}` })
```

### Estado do wizard

Centralizado em um unico `useForm` do react-hook-form com schema Zod completo (todas as
3 etapas). A validacao por etapa usa `form.trigger(['campo1', 'campo2'])` antes de avancar.

### Componente unico vs sub-componentes

Single file (`Register.tsx`) com sub-componentes internos para manter o header de
progresso compartilhado sem prop drilling. Isso mantem o arquivo coeso e facil de
evoluir. Evita 4 arquivos novos para uma feature de 1 pagina.

## Schema Zod

```ts
const signupSchema = z.object({
  // Step 1
  displayName: z.string().min(2, 'Minimo 2 caracteres').max(80),
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
  confirmPassword: z.string(),
  // Step 2
  organizationName: z.string().min(2, 'Minimo 2 caracteres').max(100),
  slug: z.string()
    .min(3, 'Minimo 3 caracteres')
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Apenas minusculas, numeros e hifens'),
  plan: z.enum(['free', 'pro', 'enterprise']),
  // Step 3
  avatarSeed: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Senhas nao conferem', path: ['confirmPassword']
});
```

## Tipos (patch em types/auth.ts)

```ts
export interface SignUpData {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  avatarSeed: string; // ex: 'violet', 'amber', ...
}
```

## AuthContext.signUp (patch)

Apos `create-organization` sucesso:
1. Se `data.plan !== 'free'`: `supabase.from('organizations').update({ plan }).eq('slug', data.slug)` (owner tem UPDATE via RLS).
2. `supabase.from('profiles').update({ avatar_url: 'gradient:' + data.avatarSeed }).eq('id', user.id)`

Erros nao-bloqueantes nessas etapas: log + toast warn, mas nao falhar o signup.

## UI / Visual

### Paleta
- Background: `#0c0d0a` com radial gradient `rgba(207,111,3,0.06)` ja usado no Login
- Card: glassmorphism `bg-[#161714]/80 backdrop-blur-xl border-white/[0.06]`
- Accent: `brand-gradient` (laranja ClickHero)
- Largura: `max-w-md` (step 1, 3) / `max-w-lg` (step 2 — cards de plano)

### Header do wizard
- Logo centralizado
- Stepper horizontal: 3 bolinhas numeradas ligadas por linhas.
  - Bolinha ativa: brand-gradient + ring
  - Bolinha concluida: check verde
  - Bolinha pendente: ring cinza
- Barra de progresso abaixo: `<Progress>` shadcn com value = (step/3)*100

### Step 1 — Conta
- Campos: Nome, Email, Senha, Confirmar senha
- Password strength meter: 4 bars horizontais coloridas conforme forca
  - Regras: length>=8 (1 ponto), mix alfanum (+1), char especial (+1), length>=12 (+1)
  - Cores: red-500 / orange-500 / yellow-500 / green-500

### Step 2 — Organizacao
- Campo Nome da empresa (autogera slug)
- Campo slug com prefixo `clickhero.app/` em gray, input inline minimalista
- 3 Plan Cards (grid-cols-1 md:grid-cols-3):
  - Free — "Comece ja" — Free, R$ 0, Ate 3 campanhas, Dashboard basico
  - Pro — "Mais popular" (badge) — R$ 149/mes, Campanhas ilimitadas, IA avancada, Multi-org
  - Enterprise — "Escala" — Sob consulta, SLA dedicado, White-label, Priority support
- Card selecionado: border brand-gradient + ring + check no canto

### Step 3 — Finalizar
- Avatar grande (size 24 = 96px) no topo com iniciais do displayName
- Grid 6 bolinhas de cor para selecionar gradient seed
  - Seeds: violet, amber, emerald, sky, rose, slate
  - Cada seed mapeia para um `from-X to-Y` tailwind
- Review card: lista com icones + labels (Usuario, Email, Organizacao, Slug, Plano)
- Botao "Criar conta" com loader

## Animacoes

- Transicao entre steps: fade + translate-x (via Tailwind + transition-all)
- Hover nos plan cards: scale-[1.02]
- Active no botao primario: scale-[0.98]
- Progress bar: transition-all duration-500

## Acessibilidade

- Stepper com `aria-current="step"` no step ativo
- Botoes com labels claros (Voltar / Continuar / Criar conta)
- Inputs com autoComplete apropriado
- Keyboard: Enter avanca step se valido; Escape nao faz nada
