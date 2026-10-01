# Evolution API (WhatsApp) — guia completo

Objetivo: conectar o **número dedicado de prospecção** ao agente Oracullo
(envio com split-150, conversa automática pós-resposta, transcrição de áudio futura).
Custo: ~$5/mês (1 VPS) — substitui o n8n Cloud trial com a mesma arquitetura.

## 1. Subir a stack no VPS (10 min)

```bash
# 1. VPS Debian/Ubuntu limpo (Hetzner CP11 ~€4/mês ou equivalente)
curl -fsSL https://get.docker.com | sh

# 2. Copiar deploy/docker-compose.yml + deploy/.env.example para o VPS
mkdir -p /opt/oracullo && cd /opt/oracullo
# (scp dos 2 arquivos)
cp .env.example .env && nano .env   # preencha as variáveis

# 3. Subir tudo
docker compose up -d
docker compose logs -f   # aguardar "ready"
```

## 2. Túneis Cloudflare (SSL sem abrir portas) — 10 min

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → Networks → Tunnels → **Create a tunnel** (Cloudflared) → nome `n8n` → copie o **token** para `CF_TUNNEL_TOKEN_N8N`
2. Na configuração do túnel: Public hostname `n8n.seudominio.com` → service `http://n8n:5678`
3. Repita para o `evolution`: token `CF_TUNNEL_TOKEN_EVO` → hostname `evo.seudominio.com` → service `http://evolution:8080`
4. Editar `.env` no VPS com os 2 tokens → `docker compose up -d` (recria)
5. Se o domínio não está no Cloudflare: registre o domínio lá (plano free) antes.

## 3. Conectar o número dedicado (Evolution) — 5 min

Interface: `https://evo.seudominio.com/manager` (senha = `EVOLUTION_API_KEY`):
1. **Create instance** → nome `oracullo-prospeccao` → conexão: **QR Code** → escaneie com o WhatsApp do **número dedicado** (não use o pessoal!)
2. Status: `connected` ✅

## 4. Webhook → n8n

Evolution → Websocket/Webhook: configure **por instância** (via API ou manager):
```bash
curl -X POST https://evo.seudominio.com/webhook/set/oracullo-prospeccao \
  -H 'apikey: EVOLUTION_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"webhook": {"enabled": true, "url": "https://n8n.seudominio.com/webhook/oracullo-conversation", "events": ["MESSAGES_UPSERT"]}}'
```

## 5. Apontar o n8n (workflow Conversation + Router)

No n8n (`https://n8n.seudominio.com`):
- Importar os workflows (igual fizemos no Cloud) e preencher:
  - `Oracullo Conversation`: webhook Evolution já configurado acima
  - **Router** → node `Evolution WhatsApp`: URL → `https://evo.seudominio.com/message/sendText/oracullo-prospeccao` · header `apikey` → `EVOLUTION_API_KEY`
- Publicar tudo

## 6. Cron do worker (o worker continua no Edge do Supabase — nada muda)

O `prospecting-run` do Edge despacha via `N8N_WEBHOOK_URL` → agora o domínio novo:
```bash
npx supabase secrets set N8N_WEBHOOK_URL='https://n8n.seudominio.com/webhook/oracullo-prospecting'
npx supabase secrets set WORKER_SECRET='<o valor escolhido>'
npx supabase functions deploy prospecting-run --project-ref cyumczehpiiarwqrpgnu --no-verify-jwt
```

## 7. Migração do trial

1. Exportar do Cloud: cada workflow → ⋯ → **Export JSON** (ou me peça que eu executo)
2. Importar no n8n do VPS (Import from File)
3. Reapontar URLs/cridentiais — tudo funciona igual

## Checklist final de ativação

- [ ] VPS + compose no ar
- [ ] 2 túneis Cloudflare respondendo (curl -I https://n8n.seudominio.com)
- [ ] Instância evolução conectada (QR escaneado)
- [ ] Webhook set → n8n Conversation
- [ ] Router com URL/Evolution preenchidas '$
- [ ] Publish
- [ ] `N8N_WEBHOOK_URL` atualizada no Edge (comando acima)
- [ ] E2E: job `send_message` de teste → mensagem chega no WhatsApp dedicado ✅
