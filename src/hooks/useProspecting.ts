import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  CampaignPayload, CampaignStatus, ProspectingCampaign, ProspectingEnvironment, ProspectingStatus,
} from '@/lib/prospecting/types';

/* FK nomeada desambigua os dois vínculos com users (created_by / assigned_to) */
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
  ): Promise<ProspectingCampaign> => {
    const { product_ids, ...rest } = payload;
    const { data, error } = await supabase
      .from('prospecting_campaigns')
      .insert({
        ...rest,
        environment,
        created_by: userId,
        assigned_to: payload.assigned_to ?? userId,
      })
      .select(CAMPAIGN_SELECT)
      .single();
    if (error) throw new Error(error.message);
    const campaign = data as unknown as ProspectingCampaign;

    if (Array.isArray(product_ids)) {
      await syncCampaignProducts(campaign.id, product_ids);
      const { data: fresh, error: err2 } = await supabase
        .from('prospecting_campaigns')
        .select(CAMPAIGN_SELECT)
        .eq('id', campaign.id)
        .single();
      if (err2) throw new Error(err2.message);
      const final = fresh as unknown as ProspectingCampaign;
      setCampaigns(prev => [final, ...prev]);
      return final;
    }

    setCampaigns(prev => [campaign, ...prev]);
    return campaign;
  };

  const updateCampaign = async (id: string, patch: Partial<CampaignPayload>): Promise<ProspectingCampaign> => {
    const { product_ids, ...update } = patch;
    const { data, error } = await supabase
      .from('prospecting_campaigns')
      .update(update)
      .eq('id', id)
      .select(CAMPAIGN_SELECT)
      .single();
    if (error) throw new Error(error.message);
    let campaign = data as unknown as ProspectingCampaign;

    if (Array.isArray(product_ids)) {
      await syncCampaignProducts(id, product_ids);
      const { data: fresh, error: err2 } = await supabase
        .from('prospecting_campaigns')
        .select(CAMPAIGN_SELECT)
        .eq('id', id)
        .single();
      if (err2) throw new Error(err2.message);
      campaign = fresh as unknown as ProspectingCampaign;
    }

    setCampaigns(prev => prev.map(c => (c.id === id ? campaign : c)));
    return campaign;
  };

  const deleteCampaign = async (id: string): Promise<void> => {
    const { error } = await supabase.from('prospecting_campaigns').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const setStatus = async (id: string, status: CampaignStatus): Promise<void> => {
    await updateCampaign(id, { status });
  };

  return { campaigns, loading, load, createCampaign, updateCampaign, deleteCampaign, setStatus };
}

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

/* ─── Métricas: leads vindos do agente (origin + prospecting_status) ─── */
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
        { event: '*', schema: 'public', table: 'crm_leads', filter: `origin=eq.prospecting_agent` },
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

/* ─── Resumo por campanha (para a lista) ─── */
export function useCampaignCounts(campaigns: ProspectingCampaign[], metrics: ProspectingMetrics) {
  return useMemo(() => {
    const map = new Map<string, { found: number; qualified: number }>();
    for (const c of campaigns) {
      map.set(c.id, metrics.byCampaign[c.id] ?? { found: 0, qualified: 0 });
    }
    return map;
  }, [campaigns, metrics]);
}
