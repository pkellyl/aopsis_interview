import { useState, useEffect, useCallback } from 'react'

const MODES = ['test', 'dev', 'production']
const MODE_DESC = {
  test: 'All Haiku — fast iteration, minimal cost',
  dev: 'Haiku + Sonnet — balanced quality and speed',
  production: 'Full power — Haiku, Sonnet, Opus',
}
const TIERS = ['fast', 'balanced', 'smart', 'reasoning']
const AVAILABLE_MODELS = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
]
const AGENT_TYPES = [
  { type: 'orchestrator', label: 'Orchestrator', tier: 'smart' },
  { type: 'context', label: 'Context Agent', tier: 'balanced' },
  { type: 'persona_architect', label: 'Persona Architect', tier: 'smart' },
  { type: 'interview_designer', label: 'Interview Designer', tier: 'smart' },
  { type: 'interviewer', label: 'Interviewer', tier: 'balanced' },
  { type: 'persona', label: 'Persona (respondent)', tier: 'fast' },
  { type: 'synthesis_designer', label: 'Synthesis Designer', tier: 'smart' },
  { type: 'synthesis_agent', label: 'Synthesis Agent', tier: 'balanced' },
  { type: 'synthesis_refiner', label: 'Synthesis Refiner', tier: 'balanced' },
  { type: 'quality_reviewer', label: 'Quality Reviewer', tier: 'smart' },
]

export default function SettingsDrawer({ open, onClose, api }) {
  const [cfg, setCfg] = useState(null)
  const [prompts, setPrompts] = useState([])
  const [expandedPrompt, setExpandedPrompt] = useState(null)
  const [promptContent, setPromptContent] = useState('')
  const [promptDirty, setPromptDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const loadConfig = useCallback(() => {
    api.get('/api/config').then(setCfg).catch(() => {})
  }, [api])

  const loadPrompts = useCallback(() => {
    api.get('/api/prompts').then(setPrompts).catch(() => {})
  }, [api])

  useEffect(() => {
    if (open) {
      loadConfig()
      loadPrompts()
    }
  }, [open, loadConfig, loadPrompts])

  const updateCfg = async (patch) => {
    setSaving(true)
    try {
      const updated = await api.put('/api/config', patch)
      setCfg(updated)
      flash('Saved')
    } catch { flash('Save failed', true) }
    setSaving(false)
  }

  const flash = (msg, isError) => {
    setSaveMsg(msg)
    setTimeout(() => setSaveMsg(''), 2000)
  }

  const openPrompt = async (name) => {
    if (expandedPrompt === name) {
      setExpandedPrompt(null)
      return
    }
    try {
      const data = await api.get(`/api/prompts/${name}`)
      setPromptContent(data.content || '')
      setPromptDirty(false)
      setExpandedPrompt(name)
    } catch { flash('Failed to load prompt', true) }
  }

  const savePrompt = async () => {
    if (!expandedPrompt) return
    setSaving(true)
    try {
      await api.put(`/api/prompts/${expandedPrompt}`, { content: promptContent })
      setPromptDirty(false)
      flash('Prompt saved')
    } catch { flash('Failed to save prompt', true) }
    setSaving(false)
  }

  if (!open) return null

  const mode = cfg?.model_mode || 'dev'
  const presets = cfg?.presets || {}
  const currentPreset = presets[mode] || {}
  const overrides = cfg?.agent_overrides || {}
  const turnLimits = cfg?.turn_limits || {}
  const maxInterviewees = cfg?.max_interviewees || {}
  const org = cfg?.organization || {}

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] bg-white z-50 shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Settings</h2>
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span className="text-xs text-green-700 font-medium">{saveMsg}</span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {!cfg ? (
            <div className="p-5 text-sm text-gray-600">Loading...</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Section 1: Mode */}
              <Section title="Mode">
                <div className="flex gap-2">
                  {MODES.map(m => (
                    <button
                      key={m}
                      onClick={() => updateCfg({ model_mode: m })}
                      disabled={saving}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        mode === m
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div>{m.charAt(0).toUpperCase() + m.slice(1)}</div>
                      <div className="text-xs font-normal text-gray-600 mt-0.5">{MODE_DESC[m]}</div>
                    </button>
                  ))}
                </div>
              </Section>

              {/* Section 2: Tier → Model Mapping */}
              <Section title={`Tier → Model (${mode})`}>
                <div className="space-y-2">
                  {TIERS.map(tier => (
                    <div key={tier} className="flex items-center gap-3">
                      <span className="w-20 text-xs font-mono text-gray-700">{tier}</span>
                      <select
                        value={currentPreset[tier] || ''}
                        onChange={(e) => {
                          const newPresets = { ...presets }
                          newPresets[mode] = { ...(newPresets[mode] || {}), [tier]: e.target.value }
                          updateCfg({ presets: newPresets })
                        }}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-800 bg-white"
                      >
                        {AVAILABLE_MODELS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Agents request a tier; the tier resolves to the model shown above.
                </p>
              </Section>

              {/* Section 3: Per-Agent Overrides */}
              <Section title="Agent Model Overrides">
                <p className="text-xs text-gray-600 mb-2">
                  Override the tier system for specific agent types. Leave as "—" to use the tier default.
                </p>
                <div className="space-y-1.5">
                  {AGENT_TYPES.map(({ type, label, tier }) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className="w-36 text-xs text-gray-700 truncate" title={type}>{label}</span>
                      <span className="w-16 text-xs text-gray-600 font-mono">{tier}</span>
                      <select
                        value={overrides[type] || ''}
                        onChange={(e) => {
                          const newOverrides = { ...overrides }
                          if (e.target.value === '') {
                            delete newOverrides[type]
                          } else {
                            newOverrides[type] = e.target.value
                          }
                          updateCfg({ agent_overrides: newOverrides })
                        }}
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 text-gray-800 bg-white"
                      >
                        <option value="">— tier default</option>
                        {AVAILABLE_MODELS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Section 4: Turn Limits */}
              <Section title="Interview Turn Limits">
                <div className="space-y-2">
                  {MODES.map(m => (
                    <div key={m} className="flex items-center gap-3">
                      <span className="w-24 text-xs font-medium text-gray-700">
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={turnLimits[m] ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (!isNaN(val) && val > 0) {
                            updateCfg({ turn_limits: { ...turnLimits, [m]: val } })
                          }
                        }}
                        className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-800"
                      />
                      <span className="text-xs text-gray-600">turns per interview</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Section 5: Max Interviewees */}
              <Section title="Max Interviewees">
                <div className="space-y-2">
                  {MODES.map(m => (
                    <div key={m} className="flex items-center gap-3">
                      <span className="w-24 text-xs font-medium text-gray-700">
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={maxInterviewees[m] ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (!isNaN(val) && val > 0) {
                            updateCfg({ max_interviewees: { ...maxInterviewees, [m]: val } })
                          }
                        }}
                        className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-800"
                      />
                      <span className="text-xs text-gray-600">personas per run</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Section 6: Organization Context */}
              <Section title="Organization Context">
                <div className="space-y-2">
                  {[
                    { key: 'name', label: 'Name', placeholder: 'Acme Corp' },
                    { key: 'industry', label: 'Industry', placeholder: 'SaaS / Healthcare / etc.' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-20 text-xs text-gray-700">{label}</span>
                      <input
                        value={org[key] || ''}
                        onChange={(e) => {
                          updateCfg({ organization: { ...org, [key]: e.target.value } })
                        }}
                        placeholder={placeholder}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-800"
                      />
                    </div>
                  ))}
                  <div>
                    <span className="text-xs text-gray-700 block mb-1">Description</span>
                    <textarea
                      value={org.description || ''}
                      onChange={(e) => {
                        updateCfg({ organization: { ...org, description: e.target.value } })
                      }}
                      placeholder="Brief description of your organization and what you do..."
                      rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-800 resize-none"
                    />
                  </div>
                </div>
              </Section>

              {/* Section 6: Concurrency */}
              <Section title="Runtime">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-700">Max concurrent API calls</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={cfg.max_concurrent_api_calls ?? 10}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val > 0) {
                        updateCfg({ max_concurrent_api_calls: val })
                      }
                    }}
                    className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-800"
                  />
                </div>
              </Section>

              {/* Section 7: Prompts */}
              <Section title="Prompts">
                <p className="text-xs text-gray-600 mb-2">
                  Click to view/edit. Changes take effect on the next agent interaction.
                </p>
                <div className="space-y-1">
                  {prompts.map(name => (
                    <div key={name}>
                      <button
                        onClick={() => openPrompt(name)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                          expandedPrompt === name
                            ? 'bg-blue-50 text-blue-700'
                            : 'hover:bg-gray-50 text-gray-800'
                        }`}
                      >
                        <span className="font-mono text-xs">{name}</span>
                        <span className="text-xs text-gray-500">
                          {expandedPrompt === name ? '▼' : '▶'}
                        </span>
                      </button>
                      {expandedPrompt === name && (
                        <div className="mt-1 mb-2">
                          <textarea
                            value={promptContent}
                            onChange={(e) => {
                              setPromptContent(e.target.value)
                              setPromptDirty(true)
                            }}
                            rows={12}
                            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 text-gray-800 resize-y leading-relaxed"
                          />
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={savePrompt}
                              disabled={!promptDirty || saving}
                              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                                promptDirty
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }`}
                            >
                              Save
                            </button>
                            {promptDirty && (
                              <span className="text-xs text-amber-600">Unsaved changes</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Section({ title, children }) {
  return (
    <div className="px-5 py-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      {children}
    </div>
  )
}
