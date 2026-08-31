import { supabase } from '@/lib/supabase';

// ==========================================
// REALTIME CLEANUP REGISTRY
// Servicos singleton (actionService, useCampaigns, etc.) registram
// aqui como voltar ao estado inicial (channel null + cache limpo).
// signOut() executa todos para nao vazar WebSockets/Cache entre sessoes.
// ==========================================

type Reset = () => void;
const resets = new Set<Reset>();

export function registerRealtimeReset(fn: Reset): void {
  resets.add(fn);
}

export async function resetAllRealtime(): Promise<void> {
  try {
    await supabase.removeAllChannels();
  } catch (e) {
    console.error('[realtime] removeAllChannels error:', e);
  }
  resets.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.error('[realtime] reset error:', e);
    }
  });
}
