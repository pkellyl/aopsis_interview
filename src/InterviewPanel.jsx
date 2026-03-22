import { useState } from 'react'

export default function InterviewPanel({ state }) {
  const [selectedIdx, setSelectedIdx] = useState(null)

  const strategy = state.outputs?.interview_strategy
  const transcripts = state.outputs?.transcripts || []
  const personas = state.outputs?.personas?.personas || []
  const phase = state.phase

  if (!strategy && transcripts.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none px-4 py-2 border-b border-gray-800 bg-gray-900/30">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Interviews
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm italic">
            {phase === 'interviewing' ? 'Preparing interviews...' : 'Waiting for personas...'}
          </p>
        </div>
      </div>
    )
  }

  const runningIdx = transcripts.findIndex(t => t.status === 'running')
  const displayIdx = selectedIdx !== null ? selectedIdx : (runningIdx >= 0 ? runningIdx : null)
  const displayTranscript = displayIdx !== null ? transcripts[displayIdx] : null
  const isLive = displayTranscript?.status === 'running'

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none px-4 py-2 border-b border-gray-800 bg-gray-900/30 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Interviews
          <span className="ml-2 text-gray-500 normal-case font-normal">
            ({transcripts.length}/{personas.length})
          </span>
        </h2>
        {transcripts.length > 0 && (
          <a
            href="/api/export/transcripts"
            download="transcripts.json"
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            ↓ Export All
          </a>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar: persona list */}
        <div className="w-40 flex-none border-r border-gray-800/50 overflow-y-auto py-2">
          {personas.map((p, i) => {
            const t = transcripts.find(tr => tr.persona_name === p.name)
            const status = t ? (t.status === 'complete' ? 'complete' : 'in_progress') : 'waiting'
            const tIdx = transcripts.findIndex(tr => tr.persona_name === p.name)
            return (
              <button
                key={i}
                onClick={() => tIdx >= 0 ? setSelectedIdx(tIdx) : null}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-800/40 ${
                  displayIdx === tIdx ? 'bg-gray-800/60' : ''
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${
                  status === 'complete' ? 'bg-green-500' :
                  status === 'in_progress' ? 'bg-blue-500 animate-pulse' :
                  'bg-gray-600'
                }`} />
                <span className="truncate text-gray-300">{p.name}</span>
              </button>
            )
          })}
        </div>

        {/* Main area: transcript */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Strategy (collapsible) */}
          {strategy && (
            <details className="mb-4">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 font-medium">
                Interview Strategy
              </summary>
              <div className="mt-2 p-3 rounded bg-gray-800/40 border border-gray-700/50 text-xs text-gray-400 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                {typeof strategy === 'string' ? strategy : strategy.interview_strategy || JSON.stringify(strategy, null, 2)}
              </div>
            </details>
          )}

          {/* Transcript view (live or completed) */}
          {displayTranscript && (
            <div className="space-y-2">
              <p className={`text-xs font-medium mb-3 ${isLive ? 'text-blue-400' : 'text-green-400'}`}>
                {isLive ? '● Live' : 'Transcript'}: {displayTranscript.persona_name}
                <span className="text-gray-500 ml-2">
                  {(displayTranscript.turns || []).length} turns
                </span>
              </p>
              {(displayTranscript.turns || []).map((turn, i) => (
                <div key={i} className="text-xs">
                  <span className={`font-semibold ${
                    turn.role === 'interviewer' ? 'text-cyan-400' : 'text-amber-400'
                  }`}>
                    {turn.role === 'interviewer' ? 'INTERVIEWER' : displayTranscript.persona_name.toUpperCase()}
                  </span>
                  <p className="text-gray-300 mt-0.5 whitespace-pre-wrap">{turn.content}</p>
                </div>
              ))}
              {isLive && (
                <p className="text-blue-400 text-xs animate-pulse mt-2">Interview in progress...</p>
              )}
            </div>
          )}

          {/* Empty state */}
          {!displayTranscript && (
            <p className="text-gray-600 text-xs italic">
              Select a completed interview or wait for one to begin.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

