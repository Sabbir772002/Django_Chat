import React, { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useChatStore } from '@/context/ChatStore';
import { chatAPI, authAPI } from '@/utils/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useMessagePolling } from '@/hooks/useMessagePolling';
import toast from 'react-hot-toast';

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function Visitor() {
  const {
    currentSession, setCurrentSession,
    messages, setMessages, addMessage,
    user, setUser,
    token, setToken,
  } = useChatStore();

  const [isReady, setIsReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [completing, setCompleting] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const [msgInput, setMsgInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessionHandledRef = useRef(false);
  const { isConnected } = useWebSocket(currentSession?.id || null, {
    onSessionCompleted: (_sid) => {
      if (sessionHandledRef.current) return;
      sessionHandledRef.current = true;
      setCurrentSession(null);
      setMessages([]);
      toast('Chat ended. Send a message to start a new one anytime.', { icon: 'ℹ️' });
    },
    onAgentAssigned: (_agentId, agentName, _sessionId) => {
      toast.success(`${agentName || 'An agent'} joined the chat!`);
      if (currentSession) {
        chatAPI.getSession(currentSession.id)
          .then(res => setCurrentSession(res.data))
          .catch(() => {});
      }
    },
  });

  void isConnected;

  useMessagePolling(currentSession?.id || null, 3000);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (token && user) { setIsReady(true); return; }
    if (typeof window !== 'undefined') {
      const t = localStorage.getItem('token');
      const u = localStorage.getItem('user');
      if (t && u) {
        try { setToken(t); setUser(JSON.parse(u)); } catch {}
      }
    }
    setIsReady(true);
  }, []);

  // restore session on login
  useEffect(() => {
    if (!isReady || !token || !user) return;
    chatAPI.getMySession()
      .then(res => { const s = res.data?.session; if (s) setCurrentSession(s); })
      .catch(() => {});
    chatAPI.getMyMessages()
      .then(res => { const msgs: any[] = res.data?.messages || []; if (msgs.length > 0) setMessages(msgs); })
      .catch(() => {});
  }, [isReady, token, user?.id]);

  useEffect(() => {
    if (!currentSession) return;
    sessionHandledRef.current = false;
    const poll = async () => {
      try {
        const res = await chatAPI.getSession(currentSession.id);
        const s = res.data;
        if (s.status === 'active' && !currentSession.agent_id) {
          setCurrentSession(s);
        } else if (s.status === 'closed' && !sessionHandledRef.current) {
          sessionHandledRef.current = true;
          setCurrentSession(null);
          setMessages([]);
          toast('Chat ended. Send a message to start a new one anytime.', { icon: 'ℹ️' });
        }
      } catch {}
    };
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [currentSession?.id]);

  const handleSend = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = msgInput.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await chatAPI.sendMessage(currentSession?.id ?? '', content);
      const msg = res.data;
      addMessage(msg);
      setMsgInput('');
      if (!currentSession && msg.session_id) {
        try {
          const sr = await chatAPI.getSession(msg.session_id);
          setCurrentSession(sr.data);
        } catch {}
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [msgInput, sending, currentSession, addMessage]);

  const handleComplete = async () => {
    if (!currentSession || completing) return;
    setCompleting(true);
    try {
      await chatAPI.completeSession(currentSession.id);
      setCurrentSession(null);
      setMessages([]);
      toast.success('Chat ended.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to end chat');
    } finally {
      setCompleting(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isLogin) {
        const res = await authAPI.login(username, password);
        const { access, user: u } = res.data;
        setToken(access); setUser(u);
        localStorage.setItem('token', access);
        localStorage.setItem('user', JSON.stringify(u));
        setUsername(''); setPassword('');
        toast.success('Logged in!');
      } else {
        localStorage.removeItem('token'); localStorage.removeItem('user');
        const res = await authAPI.register(username, email, password, 'visitor');
        const { access, user: u } = res.data;
        setToken(access); setUser(u);
        localStorage.setItem('token', access);
        localStorage.setItem('user', JSON.stringify(u));
        setUsername(''); setEmail(''); setPassword('');
        toast.success('Account created!');
      }
    } catch (err: any) {
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        const msg = Object.values(d).flat().join(', ');
        if (msg) { toast.error(msg); setAuthLoading(false); return; }
      }
      toast.error(d?.error || d?.detail || err.message || 'Auth failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null); setToken(null);
    setCurrentSession(null); setMessages([]);
    localStorage.removeItem('user'); localStorage.removeItem('token');
  };

  const hasSession = !!currentSession;
  const isWaiting = currentSession?.status === 'waiting';
  const isActive = currentSession?.status === 'active';
  const agentName = (currentSession as any)?.agent_name;

  if (!isReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token || !user) {
    return (
      <>
        <Head><title>Chat Support — Login</title></Head>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4 text-2xl select-none">💬</div>
              <h1 className="text-2xl font-bold text-white">Chat Support</h1>
              <p className="text-slate-400 text-sm mt-1">
                {isLogin ? 'Sign in to your account' : 'Create a new account'}
              </p>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="your_username" required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 text-sm" />
              </div>
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 text-sm" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 text-sm" />
              </div>
              <button type="submit" disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold py-2.5 rounded-xl transition text-sm mt-2">
                {authLoading ? 'Please wait…' : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>
            <p className="text-center text-slate-500 text-sm mt-6">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={() => { setIsLogin(!isLogin); setUsername(''); setEmail(''); setPassword(''); }}
                className="text-blue-400 hover:text-blue-300 font-medium">
                {isLogin ? 'Register' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </>
    );
  }


  return (
    <>
      <Head><title>Chat Support</title></Head>

      <div className="h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden">


        <header className="flex-none flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-extrabold text-white text-sm select-none">
              {initials(user.username)}
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">Alphanet Support</p>
              <p className="text-xs text-slate-400 mt-0.5">{user.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isActive && (
              <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-emerald-700 bg-emerald-900/30 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {agentName ? `Chatting with ${agentName}` : 'Agent connected'}
              </span>
            )}
            {isWaiting && (
              <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-700 bg-amber-900/30 text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Waiting for agent…
              </span>
            )}
            {hasSession && (
              <button onClick={handleComplete} disabled={completing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:bg-slate-700 text-white text-xs font-semibold rounded-xl transition">
                {completing
                  ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : '✕'} End Chat
              </button>
            )}
            <button onClick={handleLogout}
              className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition text-slate-300 hover:text-white font-medium">
              Sign out
            </button>
          </div>
        </header>


        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center select-none gap-3 opacity-40">
              <div className="text-5xl">💬</div>
              <p className="text-slate-400 text-sm font-medium">Send a message to connect with our support team.</p>
              <p className="text-slate-600 text-xs">An available agent will be assigned automatically.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = (msg as any).sender_role === 'visitor';
              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-none mb-0.5
                    ${isOwn ? 'bg-blue-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'} text-white`}>
                    {initials((msg as any).sender_name || 'U')}
                  </div>
                  <div className={`max-w-[65%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm
                    ${isOwn
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-sm'}`}>
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200/70' : 'text-slate-500'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>


        {currentSession && (
          <div className={`flex-none px-5 py-1.5 text-xs font-medium text-center
            ${isActive
              ? 'bg-emerald-900/20 border-t border-emerald-800/40 text-emerald-400'
              : 'bg-amber-900/20 border-t border-amber-800/40 text-amber-400'}`}>
            {isActive
              ? `🟢 Connected${agentName ? ` with ${agentName}` : ''}`
              : '⏳ In queue — waiting for an available agent'}
          </div>
        )}


        <div className="flex-none px-5 py-4 bg-slate-900 border-t border-slate-800">
          <form onSubmit={handleSend} className="flex items-center gap-3">
            <input
              type="text"
              value={msgInput}
              onChange={e => setMsgInput(e.target.value)}
              placeholder={
                isActive ? 'Type a message…' :
                isWaiting ? 'Waiting for agent — you can keep typing…' :
                'Type a message to connect with support…'
              }
              className="flex-1 bg-slate-800 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
            />
            <button
              type="submit"
              disabled={!msgInput.trim() || sending}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shadow-lg"
            >
              {sending ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Sending
                </span>
              ) : 'Send'}
            </button>
          </form>
          {!hasSession && (
            <p className="text-xs text-slate-600 text-center mt-2 select-none">
              Sending a message will automatically place you in the support queue.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

