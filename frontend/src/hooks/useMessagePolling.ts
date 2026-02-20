import { useEffect } from 'react';
import { useChatStore } from '@/context/ChatStore';
import { chatAPI } from '@/utils/api';

export function useMessagePolling(sessionId: string | null, intervalMs: number = 5000) {
  const { mergeMessages } = useChatStore();

  useEffect(() => {
    if (!sessionId) return;

    const pollMessages = async () => {
      try {
        const response = await chatAPI.getMessages(sessionId);
        mergeMessages(response.data || []);
      } catch (error) {
        console.error('Error polling messages:', error);
      }
    };

    pollMessages();
    const interval = setInterval(pollMessages, intervalMs);
    return () => clearInterval(interval);
  }, [sessionId, intervalMs, mergeMessages]);
}
