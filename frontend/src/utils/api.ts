import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// attach token if we have one
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const noAuthRoutes = ['/api/auth/register/', '/api/auth/login/', '/api/auth/refresh/'];
  const requiresAuth = !noAuthRoutes.some(route => config.url?.includes(route));
  
  if (token && requiresAuth) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// handle 401, kick user out if token expired
apiClient.interceptors.response.use(
  response => response,
  error => {
    const isAuthEndpoint = ['/api/auth/login/', '/api/auth/register/', '/api/auth/refresh/'].some(
      route => error.config?.url?.includes(route)
    );
    if (error.response?.status === 401 && !isAuthEndpoint) {
      if (typeof window !== 'undefined') {
        const storedUser = localStorage.getItem('user');
        const isAgent = storedUser ? (() => { try { return JSON.parse(storedUser).role === 'agent'; } catch { return false; } })() : false;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        const loginPath = isAgent ? '/agent-login' : '/';
        if (!window.location.pathname.includes('login') && window.location.pathname !== '/') {
          window.location.href = loginPath;
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (username: string, email: string, password: string, role: 'visitor' | 'agent' = 'visitor') =>
    apiClient.post('/api/auth/register/', { username, email, password, password2: password, role }),
  
  login: (username: string, password: string) =>
    apiClient.post('/api/auth/login/', { username, password }),
};

export const chatAPI = {
  createSession: () =>
    apiClient.post('/api/chat/sessions/', {}),

  getMySession: () =>
    apiClient.get('/api/chat/sessions/my-session/'),
  
  getSession: (sessionId: string) =>
    apiClient.get(`/api/chat/sessions/${sessionId}/`),
  
  getMessages: (sessionId: string) =>
    apiClient.get(`/api/chat/sessions/${sessionId}/messages/`),
  
  sendMessage: (sessionId: string, content: string) =>
    apiClient.post('/api/chat/messages/', { session: sessionId, content }),
  
  getWaitingSessions: () =>
    apiClient.get('/api/chat/sessions/waiting/list/'),

  getMyActiveSession: () =>
    apiClient.get('/api/chat/sessions/my-active/'),

  getMyActiveSessions: () =>
    apiClient.get('/api/chat/sessions/my-active/'),

  assignSession: (sessionId: string) =>
    apiClient.post(`/api/chat/sessions/${sessionId}/assign/`, {}),
  
  completeSession: (sessionId: string) =>
    apiClient.post(`/api/chat/sessions/${sessionId}/complete/`, {}),
  
  getActiveUsers: () =>
    apiClient.get('/api/chat/users/active-users/'),

  getMyMessages: () =>
    apiClient.get('/api/chat/users/my-messages/'),
};

export const agentAPI = {
  getAvailable: () =>
    apiClient.get('/api/chat/users/agents'),

  getMe: () =>
    apiClient.get('/api/chat/users/me/'),
  
  updateStatus: (status: 'available' | 'busy' | 'offline') =>
    apiClient.post('/api/chat/users/update_status/', { status }),
  
  getAllVisitors: () =>
    apiClient.get('/api/chat/users/all-visitors/'),
  
  getVisitorMessages: (visitorId: string) =>
    apiClient.get('/api/chat/users/visitor-messages/', { params: { visitor_id: visitorId } }),
};

export default apiClient;
