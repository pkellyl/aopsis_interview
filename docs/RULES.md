# Development Rules

These rules govern ALL development on this project.
Every AI agent, every human developer, every change must follow them.
Violating these rules creates technical debt. Technical debt is a bug.

---

## Golden Rules

1. **After every change, the system must be operational.** No change should break existing functionality. If it does, fix it before moving on.
2. **Documentation is not optional.** Every change updates the relevant AGENTS.md. If you add a file, document it. If you change a function's purpose, update the docstring. If you change architecture, update ARCHITECTURE.md.
3. **Do not over-engineer.** The simplest solution that works is the right solution. No abstractions without 3 concrete cases. No frameworks when a function will do. No classes when a dict will do.
4. **Use 2026 patterns.** We have powerful AI agents available. Use them for reasoning, judgment, generation, evaluation, and analysis. Reserve code for I/O, routing, and storage.
5. **Agents are part of the system's reasoning.** Data generation, compliance checking, quality assessment — all agent tasks. Code handles plumbing.

---

## Code Philosophy

6. **Agent-first design.** If a task involves reasoning, judgment, generation, evaluation, or summarization — use an agent call, not a programmatic solution.
7. **Right-size the model.** Fast models for simple tasks. Smart models for complex reasoning. Never use a big model for what a small model can do. Centralize model selection in config.
8. **No code where a prompt works.** Before writing a function, ask: could an agent do this with a good prompt and the right context? If yes, write the prompt.
9. **Prompts are engineering artifacts.** Version-controlled, editable at runtime, tested. First-class citizens alongside code.

---

## Architecture Rules

10. **One hub, many spokes.** One shared data dependency. Every other module is a leaf. Leaves never import each other.
11. **A tool/utility file imports at most one core module.** This is the loose coupling rule.
12. **Core modules import no other core modules.** Pure functions take data as input. Exception: runtime imports registry (one allowed cross-import).
13. **API routes are thin wrappers.** Validate input, call a core module, return output. No business logic in routes.
14. **Fail gracefully at every boundary.** Every external call is try/caught. Every file read has a fallback. Return errors as data, never crash.

---

## Code Organization

15. **One file, one purpose.** Max ~300 lines. If it's growing, it has two purposes — split it.
16. **Flat within modules.** No nested subdirectories within a module.
17. **No abstraction without repetition.** Don't create a base class until you have 3 concrete cases.
18. **No boilerplate frameworks.** Use the simplest stack that works. No ORMs, no DI containers, no middleware stacks unless justified.
19. **Delete before abstracting.** Unused code is worse than no code.

---

## Simplicity

20. **Files over databases.** JSON on disk. Migrate when file I/O becomes a bottleneck — not before.
21. **Direct over clever.** Code that an AI agent can read in one pass and understand. No metaprogramming, no magic.
22. **Explicit over implicit.** Named imports, explicit parameters, obvious data flow.
23. **Small functions.** If a function needs a scrollbar, it's too long.

---

## Documentation Rules

24. **Every file has a module docstring.** First lines: what this file does, what it depends on.
25. **Every function has a one-line docstring.** Not a novel. One line.
26. **ARCHITECTURE.md stays current.** Update it when structure changes. It's the map.
27. **Every directory has AGENTS.md.** It lists: purpose, files, dependencies, boundaries, change checklist.
28. **AGENTS.md is updated on every change.** Add a file → update AGENTS.md. Change purpose → update AGENTS.md. Enforced, not optional.
29. **Hierarchical documentation.** Global rules in `docs/RULES.md`. Module rules in `module/AGENTS.md`. Rules cascade downward.

---

## Data Rules

30. **Everything viewable and editable from the UI.** Config, data, prompts, state.
31. **Everything downloadable.** Every visible state can be exported.
32. **Files on disk are source of truth.** UI reads and writes via API. Developers can also edit directly.
33. **Centralized config from day one.** One config file for all runtime settings. No hardcoded constants scattered across modules.

---

## LLM / Agent Rules

34. **Inject only what's needed.** Scoped agents get scoped context, not the entire state.
35. **Tools are shared, prompts are specialized.** Agent types differ in prompts and context, not tool implementations.
36. **Observable by default.** Every agent action visible in UI. No black boxes.
37. **Fast feedback loops.** Edit prompt → next interaction uses it. No restarts.

---

## Integrity Rules

38. **No orphan files.** Every file documented in its AGENTS.md and referenced in ARCHITECTURE.md.
39. **No dead imports.** Remove functionality → remove the imports that supported it.
40. **Test after every phase.** Every implementation phase has a test plan. Run it before moving on.
41. **Snapshot before refactoring.** Save known-good state before structural changes.

---

## Lessons Learned

_Add rules here as you learn them. Every phase teaches something. Capture it._

42. **Fix before reorganize.** If code works but uses the wrong format, fix in-place. Don't restructure at the same time.
43. **Delete dead code in the same phase you disconnect it.** Dead code traps future agents into maintaining ghosts.
44. **Prompts before code.** When changing data formats, update prompts first — they define what agents can do.
45. **Check for name collisions before creating packages.** `dir/__init__.py` can shadow `dir.py` at parent level.
46. **Plans written before building are always wrong.** Re-evaluate after every phase. Cut scope ruthlessly.
47. **No monoliths.** If a file exceeds 300 lines, it likely has two purposes — split it.
48. **Sweep on every phase.** Scan for dead imports, unused components, orphan files before adding anything new.
49. **Hook extraction pattern (frontend).** Extract state + API logic into reusable hooks. Saves ~120-150 lines per component.
50. **Backward-compat wrappers.** When replacing an API, keep old endpoint as thin wrapper over new one.
51. **Industry/domain-agnostic from day one.** Externalize all domain context to config. Inject at runtime.

---

## Development Cycle

52. **Every phase follows: TEST → LEARN → PLAN → BUILD → TEST.** No exceptions.
    - **(a) TEST** — Before starting, test everything that should work. Hit every endpoint. Check every UI tab. Log failures.
    - **(b) LEARN** — What did the previous phase teach? What broke unexpectedly? What pattern saved time? Update this file with new rules.
    - **(c) PLAN** — Shortest possible plan. Completable in one session. Fix broken things before adding new things.
    - **(d) BUILD** — One task at a time. Mark done as you go.
    - **(e) TEST** — Same comprehensive tests. Nothing previously working should be broken.

53. **Phases must be short.** A phase is: delete dead code, fix 2-3 broken things, add one feature. More than that = two phases.

54. **The cycle is self-correcting.** Test results override plans. Urgent findings take priority.

---

## Agentic System Rules

_These rules apply specifically when building multi-agent orchestrator systems. They are NOT general development rules — they address patterns, failure modes, and design decisions unique to systems where LLM agents drive autonomous workflows._

### Orchestrator Design

55. **Every action handler must complete the circuit.** send → receive → parse → store → emit. If any step is missing, the autonomous chain breaks silently. After every `send_message` in an action handler, call the output handler. No fire-and-forget.

56. **Self-event filter needs a whitelist, not just a block.** Orchestrators emit events (e.g. `interview_complete`) that they must also consume to chain work. Maintain an explicit `_SELF_EVENTS` set. Document which events the orchestrator emits vs. consumes — they will overlap.

57. **Event filter is a design document.** Explicitly list which event types the orchestrator sees and why. Default to NO. Only include events that require a decision. An orchestrator that sees too many events makes too many (bad) decisions and burns tokens.

58. **Give the orchestrator enough context to decide, not everything.** Build a `_format_event()` function that curates context: triggering event, current phase, what outputs exist, what agents are active. Truncate large objects. Summarize lists. The orchestrator needs enough to decide "what next", not enough to do the work itself.

59. **Compound actions need sequencing rules.** Document which actions can be combined in one response and which must be issued alone. Long-running actions (interviews, complex generation) = one per response. State this in the orchestrator prompt AND enforce in code.

60. **Never block API responses on orchestrator decisions.** The orchestrator MUST run in a background worker (thread, task queue, or async loop). The event queue is the interface between the synchronous API world and the asynchronous agent world.

### Prompt Engineering

61. **The orchestrator prompt is the most-revised artifact.** Structure it in sections: ROLE, ACTIONS (with params), RULES (hard constraints), TYPICAL FLOW (worked example), FORMAT (output schema). Update it every time you add a new action or discover a failure mode. The prompt IS the orchestrator's logic.

62. **Base prompts on disk, generated prompts in state.** Maintain a registry (`_BASE_PROMPT_AGENTS`) of agent types whose prompts come from disk. The orchestrator never writes prompts for these types. Agent-generated prompts (interviewer, persona) are stored in hub outputs.

63. **Separate identity from task.** `system_prompt` = who the agent is (identity, loaded from disk). `initial_message` = what data it works on (task, composed by orchestrator). The orchestrator controls the task, not the identity.

64. **Build `_try_parse_json` as infrastructure, not a hack.** LLMs will not produce clean JSON regardless of prompt instructions. Always build a robust extraction function that handles: (a) pure JSON, (b) JSON in markdown fences, (c) JSON embedded in prose. This is required infrastructure for any agent system.

65. **Prompt format enforcement requires extreme explicitness.** Four lines minimum: "Respond with ONLY a JSON object", "No prose before or after", "No markdown fencing", "Begin your response with `{` and end with `}`". Even then, still use `_try_parse_json` (rule 64).

### Data Contracts

66. **Define data shape contracts before coding.** For every structure that crosses backend→frontend (transcript, persona, event, log entry): write the exact JSON shape in ARCHITECTURE.md first — field names, types, enum values (e.g. `status: "running" | "complete"`). Both backend and frontend reference this contract. 2 minutes of documentation prevents hours of debugging.

67. **Frontend reads canonical data, not agent metadata.** Derive display status from output data structures (transcript.status, persona fields), never from agent internals (agent.metadata, agent.status). Agent metadata is implementation-specific and often incomplete.

68. **Grep the frontend after every backend change.** When the backend writes a new data structure, immediately search the frontend for every reference to that data type. Verify field names match. Data shape drift between backend and frontend is the #1 source of silent bugs in agent-first systems.

### Resilience

69. **Safety rails are primary, not fallback.** Design the system to work correctly at the safety limit (e.g. max turns). LLMs rarely produce natural termination signals even when instructed. Treat natural endings as an optimization, not a requirement.

70. **Retry on every external API call in autonomous loops.** Systems that run autonomously for minutes/hours will hit network failures. Add retry with exponential backoff to every LLM call in the worker loop. A single failed turn should retry, not abort the entire workflow.

71. **Test the full chain, not components.** After building any new action or agent type, test the complete chain from trigger to final state. Don't test "does RUN_INTERVIEW work" — test "does brief → personas → strategy → interview → next interview → complete work". Integration bugs dominate in agentic systems.

### Frontend for Agentic Systems

72. **Every panel needs null/partial/active/complete states.** The backend produces data asynchronously and in unpredictable order. Guard every data access with optional chaining and fallback arrays. Start every panel with: "what if this data is null?"

73. **State grows faster than you expect.** N interviews × M turns × content size adds up fast, plus full agent message histories. Plan for it: separate hot state (current phase, active agents) from cold state (completed transcripts). Consider a lighter summary endpoint for polling.

### Pub/Sub Backbone

74. **Use subscribe + enqueue as the system glue.** Every agent action emits an event. Subscribers filter independently. Two lines wire the whole system: one for SSE broadcast, one for orchestrator. Adding a capability = adding a subscriber. This pattern is the right default for any multi-agent system.
