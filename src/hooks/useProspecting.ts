import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  CampaignPayload, CampaignStatus, ProspectingCampaign, ProspectingEnvironment, ProspectingJob, ProspectingStatus,
} from '@/lib/prospecting/types';

const CAMPAIGN_SELECT =
  '*, products:prospecting_campaign_products(product:environment_products(id, name)), assigned_to_user:prospecting_campaigns_assigned_to_fkey(id, full_name, avatar_url)';

async function syncCampaignProducts(campaignId: string, productIds: string[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('prospecting_campaign_products')
    .delete()
    .eq('campaign_id', campaignId);
  if (delErr) throw new Error(delErr.message);
  if (productIds.length > 0) {
    const { error: insErr } = await supabase
      .from('prospecting_campaign_products')
      .insert(productIds.map(pid => ({ campaign_id: campaignId, product_id: pid })));
    if (insErr) throw new Error(insErr.message);
  }
}

/* ─── Campanhas (com realtime) ─── */
export function useProspectingCampaigns(environment: ProspectingEnvironment | null) {
  const [campaigns, setCampaigns] = useState<ProspectingCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let query = supabase
      .from('prospecting_campaigns')
      .select(CAMPAIGN_SELECT)
      .order('created_at', { ascending: false });
    if (environment) query = query.eq('environment', environment);

    const { data, error } = await query;
    if (error) console.error('[prospecting] campaigns load error:', error.message);
    setCampaigns(((data ?? []) as unknown) as ProspectingCampaign[]);
    setLoading(false);
  }, [environment]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`prospecting-campaigns-${environment ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prospecting_campaigns' },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, environment]);

  const createCampaign = async (
    environment: ProspectingEnvironment,
    payload: CampaignPayload,
    userId: string | null,
  ): Promise<void> => {
    const { product_ids, ...rest } = payload;
    const { data, error } = await supabase
      .from('prospecting_campaigns')
      .insert({
        ...rest,
        environment,
        created_by: userId,
        assigned_to: payload.assigned_to ?? userId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    if (Array.isArray(product_ids)) await syncCampaignProducts(data.id, product_ids);
    await load();
  };

  const updateCampaign = async (id: string, patch: Partial<CampaignPayload>): Promise<void> => {
    const { product_ids, ...update } = patch;
    const { error } = await supabase
      .from('prospecting_campaigns')
      .update(update)
      .eq('id', id);
    if (error) throw new Error(error.message);
    if (Array.isArray(product_ids)) await syncCampaignProducts(id, product_ids);
    await load();
  };

  const deleteCampaign = async (id: string): Promise<void> => {
    const { error } = await supabase.from('prospecting_campaigns').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const setStatus = async (id: string, status: CampaignStatus): Promise<void> => {
    await updateCampaign(id, { status });
  };

  return { campaigns, loading, createCampaign, updateCampaign, deleteCampaign, setStatus };
}

/* ─── Atividade do agente: jobs recentes do ambiente ─── */
export function useProspectingJobs(environment: ProspectingEnvironment | null) {
  const [jobs, setJobs] = useState<ProspectingJob[]>([]);

  useEffect(() => {
    if (!environment) {
      setJobs([]);
      return;
    }
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('prospecting_jobs')
        .select('*, campaign:prospecting_campaigns!inner(id, name)')
        .eq('campaign.environment', environment)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!active) return;
      if (error) {
        console.error('[prospecting] jobs error:', error.message);
        return;
      }
      setJobs(((data ?? []) as unknown) as ProspectingJob[]);
    };

    load();

    const channel = supabase
      .channel(`prospecting-jobs-${environment}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prospecting_jobs' },
        () => { load(); },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [environment]);

  return jobs;
}

/* ─── Métricas: leads vindos do agente (origin + prospecting_status) ─── */
export interface ProspectingMetrics {
  found: number;
  qualified: number;
  approach: number;
  interested: number;
  meetings: number;
  /** contadores por campanha (lista) */
  byCampaign: Record<string, { found: number; qualified: number }>;
}

const EMPTY_METRICS: ProspectingMetrics = {
  found: 0, qualified: 0, approach: 0, interested: 0, meetings: 0, byCampaign: {},
};

export function useProspectingMetrics(environment: ProspectingEnvironment | null) {
  const [metrics, setMetrics] = useState<ProspectingMetrics>(EMPTY_METRICS);

  useEffect(() => {
    if (!environment) {
      setMetrics(EMPTY_METRICS);
      return;
    }
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('id, prospecting_status, prospecting_campaign_id')
        .eq('environment', environment)
        .eq('origin', 'prospecting_agent');
      if (!active) return;
      if (error) {
        console.error('[prospecting] metrics error:', error.message);
        return;
      }
      const rows = ((data ?? []) as unknown) as Array<{
        id: string;
        prospecting_status: ProspectingStatus | null;
        prospecting_campaign_id: string | null;
      }>;

      const byCampaign: ProspectingMetrics['byCampaign'] = {};
      const m: ProspectingMetrics = { found: rows.length, qualified: 0, approach: 0, interested: 0, meetings: 0, byCampaign };
      for (const r of rows) {
        const cid = r.prospecting_campaign_id ?? 'sem-campanha';
        byCampaign[cid] ??= { found: 0, qualified: 0 };
        byCampaign[cid].found += 1;
        if (r.prospecting_status === 'qualified') {
          m.qualified += 1;
          byCampaign[cid].qualified += 1;
        }
        if (r.prospecting_status === 'contacted' || r.prospecting_status === 'replied') m.approach += 1;
        if (r.prospecting_status === 'interested') m.interested += 1;
      }
      // Reuniões: estrutura comercial específica chega na F5 — por ora sempre 0
      setMetrics(m);
    };

    load();

    const channel = supabase
      .channel(`prospecting-leads-${environment}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_leads', filter: 'origin=eq.prospecting_agent' },
        () => { load(); },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [environment]);

  return metrics;
}
