import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
      <div className="flex-none px-4 py-2 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Research Briefing
          {briefComplete && (
            <span className="ml-2 text-green-600 normal-case font-normal">✓ Brief complete</span>
          )}
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {phase === 'idle' && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-gray-700 text-sm">Ready to begin a research briefing session.</p>
            <button
              onClick={handleStart}
              disabled={starting}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {starting ? 'Starting...' : 'Start Session'}
            </button>
          </div>
        )}
        {phase !== 'idle' && messages.length === 0 && (
          <p className="text-gray-600 text-sm italic">Loading conversation...</p>
        )}
        {messages.map((msg, i) => {
          // Strip [BRIEF_COMPLETE] signal and trailing JSON from display
          let displayContent = msg.content
          if (msg.role === 'assistant' && displayContent.includes('[BRIEF_COMPLETE]')) {
            displayContent = displayContent.split('[BRIEF_COMPLETE]')[0].trim()
            if (!displayContent) displayContent = 'Brief complete — see the Research Brief panel →'
          }
          return (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap">{displayContent}</p>
              ) : (
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-p:text-gray-800 prose-headings:text-gray-800 prose-li:text-gray-800 prose-strong:text-gray-800">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                </div>
              )}
              <span className={`text-xs mt-1 block ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                {msg.role === 'user' ? 'You' : 'Context Agent'}
              </span>
            </div>
          </div>
        )})}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg px-3 py-2 text-sm text-gray-600 border border-gray-200 shadow-sm">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-none p-3 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={phase === 'context_gathering'
              ? 'Type a message... (prefix / for commands)'
              : 'Prefix / for orchestrator commands'}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-500 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1 px-1">
          / prefix sends to orchestrator · Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
