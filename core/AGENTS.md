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
| `hub.py` | System state: agents, events, logs, outputs, phase, transcripts. Single source of truth. | `pathlib`, `json`, `datetime` |
| `agent_runtime.py` | The 5 runtime capabilities: create agent, send message, log, emit event, export. | `hub`, `model_selector`, `config`, `anthropic` |
| `model_selector.py` | Resolves capability tiers (fast/balanced/smart/reasoning) to model IDs. | `config` |
| `orchestrator.py` | Background worker: receives events, calls orchestrator agent, parses decisions, executes actions (CREATE_AGENT, SEND_MESSAGE, ADVANCE_PHASE, REQUEST_REVISION, RUN_INTERVIEW, COMPLETE_SYSTEM). | `hub`, `agent_runtime`, `config` |

## Change Checklist

- [ ] Module docstring updated if purpose changed
- [ ] Every function has a one-line docstring
- [ ] No forbidden imports added
- [ ] Graceful failure at every I/O boundary
- [ ] This AGENTS.md updated if file added/removed/purpose changed
- [ ] `docs/ARCHITECTURE.md` updated if public interface changed
