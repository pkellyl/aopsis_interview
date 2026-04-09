import { useState, useEffect, useRef } from 'react'

export default function ArtifactBar({ stage, api, state, onSelected }) {
  const [artifacts, setArtifacts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const fileRef = useRef(null)
  const pending = state.pending_phase

  useEffect(() => {
    api.get(`/api/artifacts/${stage}`).then(setArtifacts).catch(() => {})
  }, [stage, state.phase, pending])

  const handleSelect = async (id) => {
    if (!id) { setSelectedId(null); return }
    setSelectedId(id)
    try {
      await api.post(`/api/artifacts/${stage}/select/${id}`)
      if (onSelected) onSelected(id)
    } catch (e) { console.error('Select failed:', e) }
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await api.post(`/api/artifacts/${stage}/upload`, data)
      const updated = await api.get(`/api/artifacts/${stage}`)
      setArtifacts(updated)
    } catch (err) {
      alert('Upload failed: ' + (err.message || 'Invalid JSON'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownload = () => {
    const output = _getCurrentOutput(stage, state)
    if (!output) return
    const isHtml = stage === 'visualizations' && typeof output === 'string'
    const blob = new Blob(
      [isHtml ? output : JSON.stringify(output, null, 2)],
      { type: isHtml ? 'text/html' : 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stage}.${isHtml ? 'html' : 'json'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleProceed = async () => {
    try {
      await api.post('/api/proceed')
    } catch (e) { console.error('Proceed failed:', e) }
  }

  const hasOutput = !!_getCurrentOutput(stage, state)

  return (
    <div className="flex items-center gap-2 text-xs">
      {artifacts.length > 0 && (
        <select
          value={selectedId || ''}
          onChange={(e) => handleSelect(e.target.value)}
          className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-700 bg-white max-w-[200px]"
        >
          <option value="">— saved artifacts —</option>
          {artifacts.map(a => (
            <option key={a.id} value={a.id}>
              {a.label} ({a.timestamp?.slice(0, 10)})
            </option>
          ))}
        </select>
      )}

      {hasOutput && (
        <button onClick={handleDownload}
          className="px-2 py-1 text-gray-600 border border-gray-200 rounded hover:bg-gray-50">
          ↓ JSON
        </button>
      )}

      <button onClick={() => fileRef.current?.click()}
        className="px-2 py-1 text-blue-700 border border-blue-200 rounded hover:bg-blue-50">
        ↑ Upload
      </button>
      <input ref={fileRef} type="file" accept=".json,.html" onChange={handleUpload} className="hidden" />

      {pending && (
        <button onClick={handleProceed}
          className="px-3 py-1 text-white bg-blue-600 rounded hover:bg-blue-700 font-medium">
          Continue →
        </button>
      )}
    </div>
  )
}

function _getCurrentOutput(stage, state) {
  const map = {
    briefs: state.outputs?.brief,
    personas: state.outputs?.personas,
    strategies: state.outputs?.interview_strategy,
    transcripts: state.outputs?.transcripts,
    syntheses: state.outputs?.synthesis,
    visualizations: state.outputs?.visualization,
  }
  return map[stage]
}
