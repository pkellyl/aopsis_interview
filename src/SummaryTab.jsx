import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import mermaid from 'mermaid'
import ArtifactBar from './ArtifactBar'

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

function injectTabScript(html) {
  if (!html) return html
  const tabScript = `
<script>
(function(){
  var btns = document.querySelectorAll('[data-section]');
  if (!btns.length) return;
  var sections = document.querySelectorAll('[id^="sec-"]');
  if (!sections.length) return;
  function show(key) {
    sections.forEach(function(s) { s.style.display = s.id === 'sec-' + key ? '' : 'none'; });
    btns.forEach(function(b) {
      if (b.getAttribute('data-section') === key) b.classList.add('active');
      else b.classList.remove('active');
    });
  }
  btns.forEach(function(b) {
    b.addEventListener('click', function() { show(b.getAttribute('data-section')); });
  });
  var first = document.querySelector('[data-section].active') || btns[0];
  if (first) show(first.getAttribute('data-section'));
})()
</script>`
  if (html.includes('</body>')) return html.replace('</body>', tabScript + '\n</body>')
  return html + tabScript
}

// Box-drawing and diagram characters that indicate ASCII art
const BOX_CHARS = /[\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2190-\u21FF═║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼─│▼▲►◄⭐★●○◆◇■□▪▫╲╱]/
// Mermaid diagram start keywords
const MERMAID_START = /^\s*(graph\s+(TD|TB|BT|RL|LR)|flowchart\s+(TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph)/

function preprocessContent(text) {
  if (!text) return text
  const lines = text.split('\n')
  const result = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Detect unfenced mermaid: a line saying just "mermaid" followed by graph/flowchart keywords
    if (trimmed.toLowerCase() === 'mermaid' && i + 1 < lines.length && MERMAID_START.test(lines[i + 1])) {
      result.push('```mermaid')
      i++ // skip the bare "mermaid" line
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('---')) {
        result.push(lines[i])
        i++
      }
      result.push('```')
      continue
    }

    // Detect unfenced mermaid: line directly starts with graph/flowchart keywords
    if (MERMAID_START.test(trimmed) && (i === 0 || lines[i - 1].trim() === '' || lines[i - 1].trim().startsWith('#'))) {
      result.push('```mermaid')
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('---')) {
        result.push(lines[i])
        i++
      }
      result.push('```')
      continue
    }

    // Detect unfenced ASCII art: 2+ consecutive lines with box-drawing characters
    if (BOX_CHARS.test(line)) {
      let end = i
      while (end < lines.length && (BOX_CHARS.test(lines[end]) || lines[end].trim() === '')) {
        end++
      }
      // Trim trailing blank lines from the block
      while (end > i && lines[end - 1].trim() === '') end--
      if (end - i >= 2) {
        result.push('```')
        for (let j = i; j < end; j++) result.push(lines[j])
        result.push('```')
        i = end
        continue
      }
    }

    result.push(line)
    i++
  }
  return result.join('\n')
}

let _mermaidId = 0
function MermaidBlock({ code }) {
  const ref = useRef(null)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${++_mermaidId}`
    mermaid.render(id, code).then(({ svg: rendered }) => {
      if (!cancelled) setSvg(rendered)
    }).catch(err => {
      if (!cancelled) setError(err.message || 'Mermaid render failed')
    })
    return () => { cancelled = true }
  }, [code])

  if (error) return <pre className="text-xs text-red-600 bg-red-50 p-3 rounded overflow-x-auto">{code}</pre>
  if (!svg) return <div className="text-xs text-gray-600 p-3">Rendering diagram...</div>
  return <div className="my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

const mdComponents = {
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const lang = match ? match[1] : ''
    const codeStr = String(children).replace(/\n$/, '')
    // In react-markdown v10, block code is inside <pre>; detect via parent node
    const isBlock = node?.position?.start?.line !== node?.position?.end?.line || lang
    if (isBlock && lang === 'mermaid') {
      return <MermaidBlock code={codeStr} />
    }
    if (isBlock) {
      return (
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto text-xs font-mono whitespace-pre">
          <code className={className} {...props}>{children}</code>
        </pre>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
  pre({ children }) {
    return <>{children}</>
  }
}

export default function SummaryTab({ state, api }) {
  const [instruction, setInstruction] = useState('')
  const [view, setView] = useState('report')  // 'report' | 'visualization' | 'source'
  const synthesis = state.outputs?.synthesis
  const visualization = state.outputs?.visualization
  const history = state.outputs?.synthesis_history || []
  const transcripts = state.outputs?.transcripts || []
  const phase = state.phase
  const complete = transcripts.filter(t => t.status === 'complete').length
  const total = transcripts.length
  const isRefining = phase === 'refining'
  const [vizLoading, setVizLoading] = useState(false)
  const isVisualizing = vizLoading && !visualization
  const isBusy = phase === 'synthesizing' || isRefining
  const version = history.length + 1
  const lastInstruction = history.length > 0 ? history[history.length - 1].instruction : null

  const handleRegenerate = () => {
    if (view !== 'report') {
      handleVisualize()
    } else {
      api.post('/api/synthesize', {}).catch(e => console.error('Synthesis failed:', e))
    }
  }

  const handleRefine = () => {
    const text = instruction.trim()
    if (!text || isBusy) return
    setInstruction('')
    api.post('/api/refine-synthesis', { instruction: text }).catch(e => console.error('Refine failed:', e))
  }

  const handleRefineKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleRefine()
    }
  }

  useEffect(() => { if (visualization) setVizLoading(false) }, [visualization])

  const handleVisualize = () => {
    if (vizLoading) return
    setVizLoading(true)
    api.post('/api/visualize', {}).catch(e => { console.error('Visualize failed:', e); setVizLoading(false) })
    setView('visualization')
  }

  const handleDownload = () => {
    if (!synthesis) return
    const md = synthesisToMarkdown(synthesis)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `synthesis-v${version}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadHtml = () => {
    if (!visualization) return
    const blob = new Blob([visualization], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `visualization-v${version}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportRun = () => {
    api.post('/api/export/run').then(res => {
      alert(`Exported ${res.files?.length || 0} files to:\n${res.folder}`)
    }).catch(e => alert('Export failed: ' + e.message))
  }

  // Empty / waiting states
  if (!synthesis) {
    const isSynthesizing = phase === 'synthesizing'
    const interviewsDone = total > 0 && complete === total
    const canGenerate = complete > 0
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          {isSynthesizing && (
            <div className="flex justify-center mb-3">
              <span className="w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            </div>
          )}
          <p className="text-gray-600 text-sm mb-4">
            {isSynthesizing
              ? `Generating synthesis from ${complete} interviews...`
              : interviewsDone
              ? `All ${complete} interviews complete.`
              : total === 0
              ? 'Summary will be generated after all interviews complete.'
              : `Waiting for interviews to finish (${complete}/${total} complete).`}
          </p>
          {canGenerate && (
            <button
              onClick={handleRegenerate}
              disabled={isSynthesizing}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isSynthesizing ? 'Synthesizing...' : 'Generate Summary Now'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Normalize: support both new format (sections) and old format (themes/interview_summaries)
  const title = synthesis.title || 'Interview Synthesis'
  const executiveSummary = synthesis.executive_summary || synthesis.management_summary || ''
  const sections = synthesis.sections || legacySections(synthesis)

  // Synthesis available — render report
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sticky header with version + actions */}
      <div className="flex-none px-5 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-800">v{version}</span>
          {lastInstruction && (
            <span className="text-xs text-gray-600 truncate max-w-xs" title={lastInstruction}>
              · {lastInstruction}
            </span>
          )}
          {!lastInstruction && (
            <span className="text-xs text-gray-600">· Original</span>
          )}
          {isRefining && (
            <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleVisualize}
            disabled={isVisualizing}
            className="px-3 py-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 rounded-lg transition-colors"
          >
            {isVisualizing ? '⟳ Generating...' : '✦ Visualize'}
          </button>
          {visualization && view !== 'report' && (
            <button onClick={() => setView('report')} className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Report</button>
          )}
          {visualization && view === 'report' && (
            <button onClick={() => setView('visualization')} className="px-3 py-1 text-xs font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">View HTML</button>
          )}
          <ArtifactBar stage="syntheses" api={api} state={state} />
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ↓ Report .md
          </button>
          {visualization && (
            <button
              onClick={handleDownloadHtml}
              className="px-3 py-1 text-xs font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
            >
              ↓ HTML
            </button>
          )}
          <button
            onClick={handleExportRun}
            className="px-3 py-1 text-xs font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
          >
            📁 Export Run
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isBusy || isVisualizing}
            className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
          >
            {phase === 'synthesizing' ? 'Synthesizing...' : isVisualizing ? 'Generating...' : '↻ Regenerate'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

      {/* Visualization view */}
      {view !== 'report' && (
        <div className="h-full flex flex-col">
          {isVisualizing && !visualization && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <span className="block w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Generating visualization with extended thinking...</p>
                <p className="text-xs text-gray-600 mt-1">This may take 1-2 minutes</p>
              </div>
            </div>
          )}
          {visualization && (
            <>
              <div className="flex items-center gap-2 px-5 py-1 border-b border-gray-100 bg-gray-50">
                <button onClick={() => setView(view === 'source' ? 'visualization' : 'source')}
                  className="text-xs font-medium text-gray-600 hover:text-gray-800">
                  {view === 'source' ? '← Back to Preview' : '</> View Source'}
                </button>
                <span className="text-xs text-gray-600">{(visualization.length / 1024).toFixed(1)} KB</span>
              </div>
              {view === 'source' ? (
                <pre className="flex-1 p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-auto bg-gray-50">{visualization}</pre>
              ) : (
                <iframe
                  srcDoc={injectTabScript(visualization)}
                  sandbox="allow-scripts allow-same-origin"
                  className="flex-1 w-full border-0"
                  title="Research Visualization"
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Report view */}
      {view === 'report' && (
      <div className="max-w-3xl mx-auto p-6 space-y-8">

        {/* Report Title */}
        <h1 className="text-xl font-bold text-gray-800">{safeString(title)}</h1>

        {/* Executive Summary */}
        {executiveSummary && (
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Executive Summary</h2>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-5 prose prose-sm max-w-none
              prose-headings:text-gray-800 prose-p:text-gray-700 prose-p:leading-relaxed
              prose-li:text-gray-700 prose-strong:text-gray-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>{preprocessContent(safeString(executiveSummary))}</ReactMarkdown>
            </div>
          </section>
        )}

        {/* Dynamic Sections */}
        {sections.length > 0 && (
          <div className="space-y-4">
            {sections.map((section, i) => (
              <SectionCard key={i} section={section} index={i} defaultOpen={i === 0} />
            ))}
          </div>
        )}

        {/* Raw JSON fallback */}
        <details>
          <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
            Raw synthesis JSON
          </summary>
          <pre className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(synthesis, null, 2)}
          </pre>
        </details>
      </div>
      )}
      </div>

      {/* Feedback input bar */}
      <div className="flex-none border-t border-gray-200 bg-white px-5 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleRefineKeyDown}
              placeholder={isRefining ? 'Refining report...' : 'Tell the editor what to change...'}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-500 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              disabled={isBusy}
            />
            <button
              onClick={handleRefine}
              disabled={isBusy || !instruction.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isRefining ? 'Refining...' : 'Refine'}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1 px-1">
            e.g. "Reduce to 3 themes" · "Make the summary more concise" · "Focus on negative feedback"
          </p>
        </div>
      </div>
    </div>
  )
}


function SectionCard({ section, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const heading = safeString(section?.heading || `Section ${index + 1}`)
  const content = safeString(section?.content || '')

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center flex-none">
          {index + 1}
        </span>
        <span className="text-sm font-medium text-gray-800 flex-1">{heading}</span>
        <span className={`text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 mt-0 prose prose-sm max-w-none
          prose-headings:text-gray-800 prose-p:text-gray-700 prose-p:leading-relaxed
          prose-li:text-gray-700 prose-strong:text-gray-800
          prose-blockquote:border-blue-200 prose-blockquote:text-gray-700 prose-blockquote:italic
          prose-table:text-sm prose-th:text-gray-800 prose-td:text-gray-700
          prose-th:border-gray-300 prose-td:border-gray-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>{preprocessContent(content)}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}


function safeString(value) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}


function legacySections(synthesis) {
  const sections = []
  if (synthesis.themes && Array.isArray(synthesis.themes)) {
    synthesis.themes.forEach(theme => {
      let content = theme.description || ''
      if (theme.evidence && theme.evidence.length > 0) {
        content += '\n\n**Evidence:**\n' + theme.evidence.map(q => `> ${q}`).join('\n\n')
      }
      sections.push({ heading: theme.title || 'Theme', content })
    })
  }
  if (synthesis.interview_summaries && Array.isArray(synthesis.interview_summaries)) {
    synthesis.interview_summaries.forEach(s => {
      let content = s.summary || ''
      if (s.key_quotes && s.key_quotes.length > 0) {
        content += '\n\n**Key Quotes:**\n' + s.key_quotes.map(q => `> "${q}"`).join('\n\n')
      }
      sections.push({ heading: s.persona_name || 'Interview', content })
    })
  }
  return sections
}


function synthesisToMarkdown(synthesis) {
  const title = synthesis.title || 'Interview Synthesis'
  const summary = synthesis.executive_summary || synthesis.management_summary || ''
  const sections = synthesis.sections || legacySections(synthesis)

  let md = `# ${title}\n\n`
  if (summary) md += `## Executive Summary\n\n${summary}\n\n`
  sections.forEach(s => {
    md += `## ${s.heading || 'Section'}\n\n${s.content || ''}\n\n`
  })
  return md
}
