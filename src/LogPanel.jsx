import { useRef } from 'react'

export default function LogPanel({ state, events }) {
  const feedRef = useRef(null)

  const orchestratorLog = state.orchestrator_log || []
  const systemLog = state.system_log || []
  const phase = state.phase || 'idle'

  // Errors from system log
  const errors = systemLog.filter(e => e.error)

  // Token totals from system log
  const tokensIn = systemLog.reduce((sum, e) => sum + (e.tokens_in || 0), 0)
  const tokensOut = systemLog.reduce((sum, e) => sum + (e.tokens_out || 0), 0)

  // Latest orchestrator decision
  const latestDecision = orchestratorLog.length > 0 ? orchestratorLog[orchestratorLog.length - 1] : null

  // Activity feed — reverse chronological (newest first)
  const feed = [
    ...orchestratorLog.map(e => ({ ...e, _kind: 'orchestrator' })),
    ...systemLog.map(e => ({ ...e, _kind: 'system' })),
    ...events.map(e => ({ ...e, _kind: 'event' })),
  ].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))

  // Status: red if errors, blue if active work, green if complete, gray if idle
  const hasActive = phase !== 'idle' && phase !== 'complete'
  const statusColor = errors.length > 0 ? 'bg-red-500' : hasActive ? 'bg-blue-500 animate-pulse' : phase === 'complete' ? 'bg-green-500' : 'bg-gray-300'
  const statusLabel = errors.length > 0 ? 'Error' : hasActive ? _phaseLabel(phase) : phase === 'complete' ? 'Complete' : 'Idle'

  return (
    <div className="flex flex-col h-full">
      {/* Status strip */}
      <div className="flex-none px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-none ${statusColor}`} />
          <span className="text-xs font-medium text-gray-700">{statusLabel}</span>
        </div>
        <a
          href="/api/export/full"
          download="full_export.json"
          className="text-xs text-gray-600 hover:text-gray-800 transition-colors"
        >
          Export
        </a>
      </div>

      {/* Error banner */}
      {errors.length > 0 && (
        <div className="flex-none px-3 py-2 bg-red-50 border-b border-red-200">
          <p className="text-xs font-medium text-red-700">
            {errors.length} error{errors.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-red-600 mt-0.5 truncate">
            {errors[errors.length - 1].error}
          </p>
        </div>
      )}

      {/* Latest orchestrator decision */}
      {latestDecision && (
        <div className="flex-none px-3 py-2 border-b border-gray-200 bg-amber-50">
          <p className="text-xs font-semibold text-amber-800 mb-0.5">Latest Decision</p>
          <p className="text-xs text-gray-700 leading-relaxed">
            {_formatDecision(latestDecision.decision) || latestDecision.summary || '...'}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">{_formatTime(latestDecision.timestamp)}</p>
        </div>
      )}

      {/* Activity feed */}
      <div className="flex-none px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">Activity</span>
        <span className="text-xs text-gray-600">{feed.length}</span>
      </div>

      <div ref={feedRef} className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px] space-y-px">
        {feed.length === 0 && (
          <p className="text-gray-600 italic text-xs px-1 py-2">No activity yet.</p>
        )}
        {feed.map((entry, i) => (
          <div
            key={i}
            className={`flex gap-1.5 py-1 px-1 rounded ${
              entry._kind === 'orchestrator'
                ? 'border-l-2 border-amber-400 pl-2 bg-amber-50/50'
                : entry._kind === 'event'
                ? 'border-l-2 border-blue-400 pl-2'
                : entry.error
                ? 'border-l-2 border-red-400 pl-2 bg-red-50/50'
                : 'pl-3'
            }`}
          >
            <span className="text-gray-500 flex-none w-14 truncate">
              {_formatTime(entry.timestamp)}
            </span>
            {entry._kind === 'orchestrator' && (
              <span className="text-gray-700 truncate">
                {_formatDecision(entry.decision) || entry.summary || '...'}
              </span>
            )}
            {entry._kind === 'event' && (
              <>
                <span className="text-blue-700 flex-none font-medium">{_shortEventType(entry.event_type)}</span>
                <span className="text-gray-600 truncate">{entry.summary}</span>
              </>
            )}
            {entry._kind === 'system' && (
              <>
                <span className="text-gray-600 flex-none">{entry.agent_id || 'sys'}</span>
                {entry.error ? (
                  <span className="text-red-600 truncate">ERR: {entry.error}</span>
                ) : (
                  <span className="text-gray-600 truncate">
                    {_formatTokens(entry.tokens_in, entry.tokens_out)}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Token totals footer */}
      {(tokensIn > 0 || tokensOut > 0) && (
        <div className="flex-none px-3 py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-700">
            <span>Tokens</span>
            <span className="font-mono">{_fmtK(tokensIn)} in / {_fmtK(tokensOut)} out</span>
          </div>
        </div>
      )}
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
        if (type === 'ADVANCE_PHASE') return `→ ${p.new_phase}`
        if (type === 'CREATE_AGENT') return `+ ${p.id || p.agent_type}`
        if (type === 'RUN_INTERVIEW') return `▶ ${p.persona_id}`
        if (type === 'SYNTHESIZE') return '⚗ Synthesize'
        if (type === 'COMPLETE_SYSTEM') return `✓ Complete`
        if (type === 'REQUEST_REVISION') return `↺ Revise ${p.target_agent_id}`
        if (type === 'SEND_MESSAGE') return `→ ${p.target_agent_id}`
        return type
      }).join('  ')
    }
  } catch {}
  return typeof decision === 'string' ? decision.slice(0, 100) : '...'
}

function _shortEventType(type) {
  if (!type) return '?'
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 20)
}

function _formatTokens(tokIn, tokOut) {
  if (!tokIn && !tokOut) return ''
  return `${_fmtK(tokIn || 0)}/${_fmtK(tokOut || 0)}`
}

function _fmtK(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function _formatTime(ts) {
  if (!ts) return '--:--'
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts.slice(11, 19)
  }
}

function _phaseLabel(phase) {
  const labels = {
    context_gathering: 'Briefing',
    persona_generation: 'Generating Personas',
    interviewing: 'Interviewing',
    synthesizing: 'Synthesizing',
  }
  return labels[phase] || phase
}
