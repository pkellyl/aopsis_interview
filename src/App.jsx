import { useState, useEffect, useRef } from 'react'
import SettingsDrawer from './SettingsDrawer'
import BriefingTab from './BriefingTab'
import PersonasTab from './PersonasTab'
import InterviewPanel from './InterviewPanel'
import SummaryTab from './SummaryTab'
import LogPanel from './LogPanel'
import useSSE from './useSSE'
import useAPI from './useAPI'

const PHASE_TAB = {
  idle: 'briefing',
  context_gathering: 'briefing',
  persona_generation: 'personas',
  interviewing: 'interviews',
  synthesizing: 'summary',
  complete: 'summary',
}

const PIPELINE = ['briefing', 'personas', 'interviews', 'summary']

function _getTabs(state) {
  const personas = state.outputs?.personas?.personas || []
  const transcripts = state.outputs?.transcripts || []
  const running = transcripts.filter(t => t.status === 'running').length
  const complete = transcripts.filter(t => t.status === 'complete').length
  const synthesis = state.outputs?.synthesis

  return [
    { id: 'briefing', label: 'Briefing', badge: state.outputs?.brief ? '✓' : null, badgeColor: 'bg-green-50 text-green-700' },
    { id: 'personas', label: 'Personas',
      badge: personas.length > 0 ? personas.length : (state.phase === 'persona_generation' && !state.outputs?.personas ? '⟳' : null),
      badgeColor: personas.length > 0 ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-600 animate-pulse' },
    {
      id: 'interviews', label: 'Interviews',
      badge: transcripts.length > 0 ? `${complete}/${transcripts.length}` : null,
      badgeColor: running > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
    },
    { id: 'summary', label: 'Summary', badge: synthesis ? '✓' : null, badgeColor: 'bg-green-50 text-green-700' },
  ]
}

export default function App() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('briefing')
  const [logOpen, setLogOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const prevPhase = useRef(null)
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

  // Auto-navigate to relevant tab on phase change
  useEffect(() => {
    if (!state) return
    const phase = state.phase
    if (phase !== prevPhase.current && PHASE_TAB[phase]) {
      setActiveTab(PHASE_TAB[phase])
      prevPhase.current = phase
    }
  }, [state?.phase])

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 text-red-600">
        <div className="text-center">
          <p className="text-lg font-semibold">Connection Error</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 text-gray-600">
        <p>Connecting...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="flex-none h-12 flex items-center px-5 border-b border-gray-200 bg-white">
        <h1 className="text-sm font-semibold tracking-wide text-gray-800">
          Synthetic Audience
        </h1>
        {/* Pipeline progress */}
        <div className="ml-4 flex items-center gap-1">
          {PIPELINE.map((step, i) => {
            const stepPhases = Object.entries(PHASE_TAB).filter(([,t]) => t === step).map(([p]) => p)
            const isActive = stepPhases.includes(state.phase)
            const isDone = PIPELINE.indexOf(PHASE_TAB[state.phase] || 'briefing') > i ||
              (state.phase === 'complete' && step === 'summary')
            return (
              <div key={step} className="flex items-center gap-1">
                {i > 0 && <span className={`w-4 h-px ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />}
                <span className={`w-2 h-2 rounded-full ${
                  isActive ? 'bg-blue-500 animate-pulse' :
                  isDone ? 'bg-green-500' : 'bg-gray-200'
                }`} title={step} />
              </div>
            )
          })}
        </div>
        <span className="ml-2 text-xs text-gray-600 font-mono">{state.phase}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button
            onClick={() => {
              if (window.confirm('Reset will clear all data and restart. Continue?')) {
                api.post('/api/reset', {}).then(() => window.location.reload())
              }
            }}
            className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex-none flex items-center gap-1 px-5 bg-white border-b border-gray-200">
        {_getTabs(state).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab.badgeColor || 'bg-gray-100 text-gray-600'}`}>
                {tab.badge}
              </span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
            )}
          </button>
        ))}
      </nav>

      {/* Main content + log sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Tab content */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {activeTab === 'briefing' && (
            <BriefingTab state={state} api={api} />
          )}
          {activeTab === 'personas' && (
            <PersonasTab state={state} api={api} />
          )}
          {activeTab === 'interviews' && (
            <InterviewPanel state={state} api={api} />
          )}
          {activeTab === 'summary' && (
            <SummaryTab state={state} api={api} />
          )}
        </div>

        {/* Log sidebar */}
        <div className={`flex-none border-l border-gray-200 bg-white transition-all ${logOpen ? 'w-72' : 'w-10'}`}>
          <div className="flex items-center justify-between px-2 py-2 border-b border-gray-200">
            {logOpen && (
              <div className="flex items-center gap-2 px-1 flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Log</span>
                <span className="text-xs text-gray-600">{Object.keys(state.agents || {}).length} agents</span>
                <span className="text-xs text-gray-600">{(state.events || []).length} ev</span>
              </div>
            )}
            <button
              onClick={() => setLogOpen(!logOpen)}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 text-xs flex-none"
              title={logOpen ? 'Collapse log' : 'Expand log'}
            >
              {logOpen ? '▶' : '◀'}
            </button>
          </div>
          {logOpen && (
            <div className="h-full overflow-hidden">
              <LogPanel state={state} events={events} />
            </div>
          )}
          {!logOpen && events.length > 0 && (
            <div className="flex flex-col items-center pt-2 gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Events active" />
              <span className="text-xs text-gray-600 rotate-90 mt-2">{events.length}</span>
            </div>
          )}
        </div>
      </div>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} api={api} />
    </div>
  )
}
