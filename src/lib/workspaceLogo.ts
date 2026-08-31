import { supabase } from '@/lib/supabase';

const BUCKET = 'workspace-logos';

/** Extrai o path de storage de uma URL pública do bucket. */
function pathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length).split('?')[0];
}

/**
 * Faz upload do logo e remove o anterior (best-effort).
 * @param previousUrl URL pública do logo atual (para cleanup); ausente na criação.
 */
export async function uploadWorkspaceLogo(file: File, previousUrl?: string | null): Promise<string> {
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'logo';
  const ext = (clean.split('.').pop() || 'png').toLowerCase();
  const path = `workspaces/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });

  if (error) throw new Error(error.message);

  // Upload ok → remove o logo anterior (falha de cleanup não invalida o upload)
  const prevPath = previousUrl ? pathFromUrl(previousUrl) : null;
  if (prevPath && prevPath !== path) {
    try {
      const { error: rmError } = await supabase.storage.from(BUCKET).remove([prevPath]);
      if (rmError) console.error('[workspace-logo] cleanup error:', rmError.message);
    } catch (e) {
      console.error('[workspace-logo] cleanup error:', e);
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Não foi possível obter a URL do logo.');
  return data.publicUrl;
}
