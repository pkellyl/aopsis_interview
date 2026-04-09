# Core

Parent rules: `docs/RULES.md` · Architecture: `docs/ARCHITECTURE.md`

## Purpose

Core system modules: the hub (single source of truth for all state), the agent runtime (5 capabilities: create, send, log, emit, export), and model selection (dynamic tier-to-model resolution). No module in core imports another core module except agent_runtime which imports hub and model_selector.

## Rules

- hub.py is the only shared dependency across the system
- agent_runtime.py imports hub and model_selector (allowed cross-imports within core)
- model_selector.py imports only config (not a core module)
- No other module in the system imports core modules directly except through agent_runtime

## Files

| File | Purpose | Depends On |
|------|---------|------------|
| `hub.py` | System state: agents, events, logs, outputs, phase, pending_phase (pipeline gate), transcripts. Single source of truth. Thread-safe via `threading.Lock`. | `pathlib`, `json`, `datetime`, `threading` |
| `agent_runtime.py` | The 5 runtime capabilities: create agent, send message (with optional extended thinking via `use_thinking`), log, emit event, export. Semaphore-limited concurrent API calls with retry+backoff. Block-based response parsing supports thinking+text blocks. | `hub`, `model_selector`, `config`, `anthropic`, `threading`, `time` |
| `model_selector.py` | Resolves capability tiers to model IDs. Supports config-driven mode presets (test/dev/production) and per-agent-type overrides. Suggests tiers for 11 agent types including visualizer. | `config` |
| `orchestrator.py` | Deterministic pipeline runner. resume() clears pending_phase gate and spawns background thread that runs steps sequentially: persona_architect → interview_designer → parallel interviews (thread.join) → synthesis_designer + synthesis_agent. No LLM orchestrator — each step directly triggers the next. Public API: initialize(), start_worker(), stop_worker(), enqueue() are no-ops kept for compat; resume() is the single entry point. _do_synthesize() also called by /api/synthesize. | `hub`, `agent_runtime`, `config`, `artifact_store`, `threading` |

## Change Checklist

- [ ] Module docstring updated if purpose changed
- [ ] Every function has a one-line docstring
- [ ] No forbidden imports added
- [ ] Graceful failure at every I/O boundary
- [ ] This AGENTS.md updated if file added/removed/purpose changed
- [ ] `docs/ARCHITECTURE.md` updated if public interface changed
