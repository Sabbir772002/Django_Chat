import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { LoginForm } from '@/components/LoginForm';

export default function AgentLogin() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  // Check auth on mount and redirect if already logged in
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (storedToken && storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          if (userData.role === 'agent') {
            router.push('/agent');
            return;
          }
        } catch (e) {
          console.error('Failed to parse user:', e);
        }
      }
    }
    setIsReady(true);
  }, [router]);

  // Show loading state while checking auth
  if (!isReady) {
    return (
      <>
        <Head>
          <title>Loading...</title>
        </Head>
        <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Loading...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Agent Login</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-900">Agent Portal</h1>
          <p className="text-center text-gray-600 mb-8">Login to manage support chats</p>
          <LoginForm />
          <p className="text-center text-gray-600 text-sm mt-6">
            Don't have an account?{' '}
            <a href="#" className="text-blue-600 hover:underline">
              Contact Admin
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
