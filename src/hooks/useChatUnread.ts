import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UnreadRow {
  workspace_id: string;
  unread_count: number;
}

export function useChatUnread(currentUserId?: string | null) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!currentUserId) return;
    const { data } = await supabase.rpc('get_chat_unread_counts');
    const map: Record<string, number> = {};
    if (Array.isArray(data)) {
      for (const row of data as UnreadRow[]) {
        map[row.workspace_id] = Number(row.unread_count) || 0;
      }
    }
    setCounts(map);
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel('chat-unread-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        payload => {
          const newMsg = payload.new as { sender_id?: string };
          if (newMsg.sender_id === currentUserId) return;
          refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refresh]);

  const markRead = useCallback(
    async (threadId: string, workspaceId: string) => {
      if (!currentUserId) return;
      setCounts(prev => ({ ...prev, [workspaceId]: 0 }));
      await supabase.from('chat_thread_reads').upsert(
        { thread_id: threadId, user_id: currentUserId, last_read_at: new Date().toISOString() },
        { onConflict: 'thread_id,user_id' }
      );
      await supabase
        .from('chat_messages')
        .update({ status: 'read' })
        .eq('thread_id', threadId)
        .neq('sender_id', currentUserId)
        .neq('status', 'read');
    },
    [currentUserId]
  );

  return { counts, markRead, refresh };
}
