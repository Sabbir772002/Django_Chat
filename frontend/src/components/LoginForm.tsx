import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useChatStore } from '@/context/ChatStore';
import { authAPI } from '@/utils/api';
import toast from 'react-hot-toast';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setToken } = useChatStore();
  const isAgent = router.pathname.includes('agent');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authAPI.login(username, password);
      
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format from server');
      }
      
      const { access, user } = response.data;
      
      if (!access || !user) {
        throw new Error('Missing token or user data in response');
      }

      setToken(access);
      setUser(user);
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', access);
        localStorage.setItem('user', JSON.stringify(user));
      }
      
      toast.success('Logged in successfully');

      if (isAgent) {
        router.push('/agent');
      } else {
        router.push('/visitor');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const errorData = error.response?.data;
      
      if (typeof errorData === 'object' && !errorData.error && !errorData.detail) {
        const errorMessages = Object.values(errorData).flat().join(', ');
        if (errorMessages) {
          toast.error(errorMessages);
          return;
        }
      }
      
      const errorMsg = errorData?.error || errorData?.detail || error.message || 'Login failed';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-700">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          placeholder="Enter username"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          placeholder="Enter password"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition font-medium"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
