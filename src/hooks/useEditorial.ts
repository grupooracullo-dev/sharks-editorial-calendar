import { useState, useEffect } from 'react';
import { EditorialPillar, EditorialProfile } from '@/types';
import { supabase } from '@/lib/supabase';
import { registerRealtimeReset } from '@/lib/realtimeCleanup';

// ==========================================
// EDITORIAL SERVICE (pillars + profile) - Supabase-backed cache
// ==========================================

let pillarsStore: EditorialPillar[] = [];
let profilesStore: EditorialProfile[] = [];
let currentScope: string | null | undefined = undefined;
let listeners: (() => void)[] = [];
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function notifyListeners() {
  listeners.forEach(fn => fn());
}

export function subscribeToPillars(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

export async function loadEditorial(workspaceId?: string | null): Promise<void> {
  currentScope = workspaceId ?? null;

  let pillarsQuery = supabase.from('editorial_pillars').select('*').order('sort_order');
  if (workspaceId) pillarsQuery = pillarsQuery.eq('workspace_id', workspaceId);

  const [pillarsRes, profilesRes] = await Promise.all([pillarsQuery, (async () => {
    let q = supabase.from('editorial_profiles').select('*');
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    return q;
  })()]);

  if (pillarsRes.error) console.error('[editorial] pillars error:', pillarsRes.error.message);
  if (profilesRes.error) console.error('[editorial] profiles error:', profilesRes.error.message);

  pillarsStore = ((pillarsRes.data as unknown as EditorialPillar[]) || []);
  profilesStore = ((profilesRes.data as unknown as EditorialProfile[]) || []);
  notifyListeners();

  if (!realtimeChannel) {
    realtimeChannel = supabase
      .channel('realtime-editorial')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'editorial_pillars' }, () => {
        if (currentScope !== undefined) loadEditorial(currentScope);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'editorial_profiles' }, () => {
        if (currentScope !== undefined) loadEditorial(currentScope);
      })
      .subscribe();
  }
}

/** Logout: limpa channel + cache (registered em realtimeCleanup). */
export function resetEditorialRealtime(): void {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  pillarsStore = [];
  profilesStore = [];
  currentScope = undefined;
  notifyListeners();
}
registerRealtimeReset(resetEditorialRealtime);

export function getPillars(workspaceId?: string): EditorialPillar[] {
  if (workspaceId) {
    return pillarsStore
      .filter(p => p.workspace_id === workspaceId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }
  return [...pillarsStore];
}

export function getProfile(workspaceId: string): EditorialProfile | undefined {
  return profilesStore.find(p => p.workspace_id === workspaceId);
}

export interface EditorialResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export async function updateProfile(
  workspaceId: string,
  data: Partial<EditorialProfile>
): Promise<EditorialResult> {
  const existing = getProfile(workspaceId);
  if (!existing) return { ok: false, error: 'Perfil não encontrado' };

  const { data: updated, error } = await supabase
    .from('editorial_profiles')
    .update(data)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) {
    console.error('[editorial] updateProfile error:', error.message);
    return { ok: false, error: error.message };
  }

  const index = profilesStore.findIndex(p => p.id === existing.id);
  if (index !== -1) profilesStore[index] = updated as unknown as EditorialProfile;
  notifyListeners();
  return { ok: true, data: updated };
}

export async function createPillar(data: Partial<EditorialPillar>): Promise<EditorialResult> {
  const maxSort = Math.max(0, ...getPillars(data.workspace_id).map(p => p.sort_order));
  const payload = {
    workspace_id: data.workspace_id || '',
    name: data.name || '',
    description: data.description || null,
    color: data.color || '#0066FF',
    percentage: data.percentage || 15,
    sort_order: data.sort_order || maxSort + 1,
    is_active: true,
  };

  const { data: inserted, error } = await supabase
    .from('editorial_pillars')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('[editorial] createPillar error:', error.message);
    return { ok: false, error: error.message };
  }

  pillarsStore.push(inserted as unknown as EditorialPillar);
  notifyListeners();
  return { ok: true, data: inserted };
}

export async function updatePillar(id: string, data: Partial<EditorialPillar>): Promise<EditorialResult> {
  const { data: updated, error } = await supabase
    .from('editorial_pillars')
    .update({ ...data, is_active: data.is_active ?? true })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[editorial] updatePillar error:', error.message);
    return { ok: false, error: error.message };
  }

  const index = pillarsStore.findIndex(p => p.id === id);
  if (index !== -1) pillarsStore[index] = updated as unknown as EditorialPillar;
  notifyListeners();
  return { ok: true, data: updated };
}

export async function deletePillar(id: string): Promise<boolean> {
  const { error } = await supabase.from('editorial_pillars').delete().eq('id', id);
  if (error) {
    console.error('[editorial] deletePillar error:', error.message);
    return false;
  }
  pillarsStore = pillarsStore.filter(p => p.id !== id);
  notifyListeners();
  return true;
}

export function useEditorial(workspaceId?: string) {
  const [pillars, setPillars] = useState<EditorialPillar[]>(() => getPillars(workspaceId));
  const [profile, setProfile] = useState<EditorialProfile | undefined>(() =>
    workspaceId ? getProfile(workspaceId) : undefined
  );

  useEffect(() => {
    setPillars(getPillars(workspaceId));
    if (workspaceId) setProfile(getProfile(workspaceId));

    const unsubscribe = subscribeToPillars(() => {
      setPillars(getPillars(workspaceId));
      if (workspaceId) setProfile(getProfile(workspaceId));
    });
    return unsubscribe;
  }, [workspaceId]);

  return {
    pillars,
    profile,
    updateProfile: (data: Partial<EditorialProfile>) =>
      workspaceId ? updateProfile(workspaceId, data) : Promise.resolve({ ok: false }),
    createPillar,
    updatePillar,
    deletePillar,
  };
}
