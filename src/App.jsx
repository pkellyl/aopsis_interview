import { useState, useEffect } from 'react'
import ConversationPanel from './ConversationPanel'
import PersonaPanel from './PersonaPanel'
import InterviewPanel from './InterviewPanel'
import LogPanel from './LogPanel'
import useSSE from './useSSE'
import useAPI from './useAPI'

export default function App() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const api = useAPI()
  const events = useSSE('/api/events')

  useEffect(() => {
    api.get('/api/state')
      .then(setState)
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    if (events.length === 0) return
    api.get('/api/state').then(setState).catch(() => {})
  }, [events.length])

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-red-400 font-mono">
        <div className="text-center">
          <p className="text-lg">Connection Error</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-gray-800 rounded hover:bg-gray-700 text-gray-300 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-500 font-mono">
        <p>Connecting...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex-none h-10 flex items-center px-4 border-b border-gray-800 bg-gray-900/50">
        <h1 className="text-sm font-semibold tracking-wide text-gray-300">
          SYNTHETIC AUDIENCE INTERVIEW SYSTEM
        </h1>
        <span className="ml-3 text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
          {state.phase}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span>{Object.keys(state.agents || {}).length} agents</span>
          <span>{(state.events || []).length} events</span>
        </div>
      </header>

      {/* Main panels */}
      <div className="flex-1 flex min-h-0">
        {/* Panel 1: Conversation (left, 40%) */}
        <div className="w-2/5 border-r border-gray-800 flex flex-col min-h-0">
          <ConversationPanel state={state} api={api} />
        </div>

        {/* Right side (60%) */}
        <div className="w-3/5 flex flex-col min-h-0">
          {/* Panel 2: Personas (top right, 45%) */}
          <div className="h-[45%] border-b border-gray-800 flex flex-col min-h-0">
            <PersonaPanel state={state} />
          </div>

          {/* Panel 3: Interviews (bottom right, 55%) */}
          <div className="h-[55%] flex flex-col min-h-0">
            <InterviewPanel state={state} />
          </div>
        </div>
      </div>

      {/* Panel 4: Orchestrator & System Log (bottom strip) */}
      <div className="flex-none h-[15vh] border-t border-gray-800">
        <LogPanel state={state} events={events} />
      </div>
    </div>
  )
}
