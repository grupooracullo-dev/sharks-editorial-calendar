import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ==========================================
// CHANNELS — leitura simples por workspace
// (sem realtime; muda raramente)
// ==========================================

export function useChannels(workspaceId?: string | null) {
  const [channels, setChannels] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setChannels([]);
    if (!workspaceId) return;
    (async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('name')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
        .order('name');
      if (active && !error) setChannels((data ?? []).map(c => c.name as string));
    })();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  return channels;
}
