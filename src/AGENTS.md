# Frontend (src)

Parent rules: `docs/RULES.md` · Architecture: `docs/ARCHITECTURE.md`

## Purpose

React single-page application. Tabbed layout (Briefing, Personas, Interviews, Summary) with collapsible log sidebar. Light theme, clean SaaS aesthetic. Auto-navigates to relevant tab on phase change. Communicates with backend via REST + SSE.

## Rules

- Flat structure: no subdirectories within src
- Each tab is one component file
- Hooks extract reusable state/API logic
- No business logic — display state from API, send user actions to API
- All state flows from backend via /api/state polling + /api/events SSE

## Files

| File | Purpose | Depends On |
|------|---------|------------|
| `main.jsx` | React entry point | `react`, `react-dom`, `App` |
| `index.css` | Tailwind base + custom scrollbar styles (light theme) | `tailwindcss` |
| `App.jsx` | Tab navigation, auto-tab switching, pipeline progress, log sidebar, gear icon → settings drawer, reset button, state management | All tabs, `LogPanel`, `SettingsDrawer`, `useSSE`, `useAPI` |
| `ArtifactBar.jsx` | Reusable artifact picker + download/upload/continue controls. Dropdown of saved artifacts, JSON download, file upload, "Continue →" button (when pending_phase set). | `react` (useState, useEffect, useRef) |
| `BriefingTab.jsx` | Tab 1: chat left + formatted brief card right. 4-part modular brief display (context, interview objectives, interview output structure, report objectives) with legacy fallback. | `ConversationPanel`, `ArtifactBar` |
| `ConversationPanel.jsx` | Chat UI: context agent conversation + command input | `useAPI` (via props) |
| `PersonasTab.jsx` | Tab 2: persona cards, interview strategy section, design rationale | `ArtifactBar` |
| `InterviewPanel.jsx` | Tab 3: strategy card (pre-transcript), stacked collapsible interview panels with progress bars | `ArtifactBar` |
| `SummaryTab.jsx` | Tab 4: flexible report with executive summary, generic markdown sections (SectionCard + react-markdown), inline refinement input bar, version indicator, regenerate buttons. Rich HTML visualization via sandboxed iframe (✦ Visualize button, Report/View HTML toggle, View Source). Backward-compatible with old theme/interview_summary format. | `useAPI` (via props), `react-markdown`, `ArtifactBar` |
| `LogPanel.jsx` | Right sidebar: status strip, error banner, latest decision, reverse-chrono feed, token totals | — |
| `ConfigPanel.jsx` | (Legacy) Model mode selector — superseded by SettingsDrawer | `useAPI` (via props) |
| `SettingsDrawer.jsx` | Full settings drawer: mode selector, tier→model mapping, per-agent overrides, turn limits, org context, concurrency, prompt editor | `useAPI` (via props) |
| `useSSE.js` | Hook: EventSource connection to /api/events | `react` |
| `useAPI.js` | Hook: fetch wrappers for GET/POST/PUT | `react` |

## Change Checklist

- [ ] Module docstring updated if purpose changed
- [ ] No nested subdirectories added
- [ ] This AGENTS.md updated if file added/removed/purpose changed
- [ ] `docs/ARCHITECTURE.md` updated if public interface changed
