// ==========================================
// prospecting-ingest — captura de leads inbound
//
// 1) Meta Lead Ads (webhook):
//    GET  → verificação hub.challenge (META_VERIFY_TOKEN)
//    POST → X-Hub-Signature-256 (META_APP_SECRET) → Graph API
//           busca os dados do lead (META_PAGE_TOKEN)
// 2) Genérico assinado (Google Apps Script/n8n futuro):
//    POST com x-worker-secret e payload normalizado
//
// Ambiente e campanha via query string: ?env=sharks_company&campaign=<uuid>
// Dedup: e-mail/telefone no ambiente — existente ganha
// atividade de reengajamento em vez de lead duplicado.
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';
import {
  mapMetaLeadFields, extractMetaLeadIds, findExistingLead,
  createInboundLead, registerReengagement, normalizeEmail, normalizePhone,
} from '../_shared/prospecting/ingest.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ENVS = ['sharks_company', 'estrategos'];
const VALID_SOURCES = ['meta_ads', 'google', 'website', 'api'];
const GRAPH_VERSION = 'v21.0';

async function verifyMetaSignature(raw: string, signature: string, appSecret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return signature === `sha256=${expected}`;
}

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  try {
    const url = new URL(req.url);
    const workerSecret = Deno.env.get('WORKER_SECRET');

    // ── Verificação do webhook Meta ──
    if (req.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe') {
        const verifyToken = Deno.env.get('META_VERIFY_TOKEN');
        if (verifyToken && url.searchParams.get('hub.verify_token') === verifyToken) {
          return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { ...CORS, 'Content-Type': 'text/plain' } });
        }
        return json(403, { error: 'Verify token invalido' });
      }
      return json(405, { error: 'Use POST' });
    }

    if (req.method !== 'POST') return json(405, { error: 'Use POST' });

    const raw = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    let payload: Record<string, unknown>;
    let isMeta = false;

    if (signature) {
      const appSecret = Deno.env.get('META_APP_SECRET');
      if (!appSecret) return json(401, { error: 'META_APP_SECRET nao configurado' });
      if (!(await verifyMetaSignature(raw, signature, appSecret))) return json(401, { error: 'Assinatura Meta invalida' });
      payload = JSON.parse(raw);
      isMeta = true;
    } else {
      if (!workerSecret || req.headers.get('x-worker-secret') !== workerSecret) {
        return json(401, { error: 'Assinatura ausente: informe X-Hub-Signature-256 (Meta) ou x-worker-secret' });
      }
      payload = JSON.parse(raw);
    }

    // ── Ambiente/campanha (query string) ──
    const environment = url.searchParams.get('env') ?? '';
    if (!VALID_ENVS.includes(environment)) {
      return json(400, { error: `env invalido. Use: ${VALID_ENVS.join(', ')} (ex.: ?env=sharks_company)` });
    }
    const campaignId = url.searchParams.get('campaign');
    if (campaignId && !UUID_RE.test(campaignId)) return json(400, { error: 'campaign invalido' });

    const admin = serviceClient();

    // ── Caminho Meta: webhook → Graph API → contatos normalizados ──
    const contacts: Array<{ contact: { name: string; email: string | null; phone: string | null }; message: string | null }> = [];
    if (isMeta) {
      const pageToken = Deno.env.get('META_PAGE_TOKEN');
      if (!pageToken) return json(500, { error: 'META_PAGE_TOKEN nao configurado' });
      const leadRefs = extractMetaLeadIds(payload);
      if (leadRefs.length === 0) return json(200, { ok: true, ignored: true, reason: 'Nenhum leadgen no payload' });

      for (const ref of leadRefs) {
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${ref.leadId}?access_token=${encodeURIComponent(pageToken)}`,
        );
        if (!res.ok) {
          console.error('[ingest] Graph API falhou:', res.status, (await res.text()).slice(0, 200));
          continue;
        }
        const leadData = (await res.json()) as { field_data?: Array<{ name?: string; values?: string[] }> };
        const contact = mapMetaLeadFields(leadData.field_data ?? []);
        if (contact.email || contact.phone) contacts.push({ contact, message: null });
      }
    } else {
      // ── Caminho genérico assinado ──
      const source = String(payload?.source ?? '');
      if (!VALID_SOURCES.includes(source)) return json(400, { error: `source invalido. Use: ${VALID_SOURCES.join(', ')}` });
      const contact = {
        name: String(payload?.name ?? '').trim(),
        email: normalizeEmail(payload?.email as string),
        phone: normalizePhone(payload?.phone as string),
      };
      if (!contact.email && !contact.phone) return json(400, { error: 'Informe email ou phone' });
      contacts.push({ contact, message: payload?.message ? String(payload.message) : null });
    }

    // ── Dedup + criação ──
    const results: Array<{ lead_id: string; created: boolean }> = [];
    for (const item of contacts) {
      const existing = await findExistingLead(admin, environment, item.contact);
      if (existing) {
        await registerReengagement(admin, existing.id, isMeta ? 'meta_ads' : String(payload?.source ?? 'api'), item.message);
        results.push({ lead_id: existing.id, created: false });
        continue;
      }
      const { leadId } = await createInboundLead(admin, {
        environment,
        source: isMeta ? 'meta_ads' : String(payload?.source ?? 'api'),
        campaign_id: campaignId,
        contact: item.contact,
        company: isMeta ? null : payload?.company ? String(payload.company) : null,
        message: item.message,
      });
      results.push({ lead_id: leadId, created: true });
    }

    return json(200, { ok: true, environment, ingested: results.length, created: results.filter(r => r.created).length, results });
  } catch (e) {
    console.error('[prospecting-ingest] uncaught:', (e as Error)?.stack || e);
    return json(500, { error: `Erro interno: ${(e as Error)?.message || String(e)}` });
  }
});
