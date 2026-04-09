import { useState, useRef, useEffect } from 'react'
import ArtifactBar from './ArtifactBar'

const _CSS = `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}h1{border-bottom:2px solid #2563eb;padding-bottom:8px;color:#1e3a5f}h2{color:#2563eb;margin-top:32px}h3{color:#374151}.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0}.interviewer{background:#f0f9ff;border-left:3px solid #2563eb;padding:8px 16px;margin:8px 0;border-radius:0 6px 6px 0}.persona{background:#fffbeb;border-left:3px solid #d97706;padding:8px 16px;margin:8px 0;border-radius:0 6px 6px 0}.meta{color:#6b7280;font-size:13px}@media print{body{margin:20px}.card,.interviewer,.persona{break-inside:avoid}}`

function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

export default function InterviewPanel({ state, api }) {
  const [expanded, setExpanded] = useState({})

  const strategy = state.outputs?.interview_strategy
  const transcripts = state.outputs?.transcripts || []
  const personas = state.outputs?.personas?.personas || []
  const phase = state.phase
  const maxTurns = state.config_limits?.max_turns || 15

  const handleDownloadHtml = () => {
    if (transcripts.length === 0) return
    let body = ''
    for (const t of transcripts) {
      const name = _esc(t.persona_name || t.persona_id || 'Unknown')
      body += `<h2>Interview: ${name}</h2>`
      body += `<p class="meta">Status: ${_esc(t.status)} · Turns: ${(t.turns || []).length}</p>`
      for (const turn of (t.turns || [])) {
        const cls = turn.role === 'interviewer' ? 'interviewer' : 'persona'
        const speaker = turn.role === 'interviewer' ? 'Interviewer' : name
        body += `<div class="${cls}"><strong>${speaker}</strong><p>${_esc(turn.content)}</p></div>`
      }
    }
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Interview Transcripts</title><style>${_CSS}</style></head><body><h1>Interview Transcripts</h1>${body}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'interviews.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  const running = transcripts.filter(t => t.status === 'running').length
  const complete = transcripts.filter(t => t.status === 'complete').length

  // No strategy, no transcripts — contextual empty state
  if (!strategy && transcripts.length === 0) {
    const msg = phase === 'persona_generation'
      ? 'Interview strategy will be generated after personas are ready.'
      : phase === 'interviewing'
      ? 'Generating interview strategy...'
      : 'Waiting for interview strategy...'
    const showSpinner = phase === 'interviewing' || phase === 'persona_generation'
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-sm">{msg}</p>
          {showSpinner && (
            <div className="mt-3 flex justify-center">
              <span className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    )
  }

  // Strategy exists but no transcripts yet — show strategy prominently
  if (strategy && transcripts.length === 0) {
    const strategyText = typeof strategy === 'string' ? strategy : strategy.interview_strategy || JSON.stringify(strategy, null, 2)
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Interview Strategy</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{strategyText}</p>
            </div>
            <div className="flex items-center justify-center gap-2 py-4">
              <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Starting interviews...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header bar */}
      <div className="flex-none px-5 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-700">
            {transcripts.length}/{personas.length} interviews
          </span>
          {running > 0 && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {running} running
            </span>
          )}
          {complete > 0 && (
            <span className="text-xs text-green-600">{complete} complete</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {transcripts.length > 0 && (
            <button
              onClick={handleDownloadHtml}
              className="px-2 py-1 text-xs text-violet-700 border border-violet-200 rounded hover:bg-violet-50 transition-colors"
            >
              ↓ HTML
            </button>
          )}
          <ArtifactBar stage="transcripts" api={api} state={state} />
        </div>
      </div>

      {/* Strategy banner */}
      {strategy && (
        <details className="flex-none border-b border-gray-200 bg-gray-50">
          <summary className="px-5 py-2 text-xs text-gray-700 cursor-pointer hover:text-gray-900 font-medium">
            Interview Strategy
          </summary>
          <div className="px-5 pb-3">
            <pre className="p-3 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
              {typeof strategy === 'string' ? strategy : strategy.interview_strategy || JSON.stringify(strategy, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {/* Stacked interview panels */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {transcripts.length === 0 && (
          <p className="text-gray-600 text-sm italic text-center py-8">
            Interviews starting soon...
          </p>
        )}

        {transcripts.map((t, i) => {
          const turns = t.turns || []
          const isRunning = t.status === 'running'
          const isExpanded = expanded[t.persona_id]
          const turnCount = turns.length
          const progress = Math.min((turnCount / maxTurns) * 100, 100)

          return (
            <div
              key={t.persona_id || i}
              className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
            >
              {/* Sticky header */}
              <button
                onClick={() => toggle(t.persona_id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors sticky top-0 bg-white z-10 border-b border-gray-100"
              >
                {/* Status dot */}
                <span className={`w-2 h-2 rounded-full flex-none ${
                  isRunning ? 'bg-blue-500 animate-pulse' :
                  t.status === 'complete' ? 'bg-green-500' :
                  t.status === 'failed' ? 'bg-red-500' :
                  'bg-gray-300'
                }`} />

                {/* Name */}
                <span className="text-sm font-medium text-gray-800 flex-1">{t.persona_name}</span>

                {/* Turn count */}
                <span className="text-xs text-gray-600">
                  {turnCount}{isRunning ? `/${maxTurns}` : ''} turns
                </span>

                {/* Progress bar (only when running) */}
                {isRunning && (
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden flex-none">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {/* Status badge */}
                <span className={`text-xs px-2 py-0.5 rounded-full flex-none ${
                  isRunning ? 'bg-blue-50 text-blue-700' :
                  t.status === 'complete' ? 'bg-green-50 text-green-700' :
                  t.status === 'failed' ? 'bg-red-50 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {t.status}
                </span>

                {/* Chevron */}
                <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </button>

              {/* Transcript body */}
              {isExpanded && (
                <TranscriptBody transcript={t} isRunning={isRunning} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TranscriptBody({ transcript, isRunning }) {
  const endRef = useRef(null)
  const turns = transcript.turns || []

  useEffect(() => {
    if (isRunning) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [turns.length, isRunning])

  return (
    <div className="px-4 py-3 space-y-2.5 max-h-80 overflow-y-auto">
      {turns.map((turn, i) => (
        <div key={i} className="text-xs">
          <span className={`font-semibold ${
            turn.role === 'interviewer' ? 'text-blue-700' : 'text-amber-700'
          }`}>
            {turn.role === 'interviewer' ? 'INTERVIEWER' : transcript.persona_name.toUpperCase()}
          </span>
          <p className="text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">{turn.content}</p>
        </div>
      ))}
      {isRunning && (
        <p className="text-blue-500 text-xs animate-pulse">Waiting for response...</p>
      )}
      <div ref={endRef} />
    </div>
  )
}
