import { supabase } from '@/lib/supabase';
import { notifyActionChanged } from '@/lib/googleSync';
import type { EstrategosProject, EstrategosMeeting, EstrategosImplementation } from '@/types';

// ==========================================
// ESTRATEGOS SERVICE
// CRUD + realtime para projetos, reunioes e
// implantacoes. Mutations disparam o sync
// acelerado (debounced) quando ha integracao.
// ==========================================

export async function loadProjects(workspaceId?: string | null): Promise<EstrategosProject[]> {
  let q = supabase
    .from('estrategos_projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as EstrategosProject[]) ?? [];
}

export async function loadMeetings(workspaceId?: string | null): Promise<EstrategosMeeting[]> {
  let q = supabase
    .from('estrategos_meetings')
    .select('*')
    .order('meeting_date', { ascending: true });
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as EstrategosMeeting[]) ?? [];
}

export async function loadImplementations(workspaceId?: string | null): Promise<EstrategosImplementation[]> {
  let q = supabase
    .from('estrategos_implementations')
    .select('*')
    .order('target_date', { ascending: true, nullsFirst: false });
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as EstrategosImplementation[]) ?? [];
}

export async function createProject(input: Partial<EstrategosProject>): Promise<EstrategosProject> {
  const { data, error } = await supabase.from('estrategos_projects').insert(input).select().single();
  if (error) throw error;
  return data as unknown as EstrategosProject;
}

export async function updateProject(id: string, patch: Partial<EstrategosProject>): Promise<void> {
  const { error } = await supabase.from('estrategos_projects').update(patch).eq('id', id);
  if (error) throw error;
  const ws = await wsOf('estrategos_projects', id);
  notifyActionChanged(ws);
}

export async function deleteProject(id: string): Promise<void> {
  const ws = await wsOf('estrategos_projects', id);
  const { error } = await supabase.from('estrategos_projects').delete().eq('id', id);
  if (error) throw error;
  notifyActionChanged(ws);
}

export async function createMeeting(input: Partial<EstrategosMeeting>): Promise<EstrategosMeeting> {
  const { data, error } = await supabase.from('estrategos_meetings').insert(input).select().single();
  if (error) throw error;
  notifyActionChanged(data.workspace_id);
  return data as unknown as EstrategosMeeting;
}

export async function updateMeeting(id: string, patch: Partial<EstrategosMeeting>): Promise<void> {
  const { error } = await supabase.from('estrategos_meetings').update(patch).eq('id', id);
  if (error) throw error;
  const ws = await wsOf('estrategos_meetings', id);
  notifyActionChanged(ws);
}

export async function deleteMeeting(id: string): Promise<void> {
  const ws = await wsOf('estrategos_meetings', id);
  const { error } = await supabase.from('estrategos_meetings').delete().eq('id', id);
  if (error) throw error;
  notifyActionChanged(ws);
}

export async function createImplementation(input: Partial<EstrategosImplementation>): Promise<EstrategosImplementation> {
  const { data, error } = await supabase.from('estrategos_implementations').insert(input).select().single();
  if (error) throw error;
  notifyActionChanged(data.workspace_id);
  return data as unknown as EstrategosImplementation;
}

export async function updateImplementation(id: string, patch: Partial<EstrategosImplementation>): Promise<void> {
  const { error } = await supabase.from('estrategos_implementations').update(patch).eq('id', id);
  if (error) throw error;
  const ws = await wsOf('estrategos_implementations', id);
  notifyActionChanged(ws);
}

export async function deleteImplementation(id: string): Promise<void> {
  const ws = await wsOf('estrategos_implementations', id);
  const { error } = await supabase.from('estrategos_implementations').delete().eq('id', id);
  if (error) throw error;
  notifyActionChanged(ws);
}

async function wsOf(table: string, id: string): Promise<string | undefined> {
  const { data } = await supabase.from(table).select('workspace_id').eq('id', id).maybeSingle();
  return (data as { workspace_id?: string } | null)?.workspace_id;
}
