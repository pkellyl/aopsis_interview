import { useState } from 'react'
import ArtifactBar from './ArtifactBar'

const _CSS = `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}h1{border-bottom:2px solid #2563eb;padding-bottom:8px;color:#1e3a5f}h2{color:#2563eb;margin-top:32px}.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0}.label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}.tag{display:inline-block;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:12px;margin:2px}@media print{body{margin:20px}.card{break-inside:avoid}}`

function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

export default function PersonasTab({ state, api }) {
  const [expandedId, setExpandedId] = useState(null)

  const personas = state.outputs?.personas
  const personaList = personas?.personas || []
  const rationale = personas?.design_rationale
  const strategy = state.outputs?.interview_strategy
  const transcripts = state.outputs?.transcripts || []
  const phase = state.phase

  const handleDownloadHtml = () => {
    if (!personas) return
    let body = ''
    if (rationale) body += `<h2>Design Rationale</h2><div class="card"><p>${_esc(rationale)}</p></div>`
    for (const p of personaList) {
      body += `<h2>${_esc(p.name)}</h2><div class="card">`
      body += `<p><span class="label">Role</span><br>${_esc(p.role)}</p>`
      if (p.department) body += `<p><span class="label">Department</span><br>${_esc(p.department)}</p>`
      if (p.description) body += `<p><span class="label">Description</span><br>${_esc(p.description)}</p>`
      if (p.background) body += `<p><span class="label">Background</span><br>${_esc(p.background)}</p>`
      if (p.traits?.length) body += `<p class="label">Traits</p>` + p.traits.map(t => `<span class="tag">${_esc(t)}</span>`).join('')
      body += '</div>'
    }
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Persona Profiles</title><style>${_CSS}</style></head><body><h1>Persona Profiles</h1>${body}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'personas.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Get the latest pipeline event for progress display
  const pipelineEvents = (state.events || []).filter(
    e => e.event_type === 'pipeline_progress' || e.event_type === 'output_produced' || e.event_type === 'agent_created'
  )
  const latestEvent = pipelineEvents.length > 0 ? pipelineEvents[pipelineEvents.length - 1] : null

  if (!personas) {
    const isWorking = phase === 'persona_generation' || phase === 'interviewing'
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          {!isWorking ? (
            <p className="text-gray-600 text-sm">
              Personas will appear here once the brief is complete.
            </p>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <span className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              </div>
              <p className="text-gray-800 text-sm font-medium">Generating personas...</p>
              <p className="text-gray-500 text-xs mt-2">
                The AI is designing synthetic interview participants based on your research brief.
                This typically takes 15–30 seconds.
              </p>
              {latestEvent && (
                <p className="text-blue-600 text-xs mt-3 animate-pulse">
                  {latestEvent.summary}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Rationale banner */}
      {rationale && (
        <details className="flex-none border-b border-blue-100 bg-blue-50">
          <summary className="px-5 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-blue-100/50">
            Design Rationale
          </summary>
          <div className="px-5 pb-3">
            <p className="text-sm text-gray-700 leading-relaxed">{rationale}</p>
          </div>
        </details>
      )}

      {/* Interview strategy section */}
      {!strategy && personas && (phase === 'persona_generation' || phase === 'interviewing') && (
        <div className="flex-none px-5 py-3 border-b border-gray-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin flex-none" />
            <p className="text-sm text-gray-700">Generating interview strategy...</p>
          </div>
        </div>
      )}
      {strategy && (
        <details className="flex-none border-b border-gray-200 bg-white" open>
          <summary className="px-5 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-50">
            Interview Strategy
          </summary>
          <div className="px-5 pb-3 max-h-40 overflow-y-auto">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {typeof strategy === 'string' ? strategy : strategy.interview_strategy || JSON.stringify(strategy, null, 2)}
            </p>
          </div>
        </details>
      )}

      {/* Header with count + export */}
      <div className="flex-none px-5 py-2 border-b border-gray-200 flex items-center justify-between bg-white">
        <span className="text-xs text-gray-700">{personaList.length} personas</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadHtml}
            className="px-2 py-1 text-xs text-violet-700 border border-violet-200 rounded hover:bg-violet-50 transition-colors"
          >
            ↓ HTML
          </button>
          <ArtifactBar stage="personas" api={api} state={state} />
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-4">
          {personaList.map((p, i) => {
            const interviewStatus = _getInterviewStatus(transcripts, p.name)
            const isExpanded = expandedId === i

            return (
              <div
                key={i}
                className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Card header — always visible */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : i)}
                  className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
                >
                  {/* Status dot */}
                  <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-none ${_statusColor(interviewStatus)}`} />

                  {/* Name + role */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800">{p.name}</h3>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {p.role}{p.department ? ` · ${p.department}` : ''}
                    </p>
                  </div>

                  {/* Interview status badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-none ${_statusBadge(interviewStatus)}`}>
                    {interviewStatus}
                  </span>

                  {/* Expand chevron */}
                  <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100">
                    {/* Description */}
                    {p.description && (
                      <p className="text-sm text-gray-700 mt-3 leading-relaxed">{p.description}</p>
                    )}

                    {/* Traits */}
                    {p.traits && p.traits.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {p.traits.map((t, j) => (
                          <span key={j} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Background */}
                    {p.background && (
                      <div className="mt-3">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Background</h4>
                        <p className="text-sm text-gray-700 leading-relaxed">{p.background}</p>
                      </div>
                    )}

                    {/* System prompt (collapsible) */}
                    {p.system_prompt && (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                          System prompt
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-700 whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto border border-gray-200">
                          {p.system_prompt}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function _getInterviewStatus(transcripts, personaName) {
  const match = transcripts.find(t => t.persona_name === personaName)
  if (!match) return 'waiting'
  if (match.status === 'complete') return 'complete'
  if (match.status === 'running') return 'running'
  if (match.status === 'failed') return 'failed'
  return 'waiting'
}

function _statusColor(status) {
  switch (status) {
    case 'complete': return 'bg-green-500'
    case 'running': return 'bg-blue-500 animate-pulse'
    case 'failed': return 'bg-red-500'
    default: return 'bg-gray-300'
  }
}

function _statusBadge(status) {
  switch (status) {
    case 'complete': return 'bg-green-50 text-green-700'
    case 'running': return 'bg-blue-50 text-blue-700'
    case 'failed': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}
