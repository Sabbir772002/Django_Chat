import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>Real-Time Chat System</title>
        <meta name="description" content="Multi-agent chat system" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-6xl font-bold mb-6">💬 Chat System</h1>
          <p className="text-2xl mb-12">Real-time support for your customers</p>
          
          <div className="space-y-4">
            <div className="space-x-4">
              <Link 
                href="/visitor" 
                className="inline-block bg-white text-blue-600 px-10 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition"
              >
                👤 Join as Visitor
              </Link>
              <Link 
                href="/agent-login" 
                className="inline-block bg-transparent border-3 border-white text-white px-10 py-4 rounded-lg font-bold text-lg hover:bg-white hover:text-blue-600 transition"
              >
                🎧 Agent Login
              </Link>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-white bg-opacity-10 backdrop-blur-lg p-6 rounded-lg">
              <div className="text-4xl mb-2">⚡</div>
              <h3 className="font-bold text-lg">Real-time</h3>
              <p className="text-sm">Instant messaging</p>
            </div>
            <div className="bg-white bg-opacity-10 backdrop-blur-lg p-6 rounded-lg">
              <div className="text-4xl mb-2">🤖</div>
              <h3 className="font-bold text-lg">Auto Assign</h3>
              <p className="text-sm">Smart routing</p>
            </div>
            <div className="bg-white bg-opacity-10 backdrop-blur-lg p-6 rounded-lg">
              <div className="text-4xl mb-2">📝</div>
              <h3 className="font-bold text-lg">History</h3>
              <p className="text-sm">Message saving</p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
