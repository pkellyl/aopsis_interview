import { useState } from 'react'

export default function PersonaPanel({ state }) {
  const [selectedId, setSelectedId] = useState(null)

  const personas = state.outputs?.personas
  const personaList = personas?.personas || []
  const rationale = personas?.design_rationale
  const phase = state.phase

  if (!personas) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none px-4 py-2 border-b border-gray-800 bg-gray-900/30">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Personas
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm italic">
            {phase === 'idle' || phase === 'context_gathering'
              ? 'Waiting for brief...'
              : 'Generating personas...'}
          </p>
        </div>
      </div>
    )
  }

  const selected = selectedId !== null ? personaList[selectedId] : null

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none px-4 py-2 border-b border-gray-800 bg-gray-900/30 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Personas
          <span className="ml-2 text-gray-500 normal-case font-normal">
            ({personaList.length})
          </span>
        </h2>
        <a
          href="/api/export/personas"
          download="personas.json"
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          ↓ Export
        </a>
      </div>

      {/* Design rationale */}
      {rationale && (
        <div className="flex-none px-4 py-2 bg-gray-900/20 border-b border-gray-800/50 max-h-20 overflow-y-auto">
          <p className="text-xs text-gray-400">{rationale}</p>
        </div>
      )}

      {/* Persona cards */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-2">
          {personaList.map((p, i) => {
            const interviewStatus = _getInterviewStatus(state, p.name)
            return (
              <button
                key={i}
                onClick={() => setSelectedId(selectedId === i ? null : i)}
                className={`text-left rounded-lg border p-2 text-xs transition-colors min-w-[140px] max-w-[200px] ${
                  selectedId === i
                    ? 'border-blue-600 bg-blue-900/20'
                    : 'border-gray-700 bg-gray-800/40 hover:bg-gray-800/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${_statusColor(interviewStatus)}`} />
                  <span className="font-medium text-gray-200 truncate">{p.name}</span>
                </div>
                <p className="text-gray-500 mt-1 truncate">{p.role}</p>
              </button>
            )
          })}
        </div>

        {/* Detail view */}
        {selected && (
          <div className="mt-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700 text-xs">
            <h3 className="font-semibold text-gray-200">{selected.name}</h3>
            <p className="text-gray-400 mt-1">{selected.role} · {selected.department}</p>
            <p className="text-gray-300 mt-2">{selected.description}</p>
            {selected.traits && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selected.traits.map((t, j) => (
                  <span key={j} className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <details className="mt-3">
              <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                System prompt
              </summary>
              <pre className="mt-2 p-2 bg-gray-900 rounded text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] max-h-40 overflow-y-auto">
                {selected.system_prompt}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

function _getInterviewStatus(state, personaName) {
  const transcripts = state.outputs?.transcripts || []
  const match = transcripts.find(t => t.persona_name === personaName)
  if (!match) return 'waiting'
  if (match.status === 'complete') return 'complete'
  if (match.status === 'running') return 'in_progress'
  return 'waiting'
}

function _statusColor(status) {
  switch (status) {
    case 'complete': return 'bg-green-500'
    case 'in_progress': return 'bg-blue-500 animate-pulse'
    case 'error': return 'bg-red-500'
    default: return 'bg-gray-600'
  }
}
