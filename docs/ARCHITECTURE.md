# Architecture — Synthetic Audience Interview System

An agent-first multi-agent research pipeline. A human user converses with a context agent, then an orchestrator autonomously drives persona generation, interview design, and synthetic interviews — all decided by LLM agents, not code.

---

## 1. Philosophy

1. **Hub (core/hub.py) is the single source of truth.** Every module reads/writes state through it.
2. **One hub, many spokes.** The hub is the only shared dependency.
3. **Agent runtime is the glue.** Adding a capability = adding a runtime function.
4. **Operational after every phase.** System is runnable after each phase.
5. **Fail gracefully.** Errors are data (events), not crashes. Orchestrator handles recovery.
6. **Agent-first.** All reasoning, judgment, and decisions by LLM agents. Code handles I/O, routing, storage.
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
  Orchestrator (watches all events, decides everything)
       │
       ├── Context Agent (multi-turn, interviews user → produces brief)
       ├── Persona Architect (single-shot, brief → personas + system prompts)
       ├── Interview Designer (single-shot, brief + personas → strategy + interviewer prompt)
       ├── Interview Agent × N (multi-turn, one per persona, prompt from designer)
       ├── Persona Agent × N (multi-turn, one per interview, prompt from architect)
       └── Quality Reviewer (optional, single-shot, spawned by orchestrator)
```

---

## 3. Data Model

### System State (hub)

```json
{
  "phase": "idle | context_gathering | persona_generation | interviewing | complete",
  "agents": {
    "<agent_id>": {
      "id": "string",
      "type": "orchestrator | context | persona_architect | interview_designer | interviewer | persona | quality_reviewer",
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
    "transcripts": []
  }
}
```

---

## 4. Configuration (`data/config.json`)

Centralized config: model tiers, organization context, runtime settings.

```json
{
  "models": {
    "fast": "claude-3-5-haiku-20241022",
    "balanced": "claude-sonnet-4-20250514",
    "smart": "claude-opus-4-20250514",
    "reasoning": "claude-opus-4-20250514"
  },
  "organization": {
    "name": "",
    "industry": "",
    "description": ""
  },
  "max_interview_turns": 15,
  "default_model_tier": "balanced"
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
add_orchestrator_log(entry)       Log orchestrator decision
```

### 5.2 Agent Runtime (`core/agent_runtime.py`)

The 5 capabilities that agents operate on:

```
create_agent(id, type, prompt, tier) → agent    Register + emit agent_created
send_message(id, message) → response            Call API + emit message_sent/received
_log_api_call(...)                               Record to system log
emit_event(type, agent_id, summary)              Push to hub + SSE subscribers
export_agent(id) / export_all()                  Serialize state to JSON
```

### 5.3 Model Selector (`core/model_selector.py`)

```
resolve(tier) → model_id          Map tier name to model ID from config
suggest_tier(agent_type) → tier   Default tier for an agent type
```

### 5.4 Prompts (`prompts/`)

Base prompts read from disk at runtime. Agent-written prompts stored in hub state.

---

## 6. API Endpoints

### Config
- `GET  /api/config` — current configuration
- `PUT  /api/config` — update configuration

### Health
- `GET  /api/health` — status, phase, agent count, API key presence

### State
- `GET  /api/state` — full system state
- `GET  /api/agents` — all agents
- `GET  /api/agents/{id}` — single agent detail
- `POST /api/reset` — reset system state

### Chat (Phase 2+)
- `POST /api/chat` — send message to context agent
- `POST /api/command` — send command to orchestrator

### Events
- `GET  /api/events` — SSE stream of real-time events

### Export (Phase 7+)
- `GET  /api/export/full` — full system export
- `GET  /api/export/brief` — brief JSON
- `GET  /api/export/personas` — personas JSON
- `GET  /api/export/transcripts` — transcripts JSON

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
├── core/                         # Core modules
│   ├── AGENTS.md
│   ├── hub.py                    # State hub — single source of truth
│   ├── agent_runtime.py          # 5 runtime capabilities
│   └── model_selector.py         # Tier → model resolution
├── api/                          # Route files (thin wrappers)
│   ├── AGENTS.md
│   ├── config_routes.py          # Config CRUD
│   ├── state_routes.py           # State + export endpoints
│   └── events.py                 # SSE streaming
├── data/                         # All persistent data
│   ├── AGENTS.md
│   ├── config.json               # Runtime configuration
│   └── state.json                # System state (gitignored)
├── prompts/                      # Editable prompt files
│   ├── AGENTS.md
│   ├── orchestrator.md
│   ├── context_agent.md
│   ├── persona_architect.md
│   ├── interview_designer.md
│   └── quality_reviewer.md
├── src/                          # React frontend (flat)
│   ├── AGENTS.md
│   ├── main.jsx                  # Entry point
│   ├── index.css                 # Tailwind + custom styles
│   ├── App.jsx                   # 4-panel layout
│   ├── ConversationPanel.jsx     # Panel 1: chat
│   ├── PersonaPanel.jsx          # Panel 2: personas
│   ├── InterviewPanel.jsx        # Panel 3: interviews
│   ├── LogPanel.jsx              # Panel 4: system log
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

### Phase 3: Orchestrator

**Goal:** Orchestrator watches events, parses decisions, executes actions. Log feed in Panel 4.

**Update:** `core/agent_runtime.py`, `server.py`, `LogPanel.jsx`

**Test:**
1. Orchestrator created at session start
2. Events routed to orchestrator after each action
3. Orchestrator decisions parsed and executed
4. Panel 4 shows orchestrator reasoning

**State after Phase 3:** System transitions autonomously from brief → persona generation.

---

### Phase 4: Persona Generation

**Goal:** Persona architect creates personas. Panel 2 shows cards + rationale.

**Test:**
1. Orchestrator creates persona architect after brief
2. Personas stored in outputs
3. Panel 2 shows persona cards with profiles
4. System prompts visible in detail view

**State after Phase 4:** Personas visible with full transparency.

---

### Phase 5: Interview Design

**Goal:** Interview designer produces strategy + interviewer prompt. Panel 3 shows strategy.

**Test:**
1. Orchestrator creates interview designer after personas approved
2. Strategy stored in outputs
3. Panel 3 shows collapsible strategy document

**State after Phase 5:** Interview infrastructure ready.

---

### Phase 6: Interviews

**Goal:** Sequential interviews. Real-time transcript streaming in Panel 3.

**Test:**
1. Orchestrator starts interviews one at a time
2. Each interview creates interviewer + persona agent pair
3. Transcript streams in Panel 3
4. 15-turn safety rail enforced
5. Completed transcripts stored in outputs

**State after Phase 6:** Full pipeline runs end-to-end.

---

### Phase 7: Quality Review + Export + Polish

**Goal:** Quality reviewer, inspection modals, all download buttons, /commands, error recovery.

**Test:**
1. Orchestrator can spawn quality reviewer
2. All download buttons produce correct files
3. /commands reach orchestrator
4. Inspection modals show full agent state
5. Error injection triggers orchestrator recovery

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
