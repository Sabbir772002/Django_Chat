import create from 'zustand';
import { useEffect, useState } from 'react';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'visitor' | 'agent';
}

export interface Message {
  id: string;
  session_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: string;
  content: string;
  timestamp: string;
  is_read: boolean;
}

export interface ChatSession {
  id: string;
  visitor_id: string;
  agent_id?: string;
  status: 'active' | 'waiting' | 'closed';
  created_at: string;
  updated_at: string;
}

interface ChatStore {
  user: User | null;
  token: string | null;
  isHydrated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setIsHydrated: (hydrated: boolean) => void;
  currentSession: ChatSession | null;
  messages: Message[];
  setCurrentSession: (session: ChatSession | null) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  mergeMessages: (incoming: Message[]) => void;
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
  loading: boolean;
  error: string | null;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  user: null,
  token: null,
  isHydrated: false,
  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('token');
      }
    }
    set({ token });
  },
  setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),
  
  currentSession: null,
  messages: [],
  setCurrentSession: (session) => set({ currentSession: session }),
  addMessage: (message) => set((state) => {
    const messageExists = state.messages.some(msg => msg.id === message.id);
    if (messageExists) return { messages: state.messages };
    return { messages: [...state.messages, message] };
  }),
  setMessages: (messages) => set({ messages }),
  mergeMessages: (incoming) => set((state) => {
    const existingIds = new Set(state.messages.map(m => m.id));
    const newOnes = incoming.filter(m => !existingIds.has(m.id));
    if (newOnes.length === 0) return {};
    const merged = [...state.messages, ...newOnes].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return { messages: merged };
  }),
  
  isConnected: false,
  setIsConnected: (connected) => set({ isConnected: connected }),
  
  loading: false,
  error: null,
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));

// Hook to hydrate store from localStorage
export const useHydration = () => {
  const { token, user, setToken, setUser, setIsHydrated, isHydrated } = useChatStore();
  
  useEffect(() => {
    if (!isHydrated && typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (storedToken) {
        setToken(storedToken);
      }
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      setIsHydrated(true);
    }
  }, [isHydrated, setToken, setUser, setIsHydrated]);
  
  return isHydrated;
};;
