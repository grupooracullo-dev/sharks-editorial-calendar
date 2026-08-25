import { useState, useEffect, useCallback } from 'react';
import { MessageType, User } from '@/types';
import { supabase } from '@/lib/supabase';

export interface ChatMessageData {
  id: string;
  content: string;
  sender: User;
  message_type: MessageType;
  created_at: string;
}

export function useChat(workspaceId?: string | null) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setMessages([]);
      setThreadId(null);
      setLoading(false);
      return;
    }

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    setLoading(true);

    (async () => {
      // Find or create the thread for this workspace
      const { data: existing } = await supabase
        .from('chat_threads')
        .select('id')
        .eq('workspace_id', workspaceId)
        .limit(1);

      let tid: string | null = existing?.[0]?.id || null;

      if (!tid) {
        const { data: created } = await supabase
          .from('chat_threads')
          .insert({ workspace_id: workspaceId })
          .select('id')
          .single();
        tid = created?.id || null;
      }

      if (!active) return;
      setThreadId(tid);

      if (!tid) {
        setLoading(false);
        return;
      }

      const fetchMessages = async () => {
        const { data } = await supabase
          .from('chat_messages')
          .select('id, content, message_type, created_at, sender:users(*)')
          .eq('thread_id', tid)
          .order('created_at');

        if (active && data) {
          setMessages(data as unknown as ChatMessageData[]);
        }
        if (active) setLoading(false);
      };

      await fetchMessages();

      channel = supabase
        .channel(`chat-${tid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${tid}` },
          () => fetchMessages()
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  const send = useCallback(
    async (content: string, type: MessageType) => {
      if (!threadId) return false;
      const { error } = await supabase.from('chat_messages').insert({
        thread_id: threadId,
        content,
        message_type: type,
      });
      if (error) {
        console.error('[chat] send error:', error.message);
        return false;
      }
      return true;
    },
    [threadId]
  );

  return { messages, send, loading };
}
