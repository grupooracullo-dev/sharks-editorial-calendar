# n8n — Fluxos do Agente de Prospecção (modelagem baseada em templates)

> Estudo de templates reais da comunidade n8n + adaptação ao contrato do
> Oracullo (`prospecting_jobs` → claim/callback com `x-worker-secret`).
> Criado em 2026-09-30.

## 1. Templates estudados (referências)

| Template | O que faz | O que adotamos |
|---|---|---|
| [#12855 — Extract & qualify local business leads + cold emails](https://n8n.io/workflows/12855-extract-and-qualify-local-business-leads-and-draft-cold-emails-with-openai-apify-and-hunter) | Fonte → scrape → extração/normalização por IA → qualificação → CRM com **append-or-update por e-mail** → rascunhos de cold email | **Pipeline de discovery/enrichment completo**; dedup por e-mail; "fonte é substituível" (Apify → BrasilAPI/OSM/import) |
| [#11448 — Automated B2B lead management & AI outreach](https://n8n.io/workflows/11448-automated-b2b-lead-management-and-ai-outreach) | SDR completo: validação (e-mail, supressão, geo/GDPR) → enriquecimento → score/tiering → outreach multicanal com **rate limiting e compliance** → **classificação de intenção das respostas** → event logging → analytics | Validação/supressão antes de tudo; compliance por canal; **reply intent** (Conversation Agent F4); logging de todos os eventos |
| [#9101 — AI lead research & qualification (Relevance AI)](https://n8n.io/workflows/9101-ai-powered-lead-research-and-qualification-using-relevance-ai) | Intake → enriquecimento → score → **roteamento HOT/WARM/COLD por threshold** → outreach por tier → log + alerta de lead quente | Roteamento por threshold = nossos gates de confiança (≥0,7 age · 0,4–0,7 revisa · <0,4 escala) |
| [#9310 — Lead qualification & routing (GPT-4o-mini + Sheets + HighLevel)](https://n8n.io/workflows/9310-automate-lead-qualification-and-routing-with-gpt-4o-mini-google-sheets-and-highlevel-crm) | Sheet de formulários → AI scoring → parse JSON → Hot/Warm/Cold → CRM sync → notifica o responsável | **Padrão do nosso fluxo Google Leads** (lead form extensions → Sheet → n8n → ingest); parse estruturado da IA |
| [#7343 — Lead capture, scoring & CRM (HubSpot + Clearbit + Slack)](https://n8n.io/workflows/7343-automated-lead-capture-scoring-and-crm-integration-with-hubspot-clearbit-and-slack) | Intake → **validação** → enriquecimento → score → roteamento → CRM + notificações | Estrutura da nossa branch **ingest inbound** |
| [#6776 — Company research & enrichment (GPT-4o agent)](https://n8n.io/workflows/6776-automated-company-research-and-lead-enrichment-with-gpt-4o-and-google-sheets) | Agente de pesquisa: nomes de empresas → web → JSON estruturado → sheet | Research Agent (F2/F3) — extração estruturada com output parser |
| [#15616 — Nurture via email/WhatsApp/OpenAI/Sheets](https://n8n.io/workflows/15616-nurture-leads-via-email-whatsapp-openai-and-google-sheets-crm/) | Nutrição multicanal com **audit trail de todo touchpoint** | Cadências (F4) — cada toque vira atividade no CRM |

### Padrões comuns adotados (síntese)

1. **Um workflow "router"** com webhook único + switch por tipo — casa com nosso
   `prospecting_jobs.type` (Switch por `job.type`).
2. **Validação antes de qualquer IA** (supressão, campos mínimos) — nosso Edge
   já valida; n8n reforça com If no primeiro nó.
3. **Dedup append-or-update por e-mail/telefone** — já temos no
   `prospecting-ingest` (reengajamento em vez de duplicado).
4. **Roteamento por threshold** (HOT/WARM/COLD ≈ nossas confianças calibradas).
5. **Todo fim de branch responde ao orquestrador** — no nosso caso, o callback
   HTTP para `prospecting-job-callback` (n8n NUNCA escreve no banco).
6. **Event logging de cada toque** — nossa `crm_lead_activities`.
7. **Humano no loop antes de enviar** (draft → revisão) — nosso nível "Assistido".

## 2. Nossa arquitetura no n8n

```
prospecting-run (Edge, cron 5 min)
   ├─ job de DECISÃO → JEV no Edge (não passa pelo n8n)
   └─ job de I/O ──► n8n WF1 "Oracullo Router" (webhook)
                        ├─ check x-worker-secret
                        ├─ Switch por job.type
                        │    ├─ enrich_company  → BrasilAPI (CNPJ, grátis) → normaliza
                        │    ├─ discover_companies → fonte configurável (F3)
                        │    ├─ generate_message → LLM (F4, rascunho p/ revisão)
                        │    └─ send_message/follow_up → e-mail/WhatsApp (F4, compliance)
                        └─ TODO branch termina em HTTP ► prospecting-job-callback
                                  (job_id + status + output) ──► Supabase ──► Realtime/UI

Meta Lead Ads ──webhook direto──► prospecting-ingest (Edge)   [sem n8n]
Google lead forms ──Sheet──► n8n WF2 "Google Leads" ──► prospecting-ingest
```

- **WF1 `oracullo-router`**: `n8n/oracullo-router.json` (importável).
- **WF2 `google-leads`**: gatilho Google Sheets → POST `prospecting-ingest?env=...`
  com `x-worker-secret` e `source: "google"` (JSON de importação na F3, quando
  a planilha existir).

## 3. Contrato com o n8n (inalterável pelo fluxo)

| Entrada (webhook WF1) | Saída obrigatória (callback) |
|---|---|
| `POST` payload do worker: `{ job_id, type, campaign_id, lead_id, input }` + header `x-worker-secret` | `POST prospecting-job-callback`: `{ job_id, status: completed|failed|retry, output?, error? }` |

- O `x-worker-secret` do n8n deve ser **o mesmo** do Edge (`WORKER_SECRET`) —
  valor em `private.prospecting_config` (banco) = env das funções.
- n8n não tem credenciais de banco. A única porta de escrita é o callback,
  que valida segredo, schema e máquina de estados (trigger no banco).

## 4. Variáveis de ambiente no n8n (self-hosted)

```
WORKER_SECRET=<mesmo valor do Edge>
ORACULLO_EDGE_URL=https://cyumczehpiiarwqrpgnu.supabase.co
```

## 5. Ordem de implantação

1. **WF1 import** (esqueleto já validado no contrato) → configurar env → teste
   manual com payload de exemplo de `enrich_company`.
2. **Branch enrich_company real**: BrasilAPI (grátis) → normalizar → callback.
3. **Google Leads (WF2)**: criar Sheet espelho dos lead forms → trigger → ingest.
4. **F3**: ligar `AI_PROVIDER=jev` no Edge (scoring no worker).
5. **F4**: branches de mensagem/outreach + compliance (supressão/opt-in).
