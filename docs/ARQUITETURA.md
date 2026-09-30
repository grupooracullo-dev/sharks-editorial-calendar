# Oracullo Calendar — Arquitetura da Aplicação

> Referência viva do produto. Atualizada em 2026-09-29 (auditoria completa).

## 1. Objetivo

O **Oracullo Calendar** (`agenda.grupooracullo.com`) é a plataforma da **Grupooracullo** para planejar, aprovar e operacionalizar conteúdo de marketing de clientes agência↔cliente. Substitui planilhas e grupos de WhatsApp por um calendário editorial multi-ambiente com:

- **Planejamento** de ações de conteúdo (calendário, campanhas, pilares editoriais, modelos)
- **Colaboração** entre equipe e clientes (chat, aprovações, histórico, notificações)
- **Comercial** (CRM: leads → conversão → clientes recorrentes)
- **Governança** (guardião Oracullo com visão consolidada de acessos e time)

## 2. Ambientes e personas

| Ambiente | Rotas | Quem usa | O que faz |
|---|---|---|---|
| **Sharks Company** (`/sharks/*`) | Agência (staff) | admin + time | Calendário, campanhas, linha editorial, modelos, produtos (cliente e catálogo), chat, histórico, CRM, clientes, time, acessos, integrações, configurações |
| **Estrategos** (`/estrategos/*`) | Consultoria (staff) | admin + time | Calendário, projetos, reuniões, implementações, produtos, CRM, chat, clientes (admin), time, acessos, integrações |
| **Cliente** (`/client/*`) | Cliente final | role `client` | Início, calendário (visão do próprio workspace), chat, histórico, integrações (Google próprio) |
| **Oracullo** (`/oracullo/*`) | Guardião | `oracullo_admin` | Visão geral, CRM consolidado (Sharks+Estrategos), acessos, solicitações, usuários, time, clientes |

O switcher de ambiente fica na sidebar (emoji + nome) e a home é decidida pelo perfil (`useHomePath` em `src/App.tsx`).

## 3. Stack

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (CSS-first, `@theme` em `src/index.css`), react-router v7, lucide-react, sonner (toasts), date-fns. Code-splitting por rota (`lazyPage` com recuperação de chunk obsoleto).
- **Backend**: Supabase (Postgres + RLS + Realtime + Auth) — 100% das tabelas com RLS.
- **Edge Functions** (Deno, `verify_jwt=false` + auth manual com token do usuário): 11 ativas.
- **Deploy**: GitHub → Vercel (auto-deploy na `main`). Branch de trabalho `codex/fix-calendar-access-responsibles` → cherry-pick para `main`.
- **Testes**: `node --test tests/*.test.mjs` (regressões de serviços e greps estruturais) + `npm run typecheck`.

## 4. Estrutura do projeto

```
src/
  pages/{sharks,estrategos,client,oracullo,auth,legal}/   # páginas (lazy por rota)
  components/{ui,layout,actions,chat,calendar,crm,access,products,dashboard}/
  hooks/            # useActions, useCampaigns, useEditorial, useChat, useLeads, useEnvProducts...
  lib/              # actionService, supabase, constants, permissions, crmStages, weekGenerator...
  contexts/         # AuthContext, WorkspaceContext, NotificationContext
  types/            # Action, Campaign, EnvironmentType...
supabase/
  migrations/       # 001–066 (SQL puro, aplicado via db query --linked)
  functions/        # Edge Functions
tests/              # node:test (regressões)
docs/               # esta documentação
```

## 5. Funcionalidades por módulo

### 5.1 Calendário (Sharks + Estrategos + Cliente)
- Visão mês/semana com drag-and-drop (@dnd-kit) de ações entre dias
- **Gerador de semana** (`weekGenerator.ts`): distribui a frequência do perfil editorial entre dias permitidos, usando pilares, campanhas, datas estratégicas e canais padrão
- Status com fluxo de aprovação (`draft → briefing → in_production → sharks_review → … → published`), ações atrasadas (sweep diário), sync bidirecional com Google Calendar por usuário
- Ações N:N com **responsáveis** (RPC `set_action_responsibles`) e **produtos do cliente** (`action_products`); campanha, pilar editorial, formato, canal, objetivo, etapa de funil, briefing (hook, mensagem, copy, CTA, referências)

### 5.2 Campanhas e Linha Editorial
- Campanhas com período, objetivo, prioridade e cor (usadas no calendário)
- Pilares editoriais por workspace (percentual, ordem) + **perfil editorial** (frequência semanal, dias permitidos, formatos/objetivos, distribuição) — alimentam o gerador

### 5.3 Modelos
- Templates de calendário (`calendar_templates`) com regras de distribuição

### 5.4 Produtos (2 catálogos — migration 065)
- **Catálogo do ambiente** (`environment_products`): serviços/produtos da agência por ambiente; é dele que os **leads** selecionam o interesse (multi-seleção)
- **Produtos do cliente** (`products` por workspace): catálogo do cliente, vinculado às **ações** (N:N) e ações legadas (`product_id` sincronizado ao 1º)

### 5.5 CRM (migration 064)
- Pipeline **Kanban** por ambiente (6 etapas fixas: Novo → Em contato → Proposta enviada → Negociação → Ganho/Perdido) com drag-and-drop, totais por coluna e barra de filtros
- Cards estilo pipeline: valor em destaque, recorrência mensal, responsável + tempo relativo, última atividade
- **Conversão**: soltar em "Ganho" abre modal → Edge Function `crm-convert-lead` cria o **workspace** na org do ambiente, vincula o lead e registra na timeline
- **Timeline** por lead (`crm_lead_activities`: nota, ligação, reunião, e-mail, mudança de etapa, sistema)
- Aba **Clientes**: leads convertidos com recorrência (base do cliente recorrente)
- Oracullo: visão consolidada com filtro Todos/Sharks/Estrategos
- RLS: staff do ambiente lê/escreve, admin exclui; clientes nunca veem CRM

### 5.6 Chat
- Threads por workspace (cliente ↔ equipe), tempo real (`chat_messages`), contagem de não lidas (`chat_thread_reads`), nome do remetente e status de leitura

### 5.7 Time e acessos
- Time por ambiente com **permissões por módulo** (`team_member_access` — catálogo em `src/lib/permissions.ts`, espelhado nas Edge Functions)
- **Solicitação de acesso** pública → aprovação/rejeição por admin (Edge Functions, criação de usuário auth + perfil + memberships + e-mail com senha temporária)
- Vincular/desvincular usuário↔ambiente, mudar papel, mover cliente de workspace, excluir usuário
- Auditoria de acessos (`access_histories`) visível a admins

### 5.8 Integrações
- OAuth Google por usuário (`google-oauth-start` / `google-oauth-callback`) e sincronização bidirecional (`google-sync`, fila `calendar_sync_queue`, locks `sync_locks`, mapas `calendar_event_links`)
- Diagnóstico operacional: `gcal-audit` (invocação manual via curl)

### 5.9 Notificações e auditoria
- `notifications` com dedupe por triggers + badge no header (TopHeader)
- `audit_logs` alimentado por triggers do banco

## 6. Modelo de dados (32 tabelas)

**Identidade e acesso**: `users`, `user_environments` (papel por ambiente), `organizations` (1 por ambiente), `workspaces` (clientes, FK organization), `memberships` (usuário↔workspace, role enum), `team_member_access` (permissões globais do usuário), `access_requests`, `access_histories`, `audit_logs`

**Conteúdo**: `actions` (núcleo, por workspace+environment), `action_responsibles`, `action_products`, `action_partners`, `campaigns`, `editorial_pillars`, `editorial_profiles`, `calendar_templates`, `strategic_dates`, `products` (cliente), `environment_products` (agência por ambiente), `partners`, `attachments` *(removida em 066)*

**CRM**: `crm_leads` (+ colunas de análise `ai_*` reservadas), `crm_lead_activities`, `crm_lead_products`

**Chat**: `chat_threads`, `chat_messages`, `chat_thread_reads`

**Integração Google**: `calendar_integrations`, `calendar_sync_queue`, `calendar_event_links`, `sync_locks`

**Notificações**: `notifications`

**Consultoria (Estrategos)**: `estrategos_projects`, `estrategos_meetings`, `estrategos_implementations`

### Helpers RLS ( SECURITY DEFINER, search_path fixado)
`is_guardian`, `is_oracullo_admin`, `is_sharks_admin/team`, `is_env_admin/staff`, `has_env_access`, `ws_visible`, `ws_env_allows_write`, `ws_environment`, `ws_env_map`, `env_role` — padrões `(select auth.uid())` nas policies para uso de initplan.

## 7. Edge Functions (11)

| Função | Papel | Chamada por |
|---|---|---|
| `google-oauth-start` / `google-oauth-callback` | OAuth Google por usuário | app / redirect Google |
| `google-sync` | Sync bidirecional (fila + locks) | cron/scheduler |
| `gcal-audit` | Diagnóstico de integrações | manual (curl) |
| `admin-create-user` | Cria usuário + perfil + env + memberships (+ e-mail) | Time |
| `admin-update-user` | Nome, permissões e clientes por ambiente | Time |
| `admin-delete-user` | Exclusão permanente | Time |
| `admin-approve-access-request` / `admin-reject-access-request` | Aprovação/rejeição de acesso | Solicitações |
| `admin-link-user-env` | Vincular/desvincular ambiente (atômico) | Time/Oracullo |
| `crm-convert-lead` | Lead → cliente (workspace) | CRM |

Padrão: CORS por request, auth via `Authorization: Bearer <jwt>` + `serviceClient()`, `try/catch` global retornando JSON com CORS, `VALID_*` espelhando o front.

## 8. Convenções

- **Design**: primary `#0066FF`; controles `rounded-lg`, cards/modais `rounded-xl`; foco `focus-visible:ring-primary-500`; refino sóbrio (Linear/Vercel); Tailwind v4 CSS-first
- **Migrations**: SQL numerado `0NN_descricao.sql`, idempotente quando possível, aplicado com `npx supabase db query --linked --file` (ver seção "Histórico de migrations" na auditoria)
- **Edge Function**: ver padrão acima; nunca confiar no client — validar permissão no servidor
- **N:N no service**: delete+insert direto (padrão `action_partners`/`action_products`); responsáveis via RPC
- **Realtime**: 1 canal global por domínio (actions, leads, chat, catálogo) + reload por escopo
- **Commits**: branch `codex/...` → commit → cherry-pick explícito do hash para `main` → push (Vercel deploya)
