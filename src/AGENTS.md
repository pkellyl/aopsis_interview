# Frontend (src)

Parent rules: `docs/RULES.md` · Architecture: `docs/ARCHITECTURE.md`

## Purpose

React single-page application. Four always-visible panels: Conversation, Personas, Interviews, System Log. Control-room aesthetic: dark theme, monospace for structured data, dense but readable. Communicates with backend via REST + SSE.

## Rules

- Flat structure: no subdirectories within src
- Each panel is one component file
- Hooks extract reusable state/API logic
- No business logic — display state from API, send user actions to API
- All state flows from backend via /api/state polling + /api/events SSE

## Files

| File | Purpose | Depends On |
|------|---------|------------|
| `main.jsx` | React entry point | `react`, `react-dom`, `App` |
| `index.css` | Tailwind base + custom scrollbar styles | `tailwindcss` |
| `App.jsx` | 4-panel layout, state management, SSE wiring | All panels, `useSSE`, `useAPI` |
| `ConversationPanel.jsx` | Panel 1: chat with context agent + command input | `useAPI` (via props) |
| `PersonaPanel.jsx` | Panel 2: persona cards, design rationale, detail view | — |
| `InterviewPanel.jsx` | Panel 3: interview sidebar, transcript view, strategy | — |
| `LogPanel.jsx` | Panel 4: orchestrator decisions + system log feed | — |
| `useSSE.js` | Hook: EventSource connection to /api/events | `react` |
| `useAPI.js` | Hook: fetch wrappers for GET/POST/PUT | `react` |

## Change Checklist

- [ ] Module docstring updated if purpose changed
- [ ] No nested subdirectories added
- [ ] This AGENTS.md updated if file added/removed/purpose changed
- [ ] `docs/ARCHITECTURE.md` updated if public interface changed
