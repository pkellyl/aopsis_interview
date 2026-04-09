import ConversationPanel from './ConversationPanel'
import ArtifactBar from './ArtifactBar'

const _CSS = `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}h1{border-bottom:2px solid #2563eb;padding-bottom:8px;color:#1e3a5f}h2{color:#2563eb;margin-top:32px}.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0}.label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}ul{padding-left:20px}li{margin:4px 0}@media print{body{margin:20px}.card{break-inside:avoid}}`

function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function _sectionHtml(title, obj) {
  if (!obj) return ''
  let html = `<h2>${_esc(title)}</h2><div class="card">`
  if (typeof obj === 'string') { html += `<p>${_esc(obj)}</p>`; return html + '</div>' }
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      html += `<p class="label">${_esc(k)}</p><ul>${v.map(i => `<li>${_esc(i)}</li>`).join('')}</ul>`
    } else {
      html += `<p><span class="label">${_esc(k)}</span><br>${_esc(v)}</p>`
    }
  }
  return html + '</div>'
}

export default function BriefingTab({ state, api }) {
  const brief = state.outputs?.brief
  const phase = state.phase

  const handleDownloadHtml = () => {
    if (!brief) return
    let body = ''
    if (brief.context && typeof brief.context === 'object') body += _sectionHtml('Context', brief.context)
    if (brief.interview_objectives) body += _sectionHtml('Interview Objectives', brief.interview_objectives)
    if (brief.interview_output_structure) body += _sectionHtml('Interview Output Structure', brief.interview_output_structure)
    if (brief.report_objectives) body += _sectionHtml('Report Objectives', brief.report_objectives)
    // Legacy fallback
    if (!body) {
      for (const [k, v] of Object.entries(brief)) body += _sectionHtml(k, v)
    }
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Research Brief</title><style>${_CSS}</style></head><body><h1>Research Brief</h1>${body}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'research-brief.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left: Chat */}
      <div className="w-1/2 border-r border-gray-200 flex flex-col min-h-0">
        <ConversationPanel state={state} api={api} />
      </div>

      {/* Right: Formatted brief */}
      <div className="w-1/2 flex flex-col min-h-0 bg-white">
        <div className="flex-none px-5 py-2 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Research Brief
          </h2>
          <div className="flex items-center gap-2">
            {brief && (
              <button
                onClick={handleDownloadHtml}
                className="px-2 py-1 text-xs text-violet-700 border border-violet-200 rounded hover:bg-violet-50 transition-colors"
              >
                ↓ HTML
              </button>
            )}
            <ArtifactBar stage="briefs" api={api} state={state} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!brief && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 text-sm italic">
                {phase === 'idle'
                  ? 'Start a session or upload a brief to begin.'
                  : 'Brief will appear here when the conversation is complete.'}
              </p>
            </div>
          )}

          {brief && (
            <div className="space-y-5">
              {/* New 4-part modular format */}
              {brief.context && typeof brief.context === 'object' && (
                <BriefSection title="Context" content={brief.context} />
              )}
              {brief.interview_objectives && (
                <BriefSection title="Interview Objectives" content={brief.interview_objectives} />
              )}
              {brief.interview_output_structure && (
                <BriefSection title="Interview Output Structure" content={brief.interview_output_structure} />
              )}
              {brief.report_objectives && (
                <BriefSection title="Report Objectives" content={brief.report_objectives} />
              )}

              {/* Legacy flat format fallback */}
              {!brief.context?.organization_name && (
                <>
                  <BriefSection title="Research Objective" content={brief.research_objective || brief.objective || brief.goal} />
                  <BriefSection title="Organization" content={_formatOrg(brief)} />
                  <BriefSection title="Key Questions" list={brief.key_questions || brief.questions} />
                  <BriefSection title="Target Audience" content={brief.target_audience || brief.audience} />
                  {typeof brief.context === 'string' && <BriefSection title="Context" content={brief.context} />}
                </>
              )}

              <details className="mt-4">
                <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                  Raw brief JSON
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
                  {JSON.stringify(brief, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BriefSection({ title, content, list }) {
  if (!content && (!list || list.length === 0)) return null

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
        {title}
      </h3>
      {content && typeof content === 'object' && !Array.isArray(content) ? (
        <div className="space-y-2">
          {Object.entries(content).map(([k, v]) => (
            <div key={k}>
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{k.replace(/_/g, ' ')}</span>
              {Array.isArray(v) ? (
                <ul className="mt-0.5 space-y-0.5">
                  {v.map((item, i) => (
                    <li key={i} className="text-sm text-gray-800 leading-relaxed flex gap-2">
                      <span className="text-gray-400 flex-none">•</span>
                      <span>{typeof item === 'string' ? item : item.question || item.text || JSON.stringify(item)}</span>
                    </li>
                  ))}
                </ul>
              ) : typeof v === 'object' && v !== null ? (
                <div className="ml-2 mt-0.5 space-y-1">
                  {Object.entries(v).map(([k2, v2]) => (
                    <p key={k2} className="text-sm text-gray-800 leading-relaxed">
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{k2.replace(/_/g, ' ')}: </span>
                      {Array.isArray(v2) ? v2.join(', ') : String(v2)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-800 leading-relaxed">{String(v)}</p>
              )}
            </div>
          ))}
        </div>
      ) : Array.isArray(content) ? (
        <ul className="space-y-1">
          {content.map((item, i) => (
            <li key={i} className="text-sm text-gray-800 leading-relaxed flex gap-2">
              <span className="text-gray-400 flex-none">•</span>
              <span>{typeof item === 'string' ? item : item.question || item.text || JSON.stringify(item)}</span>
            </li>
          ))}
        </ul>
      ) : content && typeof content === 'string' && content.includes('\n') ? (
        <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{content}</pre>
      ) : content ? (
        <p className="text-sm text-gray-800 leading-relaxed">{content}</p>
      ) : null}
      {list && list.length > 0 && (
        <ul className="space-y-1">
          {list.map((item, i) => (
            <li key={i} className="text-sm text-gray-800 leading-relaxed flex gap-2">
              <span className="text-gray-500 flex-none">•</span>
              <span>{typeof item === 'string' ? item : item.question || item.text || JSON.stringify(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function _formatOrg(brief) {
  const parts = []
  if (brief.organization_name || brief.organization) parts.push(brief.organization_name || brief.organization)
  if (brief.industry) parts.push(brief.industry)
  if (brief.organization_description) parts.push(brief.organization_description)
  return parts.length > 0 ? parts.join(' — ') : null
}
