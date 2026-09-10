import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Notification, NotificationType } from '@/types';
import { supabase } from '@/lib/supabase';
import { registerRealtimeReset } from '@/lib/realtimeCleanup';
import { isTypeSuppressed, subscribeNotifPrefs } from '@/lib/notificationPrefs';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ==========================================
// NOTIFICATIONS — DB-backed + realtime
// - Carrega as notificações do usuário (RLS = só as suas)
// - Canal realtime entrega INSERT/UPDATE/DELETE na hora
// - markAsRead / markAllAsRead / clearAll persistem (com erro visível)
// - Preferências (chat/atrasadas/sync) filtram os tipos opcionais
// - addNotification grava no banco com dedupe opcional (dedupe_key)
// ==========================================

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (title: string, message: string, type: NotificationType, dedupeKey?: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const PAGE_SIZE = 50;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [, setPrefsVersion] = useState(0);
  const uid = user?.id ?? null;

  // Recarrega do banco (fonte da verdade) — usado após falhas também
  const refetch = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (data) setNotifications(data as unknown as Notification[]);
  }, [uid]);

  // Carrega ao autenticar (e recarrega no login de outro usuário)
  useEffect(() => {
    if (!uid) {
      setNotifications([]);
      return;
    }
    let active = true;
    refetch().then(() => { if (active) { /* ok */ } });
    return () => {
      active = false;
    };
  }, [uid, refetch]);

  // Realtime: INSERT/UPDATE/DELETE nas próprias notificações
  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as unknown as Notification;
            setNotifications(prev => (prev.some(n => n.id === row.id) ? prev : [row, ...prev]));
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as unknown as Notification;
            setNotifications(prev => prev.map(n => (n.id === row.id ? row : n)));
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string };
            if (old?.id) setNotifications(prev => prev.filter(n => n.id !== old.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid]);

  // Preferências mudaram → re-render (recalcula visible/unread)
  useEffect(() => subscribeNotifPrefs(() => setPrefsVersion(v => v + 1)), []);

  // Encerra canal no logout (registry global)
  useEffect(() => {
    return registerRealtimeReset(() => {
      setNotifications([]);
    });
  }, []);

  const visible = notifications.filter(n => !isTypeSuppressed(n.type));
  const unreadCount = visible.filter(n => !n.is_read).length;

  const addNotification = useCallback(
    (title: string, message: string, type: NotificationType, dedupeKey?: string) => {
      const insert = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const row = { user_id: user.id, title, message, type, is_read: false, ...(dedupeKey ? { dedupe_key: dedupeKey } : {}) };
        // Com dedupe_key: duplicata é ignorada silenciosamente (índice único)
        const { data, error } = await supabase
          .from('notifications')
          .upsert(row, dedupeKey ? { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true } : {})
          .select('*')
          .maybeSingle();
        if (!error && data) {
          const saved = data as unknown as Notification;
          setNotifications(prev => (prev.some(n => n.id === saved.id) ? prev : [saved, ...prev]));
        }
        if (error) console.error('[notifications] insert:', error.message);
      };
      insert();
    },
    []
  );

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
      if (uid) {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', id)
          .eq('user_id', uid);
        if (error) {
          console.error('[notifications] markAsRead:', error.message);
          toast.error('Não foi possível marcar a notificação como lida');
          await refetch();
        }
      }
    },
    [uid, refetch]
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    if (uid) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', uid)
        .eq('is_read', false);
      if (error) {
        console.error('[notifications] markAllAsRead:', error.message);
        toast.error('Não foi possível marcar todas como lidas');
        await refetch();
      }
    }
  }, [uid, refetch]);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    if (uid) {
      const { error } = await supabase.from('notifications').delete().eq('user_id', uid);
      if (error) {
        console.error('[notifications] clearAll:', error.message);
        toast.error('Não foi possível limpar as notificações');
        await refetch();
      }
    }
  }, [uid, refetch]);

  return (
    <NotificationContext.Provider
      value={{ notifications: visible, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
