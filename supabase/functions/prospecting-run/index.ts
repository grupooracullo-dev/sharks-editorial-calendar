// ==========================================
// prospecting-run — worker do Prospecting Engine
//
// Chamado pelo pg_cron (a cada 5 min) com x-worker-secret
// (mesmo padrão do google-sync). Executa jobs de DECISÃO
// (IA) e encaminha jobs de I/O externo (n8n, F4).
// Auth: apenas x-worker-secret. Nunca chamado pelo client.
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';
import { getAIProvider, hasRealAI } from '../_shared/prospecting/ai.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

interface JobRow {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  type: string;
  status: string;
  input: Record<string, unknown>;
}

async function failJob(admin: ReturnType<typeof serviceClient>, jobId: string, error: string) {
  await admin.from('prospecting_jobs').update({ status: 'failed', error, completed_at: new Date().toISOString() }).eq('id', jobId);
}

async function completeJob(admin: ReturnType<typeof serviceClient>, jobId: string, output: Record<string, unknown>) {
  await admin.from('prospecting_jobs').update({ status: 'completed', output, error: null, completed_at: new Date().toISOString() }).eq('id', jobId);
}

/** Job de decisão: analisa o lead com o AIProvider e grava ai_* + timeline. */
async function processAnalysis(admin: ReturnType<typeof serviceClient>, job: JobRow) {
  const leadId = job.lead_id ?? (typeof job.input?.lead_id === 'string' ? job.input.lead_id : null);
  if (!leadId) throw new Error('Job de análise sem lead_id');

  const { data: lead, error: leadErr } = await admin
    .from('crm_leads')
    .select('id, name, segment, location, company_size, notes, contact_email, contact_phone')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) throw new Error(`Buscar lead: ${leadErr.message}`);
  if (!lead) throw new Error('Lead não encontrado para análise');

  const { data: prodRows } = await admin
    .from('prospecting_campaign_products')
    .select('product:environment_products(name)')
    .eq('campaign_id', job.campaign_id);
  const products = ((prodRows ?? []) as Array<{ product?: { name?: string } }>).map(r => r.product?.name).filter((n): n is string => !!n);

  const analysis = await getAIProvider().analyzeCompany(
    {
      name: lead.name,
      segment: lead.segment,
      location: lead.location,
      company_size: lead.company_size,
      signals: (Array.isArray(job.input?.signals) ? job.input.signals : []) as string[],
      notes: lead.notes,
    },
    products,
  );

  const { error: upErr } = await admin
    .from('crm_leads')
    .update({
      ai_fit: analysis.icpFit,
      ai_priority: analysis.priority,
      ai_next_step: analysis.nextAction,
      ai_data: {
        confidence: analysis.confidence,
        product_scores: analysis.productScores,
        rationale: analysis.rationale ?? null,
        provider: getAIProvider().name,
      },
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq('id', leadId);
  if (upErr) throw new Error(`Atualizar ai_*: ${upErr.message}`);

  await admin.from('crm_lead_activities').insert({
    lead_id: leadId,
    type: 'system',
    content: `Score calculado pela IA — fit ${(analysis.icpFit * 100).toFixed(0)}%, prioridade ${analysis.priority}, próximo passo: ${analysis.nextAction.replace('_', ' ')}.`,
  });

  await completeJob(admin, job.id, {
    icp_fit: analysis.icpFit,
    priority: analysis.priority,
    next_action: analysis.nextAction,
    product_scores: analysis.productScores,
  });
}

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json(405, { error: 'Use POST' });

    const workerSecret = Deno.env.get('WORKER_SECRET');
    if (!workerSecret || req.headers.get('x-worker-secret') !== workerSecret) {
      return json(401, { error: 'Worker secret invalido' });
    }

    const admin = serviceClient();

    // 1. Reencolar jobs travados em processing (> 15 min sem callback)
    const stuckBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await admin
      .from('prospecting_jobs')
      .update({ status: 'retry', error: 'Timeout do processador' })
      .eq('status', 'processing')
      .lt('started_at', stuckBefore);

    // 2. Claim atômico (FOR UPDATE SKIP LOCKED na função)
    const { data: jobs, error: claimErr } = await admin.rpc('claim_prospecting_jobs', { p_limit: 10 });
    if (claimErr) throw new Error(`Claim: ${claimErr.message}`);

    let analyzed = 0;
    let dispatched = 0;
    let failed = 0;

    for (const job of ((jobs ?? []) as unknown as JobRow[])) {
      try {
        if (job.type === 'analyze_company' || job.type === 'score_company') {
          if (!hasRealAI()) {
            await failJob(admin, job.id, 'IA real não configurada (defina TYPESAFE_API_KEY e AI_PROVIDER=jev)');
            failed++;
            continue;
          }
          await processAnalysis(admin, job);
          analyzed++;
        } else {
          // I/O externo (discovery/enrich/message/send/follow-up) → n8n (F4)
          const n8nUrl = Deno.env.get('N8N_WEBHOOK_URL');
          if (!n8nUrl) {
            await failJob(admin, job.id, 'Integrador externo (n8n) não configurado — defina N8N_WEBHOOK_URL');
            failed++;
            continue;
          }
          await fetch(n8nUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-worker-secret': workerSecret },
            body: JSON.stringify({ job_id: job.id, type: job.type, campaign_id: job.campaign_id, lead_id: job.lead_id, input: job.input }),
          });
          dispatched++; // permanece 'processing' até o callback
        }
      } catch (jobErr) {
        console.error('[prospecting-run] job falhou:', jobErr);
        await failJob(admin, job.id, jobErr instanceof Error ? jobErr.message : String(jobErr));
        failed++;
      }
    }

    return json(200, { ok: true, claimed: jobs?.length ?? 0, analyzed, dispatched, failed });
  } catch (e) {
    console.error('[prospecting-run] uncaught:', (e as Error)?.stack || e);
    return json(500, { error: `Erro interno: ${(e as Error)?.message || String(e)}` });
  }
});
