import { useState, useRef, useEffect } from 'react'

export default function ConversationPanel({ state, api }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const messagesEndRef = useRef(null)

  const contextAgent = state.agents?.context
  const messages = contextAgent?.messages || []
  const phase = state.phase
  const briefComplete = state.outputs?.brief !== null

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleStart = async () => {
    setStarting(true)
    try {
      await api.post('/api/start', {})
    } catch (e) {
      console.error('Start failed:', e)
    } finally {
      setStarting(false)
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')
    try {
      if (text.startsWith('/')) {
        await api.post('/api/command', { message: text.slice(1) })
      } else {
        await api.post('/api/chat', { message: text })
      }
    } catch (e) {
      console.error('Send failed:', e)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex-none px-4 py-2 border-b border-gray-800 bg-gray-900/30">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Conversation
          {briefComplete && (
            <span className="ml-2 text-green-500 normal-case font-normal">✓ Brief complete</span>
          )}
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {phase === 'idle' && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-gray-500 text-sm">Ready to begin a research briefing session.</p>
            <button
              onClick={handleStart}
              disabled={starting}
              className="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              {starting ? 'Starting...' : 'Start Session'}
            </button>
          </div>
        )}
        {phase !== 'idle' && messages.length === 0 && (
          <p className="text-gray-600 text-sm italic">Loading conversation...</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-900/40 text-blue-100 border border-blue-800/50'
                  : 'bg-gray-800/60 text-gray-200 border border-gray-700/50'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <span className="text-[10px] text-gray-500 mt-1 block">
                {msg.role === 'user' ? 'You' : 'Context Agent'}
              </span>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-sm text-gray-400 border border-gray-700/50">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-none p-3 border-t border-gray-800 bg-gray-900/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={phase === 'context_gathering'
              ? 'Type a message... (prefix / for commands)'
              : 'Prefix / for orchestrator commands'}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-600"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1 px-1">
          / prefix sends to orchestrator · Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
