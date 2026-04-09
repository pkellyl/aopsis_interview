# Prompts

Parent rules: `docs/RULES.md` · Architecture: `docs/ARCHITECTURE.md`

## Purpose

Base system prompts for each agent type. These are first-class engineering artifacts: version-controlled, editable at runtime (edit file → next agent creation uses it), and read from disk on every use. Agent-written prompts (interview agent, persona agents) are stored in hub state, not here.

## Rules

- Prompts are markdown files, read at runtime
- No caching — always read fresh from disk for fast feedback loops
- Only base prompts live here; agent-generated prompts are in hub state
- Each file corresponds to one agent type

## Files

| File | Purpose | Depends On |
|------|---------|------------|
| `orchestrator.md` | Base prompt for the orchestrator agent | — |
| `context_agent.md` | Base prompt for the context (briefing) agent | — |
| `persona_architect.md` | Base prompt for the persona architect agent | — |
| `interview_designer.md` | Base prompt for the interview designer agent | — |
| `quality_reviewer.md` | Base prompt for the quality reviewer agent | — |
| `synthesis_designer.md` | Base prompt for the synthesis designer agent (reads brief, crafts synthesis prompt) | — |
| `synthesis_agent.md` | Fallback prompt for synthesis agent (used when designer fails) | — |
| `synthesis_refiner.md` | Base prompt for the synthesis refinement/editing agent | — |
| `visualizer.md` | Base prompt for the visualizer agent (UX expert, generates self-contained HTML) | — |

## Change Checklist

- [ ] This AGENTS.md updated if file added/removed/purpose changed
- [ ] Prompt tested with at least one agent call after changes
