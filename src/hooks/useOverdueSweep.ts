import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { getOverdueActions, getActionsLoadStatus } from '@/lib/actionService';
import { formatDate } from '@/lib/utils';

// ==========================================
// Sweep diário de ações atrasadas do usuário:
// para cada ação overdue onde sou o responsável,
// cria UMA notificação por dia (dedupe em localStorage).
// Persistida no banco via addNotification (respeita
// a preferência 'overdue' no cliente).
// ==========================================

const DEDUPE_KEY = 'notified-overdue-v1';

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DEDUPE_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function useOverdueSweep(enabled: boolean): void {
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;

    const run = async () => {
      // Aguarda o cache de ações carregar (máx ~10s)
      for (let i = 0; i < 20; i++) {
        if (cancelled) return;
        if (getActionsLoadStatus() === 'success') break;
        await new Promise(r => setTimeout(r, 500));
      }
      if (cancelled) return;

      const seen = loadSeen();
      const today = new Date().toISOString().split('T')[0];
      const mine = getOverdueActions().filter(a => a.responsible_id === user.id);
      const fresh = mine.filter(a => seen[a.id] !== today);

      for (const a of fresh) {
        addNotification(
          'Ação atrasada',
          `${a.title} — a data passou (${formatDate(a.action_date)}) e ainda não foi concluída.`,
          'action_overdue',
        );
        seen[a.id] = today;
      }

      if (fresh.length > 0) {
        try {
          localStorage.setItem(DEDUPE_KEY, JSON.stringify(seen));
        } catch {
          // storage indisponível — notifica de novo no próximo load (aceitável)
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, user, addNotification]);
}
