import { useState, useEffect } from 'react';
import { Campaign } from '@/types';
import { supabase } from '@/lib/supabase';

// ==========================================
// CAMPAIGNS SERVICE - Supabase-backed cache
// ==========================================

let campaignsStore: Campaign[] = [];
let currentScope: string | null | undefined = undefined;
let listeners: (() => void)[] = [];
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function notifyListeners() {
  listeners.forEach(fn => fn());
}

export function subscribeToCampaigns(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

export async function loadCampaigns(workspaceId?: string | null): Promise<void> {
  currentScope = workspaceId ?? null;
  let query = supabase.from('campaigns').select('*');
  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId);
  }
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('[campaigns] load error:', error.message);
    return;
  }

  campaignsStore = (data as unknown as Campaign[]) || [];
  notifyListeners();

  if (!realtimeChannel) {
    realtimeChannel = supabase
      .channel('realtime-campaigns')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns' },
        () => {
          if (currentScope !== undefined) loadCampaigns(currentScope);
        }
      )
      .subscribe();
  }
}

export function getCampaigns(workspaceId?: string): Campaign[] {
  let result = [...campaignsStore];
  if (workspaceId) {
    result = result.filter(c => c.workspace_id === workspaceId);
  }
  return result;
}

export interface CampaignResult {
  ok: boolean;
  data?: Campaign;
  error?: string;
}

export async function createCampaign(data: Partial<Campaign>): Promise<CampaignResult> {
  const payload = {
    workspace_id: data.workspace_id || '',
    name: data.name || '',
    objective: data.objective || null,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    description: data.description || null,
    audience: data.audience || null,
    product: data.product || null,
    priority: data.priority || 'medium',
    status: data.status || 'draft',
    color: data.color || '#3B82F6',
  };

  const { data: inserted, error } = await supabase
    .from('campaigns')
    .insert(payload)
    .select('*')
    .single();

  if (error || !inserted) {
    console.error('[campaigns] create error:', error?.message);
    return { ok: false, error: error?.message || 'Erro ao criar campanha' };
  }

  campaignsStore.push(inserted as unknown as Campaign);
  notifyListeners();
  return { ok: true, data: inserted as unknown as Campaign };
}

export async function updateCampaign(id: string, data: Partial<Campaign>): Promise<CampaignResult> {
  const { data: updated, error } = await supabase
    .from('campaigns')
    .update(data)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !updated) {
    console.error('[campaigns] update error:', error?.message);
    return { ok: false, error: error?.message || 'Erro ao atualizar campanha' };
  }

  const index = campaignsStore.findIndex(c => c.id === id);
  if (index !== -1) {
    campaignsStore[index] = updated as unknown as Campaign;
  }
  notifyListeners();
  return { ok: true, data: updated as unknown as Campaign };
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const { error } = await supabase.from('campaigns').delete().eq('id', id);
  if (error) {
    console.error('[campaigns] delete error:', error.message);
    return false;
  }
  campaignsStore = campaignsStore.filter(c => c.id !== id);
  notifyListeners();
  return true;
}

export function useCampaigns(workspaceId?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => getCampaigns(workspaceId));

  useEffect(() => {
    setCampaigns(getCampaigns(workspaceId));
    const unsubscribe = subscribeToCampaigns(() => {
      setCampaigns(getCampaigns(workspaceId));
    });
    return unsubscribe;
  }, [workspaceId]);

  return { campaigns, createCampaign, updateCampaign, deleteCampaign };
}

export function useActiveCampaigns(workspaceId?: string) {
  const { campaigns } = useCampaigns(workspaceId);
  return campaigns.filter(c => c.status === 'active' || c.status === 'draft');
}
