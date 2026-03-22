# API

Parent rules: `docs/RULES.md` · Architecture: `docs/ARCHITECTURE.md`

## Purpose

Thin REST API route wrappers. Each file handles one domain. Routes validate input, call a core module, and return output. No business logic in routes. SSE endpoint for real-time event streaming to the frontend.

## Rules

- Each route file imports at most one core module
- No business logic — delegate to core
- All responses are JSON
- Fail gracefully: return error responses, never crash

## Files

| File | Purpose | Depends On |
|------|---------|------------|
| `config_routes.py` | GET/PUT /api/config | `config` |
| `state_routes.py` | GET /api/state, /api/agents, /api/export/{full,personas,transcripts,transcript/:id}, POST /api/reset | `core.hub`, `core.agent_runtime` |
| `chat_routes.py` | POST /api/start, /api/chat, /api/command | `config`, `core.hub`, `core.agent_runtime` |
| `events.py` | SSE endpoint GET /api/events, broadcast function | `queue`, `asyncio`, `json` |

## Change Checklist

- [ ] Module docstring updated if purpose changed
- [ ] Every function has a one-line docstring
- [ ] No forbidden imports added
- [ ] Graceful failure at every I/O boundary
- [ ] This AGENTS.md updated if file added/removed/purpose changed
- [ ] `docs/ARCHITECTURE.md` updated if public interface changed
