import { useState, useEffect, useCallback } from 'react';
import { MessageType, MessageStatus, User } from '@/types';
import { supabase } from '@/lib/supabase';

export interface ChatMessageData {
  id: string;
  sender_id?: string;
  sender_name?: string;
  content: string;
  sender: User;
  message_type: MessageType;
  created_at: string;
  status: MessageStatus;
}

export function useChat(workspaceId?: string | null, currentUser?: User | null) {
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
          .select('id, sender_id, sender_name, content, message_type, created_at, status, sender:users(id, full_name, avatar_url)')
          .eq('thread_id', tid)
          .order('created_at');

        if (active && data) {
          // O embed sender vem null para clientes (RLS users_select permite
          // só o próprio perfil) — cai para o sender_name gravado na mensagem
          // e, por fim, para "Equipe". Nunca quebra a UI.
          const normalized = (data as unknown as Array<Record<string, any>>).map(m => ({
            ...m,
            sender: m.sender ?? {
              id: m.sender_id ?? '',
              full_name: m.sender_name ?? 'Equipe',
              avatar_url: null,
            },
          }));
          setMessages(normalized as unknown as ChatMessageData[]);
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
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (currentUser) {
        const optimistic: ChatMessageData = {
          id: tempId,
          content,
          message_type: type,
          created_at: new Date().toISOString(),
          status: 'sent',
          sender: currentUser,
        };
        setMessages(prev => [...prev, optimistic]);
      }
      const { error } = await supabase.from('chat_messages').insert({
        thread_id: threadId,
        content,
        message_type: type,
      });
      if (error) {
        console.error('[chat] send error:', error.message);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return false;
      }
      return true;
    },
    [threadId, currentUser]
  );

  return { messages, send, loading, threadId };
}
