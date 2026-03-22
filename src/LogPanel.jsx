import { useRef, useEffect } from 'react'

export default function LogPanel({ state, events }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  const orchestratorLog = state.orchestrator_log || []
  const systemLog = state.system_log || []

  // Interleave orchestrator decisions and system log entries by timestamp
  const combined = [
    ...orchestratorLog.map(e => ({ ...e, _kind: 'orchestrator' })),
    ...systemLog.map(e => ({ ...e, _kind: 'system' })),
    ...events.map(e => ({ ...e, _kind: 'event' })),
  ].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none px-4 py-1.5 border-b border-gray-800 bg-gray-900/30 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          System Log
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-600">
            {orchestratorLog.length} decisions · {systemLog.length} API calls · {events.length} events
          </span>
          <a
            href="/api/export/full"
            download="full_export.json"
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            ↓ Full Export
          </a>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-0.5">
        {combined.length === 0 && (
          <p className="text-gray-600 italic">No activity yet.</p>
        )}
        {combined.map((entry, i) => (
          <div
            key={i}
            className={`flex gap-2 py-0.5 ${
              entry._kind === 'orchestrator'
                ? 'border-l-2 border-amber-600 pl-2'
                : entry._kind === 'event'
                ? 'border-l-2 border-blue-800 pl-2 text-gray-500'
                : 'pl-3 text-gray-600'
            }`}
          >
            <span className="text-gray-600 flex-none w-20 truncate">
              {_formatTime(entry.timestamp)}
            </span>
            {entry._kind === 'orchestrator' && (
              <>
                <span className="text-amber-400 flex-none">ORCH</span>
                <span className="text-gray-300 truncate">
                  {_formatDecision(entry.decision) || entry.summary || '...'}
                </span>
              </>
            )}
            {entry._kind === 'event' && (
              <>
                <span className="text-blue-400 flex-none">{entry.event_type}</span>
                <span className="text-gray-400 truncate">{entry.summary}</span>
              </>
            )}
            {entry._kind === 'system' && (
              <>
                <span className="text-gray-500 flex-none">{entry.agent_id || 'sys'}</span>
                <span className="text-gray-600 truncate">
                  {entry.model || ''} in={entry.tokens_in || 0} out={entry.tokens_out || 0}
                  {entry.error ? ` ERR: ${entry.error}` : ''}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function _formatDecision(decision) {
  if (!decision) return null
  try {
    const actions = JSON.parse(decision)
    if (Array.isArray(actions)) {
      return actions.map(a => {
        const type = a.type || '?'
        const p = a.params || {}
        if (type === 'ADVANCE_PHASE') return `→ ${p.new_phase}: ${p.reason || ''}`
        if (type === 'CREATE_AGENT') return `+ ${p.id || p.agent_type}`
        if (type === 'RUN_INTERVIEW') return `▶ Interview: ${p.persona_id}`
        if (type === 'COMPLETE_SYSTEM') return `✓ COMPLETE: ${p.summary || ''}`
        if (type === 'REQUEST_REVISION') return `↺ Revise ${p.target_agent_id}`
        if (type === 'SEND_MESSAGE') return `→ ${p.target_agent_id}`
        return type
      }).join(' | ')
    }
  } catch {}
  return decision.slice(0, 120)
}

function _formatTime(ts) {
  if (!ts) return '--:--:--'
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
  } catch {
    return ts.slice(11, 19)
  }
}
