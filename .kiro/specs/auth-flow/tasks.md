# Implementation Plan: Auth Flow

## Tasks

- [ ] 1. Criar AuthContext e hook useAuth (P)
  - Criar `src/contexts/AuthContext.tsx` com AuthProvider
  - Criar `src/hooks/use-auth.ts` com hook useAuth
  - Implementar `signIn`, `signUp`, `signOut` via Supabase Auth
  - Implementar `onAuthStateChange` listener
  - Gerenciar estados: user, session, isLoading
  - _Requirements: 5_

- [ ] 2. Criar pagina de Login (P)
  - Criar `src/pages/Login.tsx`
  - Form com React Hook Form + Zod (email, senha)
  - 4 estados visuais: idle, loading, error, success
  - Link para /register
  - Redirect para / se ja autenticado
  - UI com shadcn/ui (Card, Input, Button, Form)
  - _Requirements: 2_

- [ ] 3. Criar pagina de Register (P)
  - Criar `src/pages/Register.tsx`
  - Form com React Hook Form + Zod (email, senha, confirmar senha)
  - Validacao de senha coincidente via Zod refine
  - 4 estados visuais: idle, loading, error, success
  - Link para /login
  - Redirect para / se ja autenticado
  - UI com shadcn/ui (Card, Input, Button, Form)
  - _Requirements: 1_

- [ ] 4. Criar componente ProtectedRoute
  - Criar `src/components/auth/ProtectedRoute.tsx`
  - Verifica `useAuth()` — se loading, mostra spinner
  - Se nao autenticado, redirect para /login
  - Se autenticado, renderiza children
  - _Requirements: 4_

- [ ] 5. Integrar auth no App.tsx e rotas
  - Wrapar App com `<AuthProvider>`
  - Proteger rota `/` com `<ProtectedRoute>`
  - Adicionar rotas `/login` e `/register`
  - Redirect de /login para / se ja autenticado
  - _Requirements: 4_

- [ ] 6. Adicionar logout no AppSidebar
  - Botao "Sair" no sidebar usando `useAuth().signOut`
  - Limpar cache do TanStack Query no logout (`queryClient.clear()`)
  - Toast de confirmacao "Voce saiu com sucesso"
  - _Requirements: 3_

- [ ] 7. Validacao Hulk (GUARDIAN)
  - `npm run build` — sem erros
  - Verificar 4 estados visuais em Login e Register
  - Verificar redirect de rotas protegidas
  - Verificar logout limpa sessao e cache
  - Verificar que nao quebrou Dashboard, Chat, Criativos, Analise
  - _Requirements: 1, 2, 3, 4, 5_
