import { NotificationType } from '@/types';

// ==========================================
// Preferências de notificação — fonte única
// (mesma chave localStorage usada por SharksSettings).
// Filtram SOMENTE os tipos opcionais no cliente:
// atribuição/status/acesso são sempre visíveis.
// ==========================================

export interface NotifPrefs {
  chat: boolean;
  overdue: boolean;
  sync: boolean;
}

const PREFS_KEY = 'sharks-notif-prefs';
const DEFAULTS: NotifPrefs = { chat: true, overdue: true, sync: true };

let cache: NotifPrefs | null = null;
const listeners = new Set<() => void>();

export function getNotifPrefs(): NotifPrefs {
  if (!cache) {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotifPrefs>) } : { ...DEFAULTS };
    } catch {
      cache = { ...DEFAULTS };
    }
  }
  return cache;
}

export function setNotifPrefs(next: Partial<NotifPrefs>): void {
  const merged = { ...getNotifPrefs(), ...next };
  cache = merged;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch {
    // storage indisponível — mantém apenas em memória
  }
  listeners.forEach(l => l());
}

export function subscribeNotifPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tipos suprimidos pelas preferências do usuário (client-side). */
export function isTypeSuppressed(type: NotificationType): boolean {
  const p = getNotifPrefs();
  if (type === 'message') return !p.chat;
  if (type === 'action_overdue') return !p.overdue;
  if (type === 'sync_error') return !p.sync;
  return false;
}
