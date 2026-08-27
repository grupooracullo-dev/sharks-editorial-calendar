import { supabase } from '@/lib/supabase';

export async function uploadWorkspaceLogo(file: File): Promise<string> {
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'logo';
  const ext = (clean.split('.').pop() || 'png').toLowerCase();
  const path = `workspaces/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('workspace-logos')
    .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });

  if (error) throw new Error(error.message);

  return supabase.storage.from('workspace-logos').getPublicUrl(path).data.publicUrl;
}