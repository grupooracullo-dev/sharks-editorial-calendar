import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';

function pathFor(userId: string, fileName: string): string {
  return `${userId}/${fileName}`;
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'avatar';
  const ext = (clean.split('.').pop() || 'png').toLowerCase();
  const fileName = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(pathFor(userId, fileName), file, { upsert: true, cacheControl: '3600', contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(pathFor(userId, fileName));

  // Upload ok → remove arquivos antigos (mantém apenas o novo)
  await removeAvatar(userId, [fileName]);

  return data.publicUrl;
}

export async function removeAvatar(userId: string, keep?: string[]): Promise<void> {
  const { data: existing } = await supabase.storage.from(BUCKET).list(userId);
  if (!existing || existing.length === 0) return;
  const toRemove = existing
    .filter(f => !keep?.includes(f.name) && !f.name.startsWith('.'))
    .map(f => pathFor(userId, f.name));
  if (toRemove.length === 0) return;
  await supabase.storage.from(BUCKET).remove(toRemove);
}