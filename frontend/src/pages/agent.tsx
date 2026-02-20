import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useChatStore } from '@/context/ChatStore';
import { chatAPI, agentAPI } from '@/utils/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import toast from 'react-hot-toast';

interface WaitingSession {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_id: string;
  last_message?: { content: string };
  messages_count: number;
  updated_at: string;
  created_at: string;
}

function initials(name: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}


export default function Agent() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const { user, setUser, setToken, currentSession, setCurrentSession, messages, setMessages } =
    useChatStore();

  const [agentStatus, setAgentStatus] = useState<'available' | 'busy' | 'offline'>('offline');
  const [waitingList, setWaitingList] = useState<WaitingSession[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [completing, setCompleting] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, isConnected } = useWebSocket(currentSession?.id ?? null, {
    onSessionCompleted: (_sessionId) => {
      setCurrentSession(null);
      setMessages([]);
      setAgentStatus('offline');
      toast('Chat ended by visitor. You are now offline.', { icon: 'ℹ️' });
    },
    onNewWaitingSession: () => {
      fetchWaiting();
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    const raw = localStorage.getItem('user');
    if (!token || !raw) { router.push('/agent-login'); return; }
    try {
      const userData = JSON.parse(raw);
      if (userData.role !== 'agent') { router.push('/agent-login'); return; }
      setToken(token);
      setUser(userData);
      setIsReady(true);
    } catch {
      router.push('/agent-login');
    }
  }, [router, setToken, setUser]);

  // load session msgs + merge with visitor history
  // backend returns sender_id directly so no field mapping needed
  const loadSession = useCallback(async (sessionData: any) => {
    setCurrentSession(sessionData);
    try {
      const curRes = await chatAPI.getMessages(sessionData.id);
      const current: any[] = curRes.data || [];

      let historical: any[] = [];
      try {
        const visitorId = sessionData.visitor;
        const histRes = await agentAPI.getVisitorMessages(visitorId);
        historical = histRes.data?.messages || [];
      } catch {}

      const merged = new Map<string, any>();
      [...historical, ...current].forEach((m: any) => merged.set(m.id, m));
      setMessages(Array.from(merged.values()).sort(
        (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ));
    } catch (err) {
      console.error('loadSession error:', err);
      setMessages([]);
    }
  }, [setCurrentSession, setMessages]);


  const fetchWaiting = useCallback(async () => {
    try {
      const res = await chatAPI.getWaitingSessions();
      setWaitingList(
        [...res.data].sort(
          (a: WaitingSession, b: WaitingSession) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      );
    } catch (err: any) {
      if (err.response?.status === 401) router.push('/agent-login');
    }
  }, [router]);

  useEffect(() => {
    if (!isReady || !user) return;

    agentAPI.getMe().then((res: any) => {
      const dbStatus = res.data?.agent_status as 'available' | 'busy' | 'offline';
      if (dbStatus) setAgentStatus(dbStatus);
    }).catch(() => {});

    chatAPI.getMyActiveSession().then(async (res: any) => {
      const list: any[] = res.data;
      if (list.length > 0) await loadSession(list[0]);
    }).catch(() => {});

    fetchWaiting();
    const t = setInterval(fetchWaiting, 3000);
    return () => clearInterval(t);
  }, [isReady, user, loadSession, fetchWaiting]);

  const handleStatusChange = async (newStatus: 'available' | 'busy' | 'offline') => {
    if (accepting || completing) return;
    try {
      setAccepting(newStatus === 'available');
      const res = await agentAPI.updateStatus(newStatus);
      setAgentStatus(newStatus);

      const nextSession = res.data?.next_session;
      if (nextSession) {
        await loadSession(nextSession);
        setWaitingList((prev: WaitingSession[]) => prev.filter((s: WaitingSession) => s.id !== nextSession.id));
        toast.success(`Chat started with ${nextSession.visitor_name}`);
      } else if (newStatus === 'available') {
        toast.success('You are available — waiting for visitors');
      } else {
        toast.success(`Status: ${newStatus}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update status');
    } finally {
      setAccepting(false);
    }
  };


  const handleComplete = async () => {
    if (!currentSession || completing) return;
    try {
      setCompleting(true);
      await chatAPI.completeSession(currentSession.id);
      setCurrentSession(null);
      setMessages([]);
      setAgentStatus('offline');
      toast.success('Chat completed — you are now offline');
      await fetchWaiting();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to complete session');
    } finally {
      setCompleting(false);
    }
  };


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim()) return;
    const ok = await sendMessage(msgInput);
    if (ok) setMsgInput('');
  };


  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    router.push('/');
  };


  if (!isReady || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    available: 'bg-emerald-500',
    busy: 'bg-amber-500',
    offline: 'bg-slate-500',
  };
  const statusLabels: Record<string, string> = {
    available: 'Available',
    busy: 'Busy',
    offline: 'Offline',
  };

  return (
    <>
      <Head>
        <title>Agent Dashboard — {user.username}</title>
      </Head>

      <div className="h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden">

        <header className="flex-none flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800 shadow-md z-10">
          {/* Left: brand + agent name */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-extrabold text-white text-sm select-none">
              A
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">Alphanet Support</p>
              <p className="text-xs text-slate-400 mt-0.5">{user.username}</p>
            </div>
          </div>

          {/* Center: status pills */}
          <div className="flex items-center gap-1.5">
            {(['available', 'busy', 'offline'] as const).map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={accepting}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border
                  ${agentStatus === s
                    ? s === 'available'
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-900/40 shadow-lg'
                      : s === 'busy'
                        ? 'bg-amber-600 border-amber-500 text-white shadow-amber-900/40 shadow-lg'
                        : 'bg-slate-600 border-slate-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full ${agentStatus === s ? statusColors[s] : 'bg-slate-600'}`} />
                {statusLabels[s]}
              </button>
            ))}
          </div>

          {/* Right: WS indicator + logout */}
          <div className="flex items-center gap-3">
            {currentSession && (
              <span
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                  isConnected
                    ? 'border-emerald-700 bg-emerald-900/30 text-emerald-400'
                    : 'border-red-700 bg-red-900/30 text-red-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {isConnected ? 'Live' : 'Reconnecting…'}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-red-700 border border-slate-600 hover:border-red-600 rounded-lg transition text-slate-300 hover:text-white font-medium"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <aside className="w-[300px] flex-none flex flex-col bg-slate-900 border-r border-slate-800">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <p className="text-sm font-bold text-white">Waiting Queue</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {waitingList.length === 0
                    ? 'No one waiting'
                    : `${waitingList.length} visitor${waitingList.length > 1 ? 's' : ''} in line`}
                </p>
              </div>
              {waitingList.length > 0 && (
                <span className="text-xs font-bold bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
                  {waitingList.length}
                </span>
              )}
            </div>

            {/* Current session badge */}
            {currentSession && (
              <div className="mx-3 mt-3 px-3 py-2.5 bg-emerald-900/30 border border-emerald-700/50 rounded-xl">
                <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wide mb-1">Active Chat</p>
                <p className="text-sm font-semibold text-white truncate">{(currentSession as any).visitor_name}</p>
                <p className="text-xs text-slate-400 truncate">{(currentSession as any).visitor_email}</p>
              </div>
            )}

            {/* Queue list */}
            <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2.5">
              {waitingList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center select-none py-12">
                  <div className="text-4xl mb-3 opacity-30">🕐</div>
                  <p className="text-slate-500 text-sm font-medium">Queue empty</p>
                  <p className="text-slate-600 text-xs mt-1">
                    {agentStatus === 'available'
                      ? "You'll be assigned automatically"
                      : 'Set status to Available to receive visitors'}
                  </p>
                </div>
              ) : (
                waitingList.map((session, idx) => {
                  const isNext = idx === 0 && !currentSession;
                  return (
                    <div
                      key={session.id}
                      className={`rounded-xl border p-3 transition-all ${
                        isNext
                          ? 'border-blue-600/60 bg-blue-900/20'
                          : 'border-slate-700 bg-slate-800/60'
                      }`}
                    >
                      {/* Visitor row */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-bold text-white text-xs flex-none">
                          {initials(session.visitor_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-white truncate">{session.visitor_name}</p>
                            {isNext && (
                              <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-medium">
                                Next
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{session.visitor_email}</p>
                        </div>
                        <span className="text-xs text-slate-500 flex-none">#{idx + 1}</span>
                      </div>

                      {/* Last message preview */}
                      {session.last_message && (
                        <p className="mt-2 text-xs text-slate-400 italic truncate bg-slate-900/50 rounded-lg px-2.5 py-1.5">
                          &ldquo;{session.last_message.content}&rdquo;
                        </p>
                      )}

                      {/* Meta */}
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <span>{session.messages_count} msg{session.messages_count !== 1 ? 's' : ''}</span>
                        <span>{timeAgo(session.updated_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Helper hint */}
            {agentStatus !== 'available' && !currentSession && (
              <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/80">
                <p className="text-xs text-slate-500 text-center">
                  Set status to <strong className="text-emerald-400">Available</strong> to auto-receive visitors
                </p>
              </div>
            )}
          </aside>


          <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {currentSession ? (
              <>
                {/* Chat top-bar */}
                <div className="flex-none flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-bold text-white text-sm flex-none">
                      {initials((currentSession as any).visitor_name ?? '?')}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{(currentSession as any).visitor_name}</p>
                      <p className="text-xs text-slate-400">{(currentSession as any).visitor_email}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleComplete}
                    disabled={completing}
                    className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shadow-lg"
                  >
                    {completing ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Completing…
                      </>
                    ) : (
                      <>✓ Mark Complete</>
                    )}
                  </button>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 select-none gap-2">
                      <div className="text-4xl opacity-30">💬</div>
                      <p className="text-sm">No messages yet — say hello!</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      // ALL agent messages go right; visitor messages go left.
                      // Use sender_role so historical messages from OTHER agents
                      // also align correctly — not just the currently logged-in agent.
                      const isAgent = msg.sender_role === 'agent';
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-end gap-2 ${isAgent ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                          {/* Avatar */}
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-none mb-0.5 ${
                              isAgent
                                ? 'bg-blue-600 text-white'
                                : 'bg-gradient-to-br from-blue-500 to-violet-600 text-white'
                            }`}
                          >
                            {isAgent ? initials(user.username) : initials(msg.sender_name ?? '?')}
                          </div>

                          {/* Bubble */}
                          <div
                            className={`max-w-[60%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                              isAgent
                                ? 'bg-blue-600 text-white rounded-br-sm'
                                : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-sm'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <p
                              className={`text-xs mt-1 ${
                                isAgent ? 'text-blue-200/70' : 'text-slate-500'
                              }`}
                            >
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="flex-none px-5 py-4 bg-slate-900 border-t border-slate-800">
                  <form onSubmit={handleSend} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      placeholder={isConnected ? 'Type a message…' : 'Reconnecting…'}
                      disabled={!isConnected}
                      className="flex-1 bg-slate-800 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                    <button
                      type="submit"
                      disabled={!msgInput.trim() || !isConnected}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shadow-lg"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </>
            ) : (
              /* ── No active session: idle state ────────────────────────── */
              <div className="flex-1 flex flex-col items-center justify-center text-center select-none gap-5 px-8">
                <div className="w-20 h-20 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-4xl">
                  {agentStatus === 'available' ? '⏳' : agentStatus === 'busy' ? '⏸️' : '💤'}
                </div>
                <div>
                  <p className="text-xl font-bold text-white mb-1">
                    {agentStatus === 'available'
                      ? waitingList.length > 0
                        ? 'You will be assigned shortly…'
                        : 'Ready — waiting for visitors'
                      : agentStatus === 'busy'
                        ? 'Status: Busy'
                        : 'You are offline'}
                  </p>
                  <p className="text-slate-500 text-sm max-w-sm mx-auto">
                    {agentStatus === 'available'
                      ? waitingList.length > 0
                        ? `${waitingList.length} visitor${waitingList.length > 1 ? 's' : ''} waiting — click Available to auto-accept`
                        : 'New visitors will be assigned to you automatically when they arrive.'
                      : agentStatus === 'busy'
                        ? 'Set your status to Available to receive new visitors.'
                        : 'Set your status to Available or Busy to start accepting visitors.'}
                  </p>
                </div>

                {agentStatus !== 'available' && (
                  <button
                    onClick={() => handleStatusChange('available')}
                    disabled={accepting}
                    className="mt-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition shadow-lg text-sm"
                  >
                    {accepting ? 'Setting…' : '✓ Set Available'}
                  </button>
                )}

                {agentStatus === 'available' && waitingList.length > 0 && (
                  <button
                    onClick={() => handleStatusChange('available')}
                    disabled={accepting}
                    className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-semibold rounded-xl transition shadow-lg text-sm"
                  >
                    {accepting ? 'Assigning…' : '→ Accept Next Visitor'}
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
