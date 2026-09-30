# Auditoria Completa — 2026-09-29

> Varredura de toda a aplicação (código + banco) em busca de elementos desnecessários, riscos e pendências. Método: greps de referência cruzada (`from('tabela')`, `functions.invoke`, imports), `pg_stat_user_tables`, `pg_policies`, `pg_proc`, `pg_stat_user_indexes`, `migration list`.

## 1. Inventário

### 1.1 Banco (32 tabelas após limpeza)

| Tabela | Uso no código | Linhas | Status |
|---|---|---|---|
| users, workspaces, memberships, user_environments, team_member_access, organizations | núcleo | 14/24/40/19/63/2 | ✅ |
| actions, action_responsibles, action_products, campaigns, editorial_pillars, editorial_profiles | núcleo conteúdo | 128/83/8/1/144/19 | ✅ |
| calendar_integrations, calendar_sync_queue, calendar_event_links, sync_locks | internas do sync Google (Edge) | 8/1.158/252/0 | ✅ ver §3.4 |
| calendar_templates, strategic_dates | calendário | 4/731 | ✅ |
| chat_threads, chat_messages, chat_thread_reads | chat | 24/1/1 | ✅ |
| products, environment_products | produtos (cliente / ambiente) | 7/0 | ✅ (065 novo) |
| crm_leads, crm_lead_activities, crm_lead_products | CRM | 0/0/0 | ✅ (064 novo, sem dados ainda) |
| access_requests, access_histories | acessos | 16/13 | ✅ |
| notifications, audit_logs | sistema | 260/2.440 | ✅ ver §3.4 |
| estrategos_projects / meetings / implementations | consultoria | 1/0/0 | ⚠️ ver §3.5 |
| partners | parceiros | 0 | ⚠️ ver §3.6 |
| ~~attachments~~ | — | 0 | 🗑️ **removida (066)** |

### 1.2 Edge Functions (11 após limpeza)

| Função | Invocada no src | Status |
|---|---|---|
| google-oauth-start / google-oauth-callback / google-sync / gcal-audit | app / redirect / cron / manual | ✅ |
| admin-create-user / update / delete / link-user-env / approve / reject-access-request | sim | ✅ |
| crm-convert-lead | sim | ✅ |
| ~~admin-env-access~~, ~~admin-move-client-env~~ | 0 referências | 🗑️ **removidas** (substituídas por admin-link-user-env/admin-update-user) |

### 1.3 Dependências npm

| Pacote | Refs | Status |
|---|---|---|
| react-hook-form, zod, @hookform/resolvers | 0 | 🗑️ **removidos** |
| @dnd-kit/sortable, @dnd-kit/utilities | 0 (só `core` é usado em SharksCalendar) | 🗑️ **removidos** |
| @dnd-kit/core, @supabase/supabase-js, react, react-dom, react-router-dom, date-fns, lucide-react, sonner, clsx, tailwind-merge | usados | ✅ |

### 1.4 Rotas × menu

- ✅ Todas as rotas de `src/App.tsx` têm origem em página real e guard (`SharksLayout`/`ClientLayout`/`EstrategosLayout`/`OraculloLayout`)
- ⚠️ `/sharks/partners` tem rota e página, mas **não está no menu** (`navItems.ts`) — ver §3.6
- 🗑️ `/client/estrategos` **não existia como rota** — apontada pelo switcher e por fallback de nav no `AppSidebar` → **limpado** (entrada do switcher para cliente sem portal removida)

## 2. Achados e ações

### P1 — Histórico de migrations quebrado (RISCO — não executado)

`supabase migration list` mostra deriva em duas direções:

1. **Remoto tem 10 migrations `2026*` (28–31/08) sem arquivo local** — aplicadas antes do padrão de arquivos numerados
2. **~60 arquivos locais (003…065) aplicados via `db query` não estão no histórico remoto** — um `supabase db push` tentaria **reaplicar tudo** (quebrando)
3. Numeração duplicada local: **2× `056`** (`team_scoped_access`, `validate_action_responsibles`) e **2× `061`** (`products_partners`, `hardening_users_access`); faltam `002` e `033`

**Estratégia de repair recomendada (manual, com backup):**

```bash
# 1. backup lógico
npx supabase db dump --linked -f backup_pre_repair.sql
# 2. marcar os locais como aplicados (um comando por arquivo, na ordem)
npx supabase migration repair --linked --status applied 20260101000003   # exemplo: 003
# 3. deletar do histórico remoto as 10 migrations timestamp órfãs (ou criar arquivos locais espelho vazios)
npx supabase migration repair --linked --status reverted 20260828180058
# 4. validar com `migration list` até não restar divergência
```

Recomenda-se também renomear os pares duplicados (ex.: `056b_…`, `061b_…`) apenas no repositório (a numeração não é usada pelo banco, pois o apply é manual).

### P2 — Limpeza executada nesta auditoria ✅

| Item | Ação | Evidência prévia |
|---|---|---|
| `attachments` | `DROP TABLE` (migration 066) | 0 linhas, 0 refs, 0 FKs de entrada, 0 objetos no storage |
| `admin-env-access`, `admin-move-client-env` | `functions delete` remoto + dirs locais | 0 referências no src |
| `useChannels` + `channels` no gerador | hook e prop removidos; `weekGenerator` usa `DEFAULT_CHANNELS` (mesmas opções do formulário — antes caía no fallback fixo "Instagram" com warning enganoso) | tabela `channels` com 0 linhas |
| Rota morta `/client/estrategos` | removida do switcher/fallback do `AppSidebar` | nenhum `Route` correspondente |
| 5 dependências mortas | `npm uninstall` | 0 referências |

### P3 — Backlog de produto (documentado, não executado)

1. **Parceiros**: página existe (`/sharks/partners`), fora do menu, sem UI de vínculo nas ações (a junção `action_partners` nunca é populada — hoje 0 linhas). Decidir: expor no menu + multi-seleção nas ações (padrão produtos) **ou** remover o módulo
2. **Navegação de notificação**: clique em notificação não navega (`NotificationContext` sem `navigate`) — definido o alvo por tipo de notificação
3. **`?search=` nos calendários**: parâmetro documentado no fluxo de deep-link mas nunca lido (0 `useSearchParams`)
4. **Retenção de dados** (crescimento sem política): `audit_logs` 2.440 linhas, `calendar_sync_queue` 1.158 (limpa em sucesso, mas mantém pendentes antigos), `calendar_event_links` 252. Sugestão: job mensal `DELETE … WHERE created_at < now() - interval '12 months'` para audit/logs e `WHERE status='done'` para a fila
5. **Adoção Estrategos**: Projetos/Reuniões/Implementações praticamente sem dados (0–1 linha) — confirmar com o time se os módulos serão usados ou recolhidos para o menu
6. **`gcal-audit`**: manter como ferramenta operacional (invocação manual com curl); documentar uso

## 3. Pontos positivos encontrados

- **RLS habilitado em 100% das tabelas** (33/33 no momento da varredura) com helpers SECURITY DEFINER e `search_path` fixado (nenhuma exceção)
- Nenhum índice sem uso (`idx_scan = 0` em FKs) e nenhum índice redundante detectado
- Edge Functions seguem padrão consistente (auth manual + CORS por request + try/catch com JSON), `verify_jwt=false` apenas nas que validam token manualmente
- Code-splitting por rota com recuperação de chunk obsoleto; realtime com canal único por domínio e limpeza no logout
- Suíte de regressões cobre os fluxos mais sensíveis (atribuição de responsáveis, guards de rota, precedência cliente×Sharks nos menus)

## 4. Métricas no fechamento

- **Banco**: 32 tabelas ativas, 100% com RLS; 0 tabelas mortas
- **Edge Functions**: 11 ativas, todas invocadas por app/cron/redirect/manual
- **Dependências**: 10 runtime (antes 15), 5 dev
- **Rotas**: 26 protegidas por layout + legais + auth
- **Testes**: 7/7 · typecheck limpo · build ok
