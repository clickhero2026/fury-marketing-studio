# Coding Conventions

## React Patterns

### Data Fetching — SEMPRE TanStack Query
```typescript
// CORRETO
const { data, isLoading, error } = useQuery({
  queryKey: ['campaigns', accountId],
  queryFn: () => fetchCampaigns(accountId),
  staleTime: 5 * 60 * 1000,
});

// ERRADO — NUNCA usar useEffect + fetch
useEffect(() => { fetch('/api/campaigns').then(...) }, []); // PROIBIDO
```

### Mutations — TanStack Query + invalidateQueries
```typescript
const queryClient = useQueryClient();
const { toast } = useToast();

const mutation = useMutation({
  mutationFn: (data: CreateCampaign) => supabase.from('campaigns').insert(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    toast({ title: 'Campanha criada com sucesso' });
  },
  onError: (error) => {
    toast({ title: 'Erro ao criar campanha', description: error.message, variant: 'destructive' });
  },
});
```

### 4 Estados Visuais Obrigatorios
Todo componente que busca dados DEVE renderizar:
1. **Loading** — Skeleton ou Spinner
2. **Error** — Mensagem descritiva + botao retry
3. **Empty** — Mensagem amigavel ("Nenhuma campanha encontrada")
4. **Data** — Renderizacao normal dos dados

### Forms — React Hook Form + Zod
```typescript
const schema = z.object({
  name: z.string().min(1, 'Nome obrigatorio'),
  budget: z.number().min(0.01, 'Budget minimo R$0.01'),
});

const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
  defaultValues: { name: '', budget: 0 },
});
```

## Supabase Patterns

### Queries — Especificar colunas (NUNCA select('*'))
```typescript
// CORRETO
const { data } = await supabase
  .from('campaigns')
  .select('id, name, status, spend, impressions')
  .eq('user_id', userId);

// ERRADO
const { data } = await supabase.from('campaigns').select('*'); // PROIBIDO
```

### Apos UPDATE — Nao usar .select().single()
```typescript
// CORRETO
const { error } = await supabase
  .from('campaigns')
  .update({ status: 'paused' })
  .eq('id', campaignId);

// ERRADO — RLS pode bloquear o read-back
const { data } = await supabase
  .from('campaigns')
  .update({ status: 'paused' })
  .eq('id', campaignId)
  .select()
  .single(); // PODE FALHAR COM RLS
```

## UI Patterns

### Componentes — shadcn/ui + cn()
```typescript
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

<Card className={cn('p-4', isActive && 'border-primary')}>
```

### Icons — Sempre Lucide React
```typescript
import { TrendingUp, DollarSign, Eye, MousePointer } from 'lucide-react';
```

### Toast — Descritivo (NUNCA generico)
```typescript
// CORRETO
toast({ title: 'Campanha pausada', description: `"${campaign.name}" foi pausada com sucesso` });

// ERRADO
toast({ title: 'Sucesso!' }); // PROIBIDO — nao diz o que aconteceu
```

## Anti-Patterns a EVITAR

| Anti-Pattern | Porque | Alternativa |
|-------------|--------|-------------|
| `useEffect` + `fetch` | Race conditions, no caching | TanStack Query |
| Prop drilling > 2 niveis | Acoplamento, dificil manutencao | Hooks ou Context |
| Componente > 200 linhas | Dificil de ler e testar | Quebrar em sub-componentes |
| `select('*')` no Supabase | Performance, seguranca | Especificar colunas |
| Toast generico "Erro!" | Usuario nao sabe o que fazer | Mensagem descritiva |
| CSS inline | Projeto usa Tailwind | Classes Tailwind |
| `any` em TypeScript | Sem type safety | `unknown` + type guards |
| `Promise.all` com N requests | Rate limit em APIs externas | Batches de 5 |

---
_Coding conventions enforced across all agents. Update when patterns evolve._
