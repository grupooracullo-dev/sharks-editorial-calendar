// ==========================================
// prospecting-job-callback — encerra jobs externos
//
// Recebe o resultado de executores externos (n8n) para jobs
// marcados como 'processing' pelo prospecting-run.
// Auth: x-worker-secret. Idempotente: callback tardio é ignorado.
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json(405, { error: 'Use POST' });

    const workerSecret = Deno.env.get('WORKER_SECRET');
    if (!workerSecret || req.headers.get('x-worker-secret') !== workerSecret) {
      return json(401, { error: 'Worker secret invalido' });
    }

    const body = await req.json().catch(() => null);
    const jobId: string = body?.job_id ?? '';
    const status: string = body?.status ?? '';
    if (!UUID_RE.test(jobId)) return json(400, { error: 'job_id (UUID) obrigatorio' });
    if (!['completed', 'failed', 'retry'].includes(status)) {
      return json(400, { error: "status deve ser 'completed', 'failed' ou 'retry'" });
    }

    const admin = serviceClient();
    const { data: job } = await admin
      .from('prospecting_jobs')
      .select('id, status')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) return json(404, { error: 'Job nao encontrado' });
    if ((job as { status: string }).status !== 'processing') {
      // Callback duplicado/tardio — idempotente
      return json(200, { ok: true, ignored: true, current_status: (job as { status: string }).status });
    }

    const patch: Record<string, unknown> =
      status === 'completed'
        ? { status: 'completed', output: body?.output ?? {}, error: null, completed_at: new Date().toISOString() }
        : status === 'failed'
        ? { status: 'failed', error: String(body?.error ?? 'Falha reportada pelo executor'), completed_at: new Date().toISOString() }
        : { status: 'retry', error: String(body?.error ?? 'Reagendado pelo executor'), scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() };

    const { error: upErr } = await admin
      .from('prospecting_jobs')
      .update(patch)
      .eq('id', jobId);
    if (upErr) return json(500, { error: `Atualizar job: ${upErr.message}` });

    return json(200, { ok: true, job_id: jobId, status });
  } catch (e) {
    console.error('[prospecting-job-callback] uncaught:', (e as Error)?.stack || e);
    return json(500, { error: `Erro interno: ${(e as Error)?.message || String(e)}` });
  }
});
