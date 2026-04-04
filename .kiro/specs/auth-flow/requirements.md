# Requirements: Auth Flow (Supabase Auth)

## Introduction

Implementar autenticacao completa no ClickHero usando Supabase Auth. Atualmente o app nao tem auth — qualquer pessoa acessa todas as views. Este spec define o fluxo de login, registro, logout e protecao de rotas.

## Requirements

### Requirement 1: Registro de Usuario

**Objective:** Como um novo usuario, quero me registrar com email e senha, para acessar o ClickHero e gerenciar minhas campanhas Meta Ads.

#### Acceptance Criteria
1. When o usuario acessa `/register`, the system shall exibir formulario com campos email, senha e confirmacao de senha
2. When o usuario submete o formulario com dados validos, the system shall criar conta via Supabase Auth e redirecionar para `/` (dashboard)
3. If o email ja estiver cadastrado, then the system shall exibir mensagem "Este email ja esta cadastrado"
4. If a senha tiver menos de 6 caracteres, then the system shall exibir mensagem de validacao inline
5. If as senhas nao coincidirem, then the system shall exibir mensagem "As senhas nao coincidem"
6. While o formulario estiver sendo enviado, the system shall desabilitar o botao e exibir "Criando conta..."

### Requirement 2: Login de Usuario

**Objective:** Como um usuario registrado, quero fazer login com email e senha, para acessar minha conta e dados.

#### Acceptance Criteria
1. When o usuario acessa `/login`, the system shall exibir formulario com campos email e senha
2. When o usuario submete credenciais validas, the system shall autenticar via Supabase Auth e redirecionar para `/` (dashboard)
3. If as credenciais forem invalidas, then the system shall exibir mensagem "Email ou senha incorretos"
4. While o login estiver processando, the system shall desabilitar o botao e exibir "Entrando..."
5. The system shall oferecer link para pagina de registro ("Nao tem conta? Registre-se")

### Requirement 3: Logout

**Objective:** Como um usuario logado, quero fazer logout, para encerrar minha sessao com seguranca.

#### Acceptance Criteria
1. When o usuario clica em "Sair" no sidebar, the system shall encerrar sessao via Supabase Auth
2. When o logout for bem-sucedido, the system shall redirecionar para `/login`
3. The system shall limpar cache do TanStack Query ao fazer logout

### Requirement 4: Protecao de Rotas

**Objective:** Como o sistema, quero proteger rotas autenticadas, para que apenas usuarios logados acessem o dashboard e funcionalidades.

#### Acceptance Criteria
1. When um usuario nao autenticado tenta acessar `/`, the system shall redirecionar para `/login`
2. When um usuario autenticado acessa `/login` ou `/register`, the system shall redirecionar para `/`
3. While a sessao estiver sendo verificada, the system shall exibir tela de loading (nao flash de login)
4. The system shall manter sessao ativa via Supabase `onAuthStateChange` listener

### Requirement 5: Contexto de Autenticacao

**Objective:** Como desenvolvedor, quero um AuthContext/hook centralizado, para acessar dados do usuario em qualquer componente.

#### Acceptance Criteria
1. The system shall prover um `AuthProvider` que wrapa toda a aplicacao
2. The system shall prover um hook `useAuth()` que retorna `{ user, session, isLoading, signIn, signUp, signOut }`
3. The hook shall usar `supabase.auth.onAuthStateChange` para manter estado sincronizado
4. When a sessao expirar, the system shall redirecionar para `/login` automaticamente
