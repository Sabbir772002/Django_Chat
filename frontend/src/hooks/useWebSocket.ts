import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '@/context/ChatStore';
import { chatAPI } from '@/utils/api';
import toast from 'react-hot-toast';

export interface WebSocketCallbacks {
  onSessionCompleted?: (sessionId: string) => void;
  onAgentAssigned?: (agentId: string, agentName: string, sessionId: string) => void;
  // only agent care about this one
  onNewWaitingSession?: () => void;
}

export function useWebSocket(sessionId: string | null, callbacks?: WebSocketCallbacks) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  // keep callbacks ref so connect() doesnt re-run on every render
  const callbacksRef = useRef<WebSocketCallbacks | undefined>(callbacks);
  callbacksRef.current = callbacks;
  const MAX_RECONNECT = 10;

  const { addMessage, setIsConnected, setMessages } = useChatStore();

  const loadMessageHistory = useCallback(async (sid: string) => {
    try {
      const response = await chatAPI.getMessages(sid);
      setMessages(response.data || []);
    } catch (error) {
      console.error('Failed to load message history:', error);
    }
  }, [setMessages]);

  const connect = useCallback((sid: string) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setIsConnected(false);
      return;
    }

    const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
      .replace(/^http/, 'ws')
      .replace(/\/$/, '');
    const wsUrl = `${baseUrl}/ws/chat/${sid}/?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      // dont load history here, caller already did it
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message') {
          const currentUserId = typeof window !== 'undefined'
            ? (() => { try { return JSON.parse(localStorage.getItem('user') || '').id; } catch { return null; } })()
            : null;
          if (data.sender_id !== currentUserId) {
            addMessage({
              id: data.message_id,
              session_id: sid,
              sender_id: data.sender_id,
              sender_name: data.sender_name,
              sender_role: data.sender_role,
              content: data.content,
              timestamp: data.timestamp,
              is_read: data.is_read,
            });
          }
        } else if (data.type === 'session_completed') {
          callbacksRef.current?.onSessionCompleted?.(data.session_id || sid);
        } else if (data.type === 'agent_assigned') {
          callbacksRef.current?.onAgentAssigned?.(data.agent_id, data.agent_name, data.session_id || sid);
        } else if (data.type === 'new_waiting_session') {
          callbacksRef.current?.onNewWaitingSession?.();
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    };

    ws.onerror = () => setIsConnected(false);

    ws.onclose = (evt) => {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      if (reconnectAttemptsRef.current < MAX_RECONNECT) {
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 15000);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) connect(sid);
        }, delay);
      }
    };
  }, [addMessage, setIsConnected]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!sessionId) {
      setIsConnected(false);
      return;
    }
    reconnectAttemptsRef.current = 0;
    connect(sessionId);
    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [sessionId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId) { toast.error('No active session'); return false; }
    if (!content.trim()) return false;
    try {
      const response = await chatAPI.sendMessage(sessionId, content);
      addMessage(response.data);
      return true;
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to send message');
      return false;
    }
  }, [sessionId, addMessage]);

  const { isConnected } = useChatStore();
  return { sendMessage, isConnected, loadMessageHistory };
}

