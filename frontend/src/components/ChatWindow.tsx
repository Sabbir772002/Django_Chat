import React from 'react';
import { useChatStore } from '@/context/ChatStore';

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  timestamp: string;
  is_read: boolean;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isConnected: boolean;
  onComplete?: () => void;
  canComplete?: boolean;
}

export function ChatWindow({ messages, onSendMessage, isConnected, onComplete, canComplete }: ChatWindowProps) {
  const [input, setInput] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const { user } = useChatStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  const isOwnMessage = (msg: ChatMessage) => msg.sender_id === user?.id;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${isOwnMessage(msg) ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`px-4 py-2 rounded-lg max-w-xs ${
                  isOwnMessage(msg)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-300 text-gray-900'
                }`}
              >
                <p className="text-xs font-semibold mb-1 opacity-75">
                  {msg.sender_name || 'Unknown'}
                </p>
                <p>{msg.content}</p>
                <small
                  className={`text-xs mt-1 block ${
                    isOwnMessage(msg) ? 'text-blue-100' : 'text-gray-700'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </small>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-2 bg-white border-t border-gray-200 flex justify-between items-center">
        <span className="text-xs text-gray-500">
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
        {canComplete && (
          <button
            onClick={onComplete}
            className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition"
          >
            Complete Chat
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
