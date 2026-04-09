# Architecture — Synthetic Audience Interview System

An agent-first multi-agent research pipeline. A human user converses with a context agent, then a deterministic pipeline runner drives persona generation, interview design, parallel synthetic interviews, and synthesis — each step directly triggers the next with no LLM orchestrator overhead.

---

## 1. Philosophy

1. **Hub (core/hub.py) is the single source of truth.** Every module reads/writes state through it.
2. **One hub, many spokes.** The hub is the only shared dependency.
3. **Agent runtime is the glue.** Adding a capability = adding a runtime function.
4. **Operational after every phase.** System is runnable after each phase.
5. **Fail gracefully.** Errors are data (events), not crashes. Pipeline stops on failure and reports via SSE.
6. **Agent-first.** Specialist agents handle reasoning (personas, strategy, interviews, synthesis). Pipeline runner handles sequencing.
7. **Files over databases.** All state is JSON on disk.
8. **Dynamic model selection.** Agents request capability tiers (fast/balanced/smart/reasoning), resolved to model IDs at runtime.

---

## 2. System Diagram

```
                    ┌─────────────┐
                    │  Frontend   │  React SPA, 4 panels
                    └──────┬──────┘
                           │ REST + SSE
                    ┌──────┴──────┐
                    │  API Layer  │  FastAPI thin wrappers
                    └──────┬──────┘
                           │
     ┌──────────┬──────────┼──────────┬──────────┐
     │          │          │          │          │
  agent      model      config    prompts    events
  runtime    selector   loader    (on disk)  (SSE)
     │          │          │          │          │
     └──────────┴─────┬────┴──────────┴──────────┘
                      │
               ┌──────┴──────┐
               │     HUB     │  core/hub.py — single source of truth
               └──────┬──────┘
                      │
               ┌──────┴──────┐
               │  data/*.json │  File system persistence
               └─────────────┘
```

### Agent Architecture

```
  Pipeline Runner (deterministic: resume() → steps in sequence)
       │
       ├── Context Agent (multi-turn, interviews user → produces brief)
       ├── Persona Architect (single-shot, brief → personas + system prompts)
       ├── Interview Designer (single-shot, brief + personas → strategy + interviewer prompt)
       ├── Interview Agent × N (multi-turn, one per persona, prompt from designer)
       ├── Persona Agent × N (multi-turn, one per interview, prompt from architect)
       ├── Synthesis Designer (single-shot, brief → custom synthesis prompt + methodology)
       ├── Synthesis Agent (single-shot, designer prompt + transcripts → flexible report)
       ├── Synthesis Refiner (multi-turn, user instructions → refined report)
       ├── Visualizer (single-shot, synthesis → self-contained HTML visualization, uses extended thinking)
       └── Quality Reviewer (optional, single-shot)
```

---

## 3. Data Model

### System State (hub)

```json
{
  "phase": "idle | context_gathering | persona_generation | interviewing | synthesizing | refining | complete",
  "agents": {
    "<agent_id>": {
      "id": "string",
      "type": "context | persona_architect | interview_designer | interviewer | persona | synthesis_designer | synthesis_agent | synthesis_refiner | quality_reviewer",
      "model_tier": "fast | balanced | smart | reasoning",
      "system_prompt": "string",
      "messages": [{"role": "user|assistant", "content": "...", "timestamp": "..."}],
      "status": "active | completed | errored",
      "created_by": "agent_id | null",
      "created_at": "ISO timestamp",
      "metadata": {}
    }
  },
  "events": [{"event_type": "...", "agent_id": "...", "summary": "...", "timestamp": "..."}],
  "system_log": [{"timestamp": "...", "agent_id": "...", "model": "...", "tokens_in": 0, "tokens_out": 0}],
  "orchestrator_log": [{"timestamp": "...", "decision": "...", "reasoning": "..."}],
  "outputs": {
    "brief": null | {},
    "personas": null | {"design_rationale": "...", "personas": [...]},
    "interview_strategy": null | {"interview_strategy": "...", "interviewer_system_prompt": "..."},
    "transcripts": [],
    "synthesis_design": null | {"synthesis_system_prompt": "...", "methodology_notes": "..."},
    "synthesis": null | {"title": "...", "executive_summary": "...", "sections": [{"heading": "...", "content": "markdown..."}]},
    "synthesis_history": [{"version": 1, "instruction": "...", "synthesis": {}, "timestamp": "..."}],
    "visualization": null | "<html>...self-contained HTML string...</html>"
  }
}
```

---

## 4. Configuration (`data/config.json`)

Centralized config: model tiers, organization context, runtime settings.

```json
{
  "models": { "fast": "...", "balanced": "...", "smart": "...", "reasoning": "..." },
  "presets": {
    "test":       { "fast": "...", "balanced": "...", "smart": "...", "reasoning": "..." },
    "dev":        { "fast": "...", "balanced": "...", "smart": "...", "reasoning": "..." },
    "production": { "fast": "...", "balanced": "...", "smart": "...", "reasoning": "..." }
  },
  "agent_overrides": {},
  "turn_limits": { "test": 5, "dev": 10, "production": 15 },
  "organization": { "name": "", "industry": "", "description": "" },
  "max_interview_turns": 15,
  "default_model_tier": "balanced",
  "model_mode": "dev",
  "max_concurrent_api_calls": 10
}
```

API: `GET /api/config`, `PUT /api/config`

---

## 5. Module Specifications

### 5.1 Hub (`core/hub.py`)

The only shared dependency. All state access goes through hub.

```
load() -> dict                    Load state from disk
save()                            Persist current state to disk
get_state() -> dict               Return current in-memory state
set_state(data: dict)             Replace in-memory state
reset() -> dict                   Reset to initial state
register_agent(...)               Register a new agent
get_agent(id) -> dict|None        Get agent by ID
append_message(id, role, content) Add message to agent history
update_agent_status(id, status)   Change agent status
add_event(type, agent_id, summary) Record system event
get/set_phase(phase)              Phase management
set_output(key, value)            Store output data
add_system_log(entry)             Log API call
add_orchestrator_log(entry)       Log pipeline decision
```

### 5.2 Agent Runtime (`core/agent_runtime.py`)

The 5 capabilities that agents operate on:

```
create_agent(id, type, prompt, tier) → agent    Register + emit agent_created
send_message(id, msg, use_thinking) → response  Call API + emit message_sent/received
_log_api_call(...)                               Record to system log
emit_event(type, agent_id, summary)              Push to hub + SSE subscribers
export_agent(id) / export_all()                  Serialize state to JSON
```

### 5.3 Model Selector (`core/model_selector.py`)

```
resolve(tier, agent_type) → model_id  Check agent_overrides first, then mode preset, then fallback
suggest_tier(agent_type) → tier       Default tier for an agent type
```

### 5.4 Prompts (`prompts/`)

Base prompts read from disk at runtime. Agent-written prompts stored in hub state.

---

## 6. API Endpoints

### Config & Prompts
- `GET  /api/config` — current configuration
- `PUT  /api/config` — update configuration
- `GET  /api/prompts` — list prompt file names
- `GET  /api/prompts/{name}` — read prompt content
- `PUT  /api/prompts/{name}` — write prompt content to disk

### Health
- `GET  /api/health` — status, phase, agent count, API key presence

### State
- `GET  /api/state` — full system state
- `GET  /api/agents` — all agents
- `GET  /api/agents/{id}` — single agent detail
- `POST /api/reset` — reset system state

### Chat (Phase 2+)
- `POST /api/chat` — send message to context agent
- `POST /api/command` — send command (no-op, kept for API compat)

### Upload (skip phases, legacy)
- `POST /api/upload/brief` — upload brief JSON, skip to persona generation
- `POST /api/upload/personas` — upload personas JSON (with optional brief), skip to interview design

### Artifacts (modular pipeline)
- `GET  /api/artifacts/{stage}` — list saved artifacts for a stage (briefs, personas, strategies, transcripts, syntheses, visualizations)
- `GET  /api/artifacts/{stage}/{id}` — load a specific artifact's data
- `POST /api/artifacts/{stage}/upload` — upload artifact, save to library, set as current output, set pending_phase
- `POST /api/artifacts/{stage}/select/{id}` — select a saved artifact as current output

### Pipeline Control
- `POST /api/proceed` — clear pipeline gate and run pipeline from pending phase

### Synthesis
- `POST /api/synthesize` — trigger synthesis from transcripts (background thread)
- `POST /api/refine-synthesis` — refine synthesis with user instruction (background thread)
- `POST /api/visualize` — generate rich HTML visualization from synthesis (background thread, uses extended thinking)

### Events
- `GET  /api/events` — SSE stream of real-time events

### Export (Phase 7+)
- `GET  /api/export/full` — full system export
- `GET  /api/export/brief` — brief JSON
- `GET  /api/export/personas` — personas JSON
- `GET  /api/export/transcripts` — transcripts JSON
- `POST /api/export/run` — generate timestamped folder with styled HTML files (brief, personas, transcripts, synthesis, visualization)

---

## 7. File Structure

```
interview_synth/
├── .windsurfrules                # IDE gate: read docs first
├── .env                          # ANTHROPIC_API_KEY (gitignored)
├── .gitignore
├── requirements.txt              # Python dependencies
├── package.json                  # Frontend dependencies
├── vite.config.js                # Vite dev server + proxy
├── tailwind.config.js            # Tailwind CSS config
├── postcss.config.js             # PostCSS config
├── index.html                    # Vite entry HTML
├── server.py                     # FastAPI entry point
├── config.py                     # Centralized config loader
├── artifact_store.py             # Save/list/load pipeline artifacts per stage
├── export_run.py                 # Generate styled HTML export folder per run
├── core/                         # Core modules
│   ├── AGENTS.md
│   ├── hub.py                    # State hub — single source of truth
│   ├── agent_runtime.py          # 5 runtime capabilities
│   └── model_selector.py         # Tier → model resolution
├── api/                          # Route files (thin wrappers)
│   ├── AGENTS.md
│   ├── config_routes.py          # Config + prompt CRUD
│   ├── chat_routes.py            # Chat, commands, synthesis
│   ├── state_routes.py           # State + export endpoints
│   └── events.py                 # SSE streaming
├── data/                         # All persistent data
│   ├── AGENTS.md
│   ├── config.json               # Runtime configuration
│   └── state.json                # System state (gitignored)
├── prompts/                      # Editable prompt files
│   ├── AGENTS.md
│   ├── orchestrator.md            # (legacy, no longer used by pipeline)
│   ├── context_agent.md
│   ├── persona_architect.md
│   ├── interview_designer.md
│   ├── quality_reviewer.md
│   ├── synthesis_agent.md
│   ├── synthesis_designer.md
│   ├── synthesis_refiner.md
│   └── visualizer.md
├── src/                          # React frontend (flat)
│   ├── AGENTS.md
│   ├── main.jsx                  # Entry point
│   ├── index.css                 # Tailwind + custom styles
│   ├── App.jsx                   # Tab layout + settings drawer
│   ├── BriefingTab.jsx           # Tab 1: chat + brief
│   ├── ConversationPanel.jsx     # Chat UI component
│   ├── PersonasTab.jsx           # Tab 2: personas
│   ├── InterviewPanel.jsx        # Tab 3: interviews
│   ├── SummaryTab.jsx            # Tab 4: synthesis report
│   ├── LogPanel.jsx              # Log sidebar
│   ├── SettingsDrawer.jsx        # Settings drawer (gear icon)
│   ├── ConfigPanel.jsx           # Legacy mode selector
│   ├── useSSE.js                 # SSE hook
│   └── useAPI.js                 # Fetch hook
└── docs/
    ├── AGENTS.md
    ├── RULES.md                  # Global development rules
    ├── ARCHITECTURE.md           # This document
    ├── AGENTS_TEMPLATE.md        # Template for AGENTS.md
    └── scope.md                  # POC specification v2
```

---

## 8. Implementation Phases

### Phase 1: Foundation

**Goal:** Project structure, hub, agent runtime, config, server, React 4-panel shell.

**Create:** All files listed in section 7.

**Test:**
1. `GET /api/health` returns ok
2. `GET /api/config` returns config
3. `GET /api/state` returns initial state
4. Frontend renders 4 panels with empty states
5. SSE endpoint connects

**State after Phase 1:** Backend runs, frontend renders, no agents yet.

---

### Phase 2: Context Agent + Chat UI

**Goal:** User can converse with context agent. Brief detection. Real-time chat in Panel 1.

**Create:** `api/chat_routes.py`
**Update:** `server.py`, `ConversationPanel.jsx`

**Test:**
1. `POST /api/chat` sends to context agent, returns response
2. Chat messages appear in real time in Panel 1
3. [BRIEF_COMPLETE] signal detected and brief stored in outputs
4. SSE events fire for all agent actions

**State after Phase 2:** User can have a full conversation and produce a research brief.

---

### Phase 3: Pipeline Runner

**Goal:** Deterministic pipeline runner executes steps sequentially via resume(). SSE events update frontend.

**Update:** `core/orchestrator.py`, `server.py`

**Test:**
1. resume() spawns background thread running pipeline steps
2. Each step emits SSE events for frontend updates
3. Errors stop pipeline and report via SSE
4. No LLM orchestrator agent needed

**State after Phase 3:** System transitions autonomously from brief → persona generation.

---

### Phase 4: Persona Generation

**Goal:** Persona architect creates personas. Panel 2 shows cards + rationale.

**Test:**
1. Pipeline runs persona architect after brief
2. Personas stored in outputs
3. Panel 2 shows persona cards with profiles
4. System prompts visible in detail view

**State after Phase 4:** Personas visible with full transparency.

---

### Phase 5: Interview Design

**Goal:** Interview designer produces strategy + interviewer prompt. Panel 3 shows strategy.

**Test:**
1. Pipeline runs interview designer after personas
2. Strategy stored in outputs
3. Panel 3 shows collapsible strategy document

**State after Phase 5:** Interview infrastructure ready.

---

### Phase 6: Interviews

**Goal:** Sequential interviews. Real-time transcript streaming in Panel 3.

**Test:**
1. Pipeline starts all interviews in parallel (thread.join waits for all)
2. Each interview creates interviewer + persona agent pair
3. Transcript streams in Panel 3
4. 15-turn safety rail enforced
5. Completed transcripts stored in outputs

**State after Phase 6:** Full pipeline runs end-to-end.

---

### Phase 7: Quality Review + Export + Polish

**Goal:** Quality reviewer, inspection modals, all download buttons, /commands, error recovery.

**Test:**
1. Quality reviewer can be spawned if needed
2. All download buttons produce correct files
3. Inspection modals show full agent state
4. Error injection triggers pipeline error handling

**State after Phase 7:** Complete POC as specified in scope.md.

---

## 9. Design Principles Summary

| # | Principle | Implementation |
|---|-----------|---------------|
| 1 | Hub is single source of truth | All modules use hub. Nobody reads files directly. |
| 2 | One hub, many spokes | Hub is the only shared dependency. |
| 3 | Operational after every phase | Each phase adds capability without breaking existing. |
| 4 | Fail gracefully | Try/catch at every boundary. Errors are events. |
| 5 | Agent-first | All reasoning by agents, code for plumbing. |
| 6 | Dynamic model selection | Agents request tiers, resolved to models from config. |
| 7 | Self-documenting | Every directory has AGENTS.md. Every change updates docs. |
| 8 | Prompts are first-class | Version-controlled, editable at runtime, read from disk. |
