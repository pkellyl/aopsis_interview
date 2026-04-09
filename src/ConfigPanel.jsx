import { useState, useEffect } from 'react'

const MODES = [
  { value: 'test', label: 'Test', desc: 'All Haiku' },
  { value: 'dev', label: 'Dev', desc: 'Haiku + Sonnet' },
  { value: 'production', label: 'Prod', desc: 'Full power' },
]

export default function ConfigPanel({ api }) {
  const [mode, setMode] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/api/config')
      .then(cfg => setMode(cfg.model_mode || 'dev'))
      .catch(() => {})
  }, [])

  const handleChange = async (newMode) => {
    setSaving(true)
    try {
      const cfg = await api.put('/api/config', { model_mode: newMode })
      setMode(cfg.model_mode || newMode)
    } catch (e) {
      // Silently fail — config panel is non-critical
    }
    setSaving(false)
  }

  if (mode === null) return null

  return (
    <div className="flex items-center gap-1">
      {MODES.map(m => (
        <button
          key={m.value}
          onClick={() => handleChange(m.value)}
          disabled={saving}
          title={m.desc}
          className={`px-2 py-0.5 text-xs rounded transition-colors ${
            mode === m.value
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200 hover:text-gray-800'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
