================================================================================
SYNTHETIC AUDIENCE INTERVIEW SYSTEM — POC SPECIFICATION v2
Agent-first architecture. Revised by Opus 4.6.
================================================================================

DESIGN PHILOSOPHY
-----------------
This system has one rule: if an agent can reason about it, an agent does it.

Code exists only as infrastructure — routing messages, calling the API,
persisting state, rendering the UI. Every decision, every transition, every
quality judgment, every recovery from error is made by an agent.

This means:
  - No buttons gate transitions between phases. An orchestrator agent decides
    what happens next.
  - No hardcoded thresholds. Agents decide when something is complete, deep
    enough, diverse enough, or good enough.
  - No predefined schemas. Agents decide what structure their output needs
    based on what they learn.
  - No coded error recovery. When something fails, an agent decides what to
    do about it.
  - No manually constructed prompts. Agents write the prompts for downstream
    agents.

The POC exists to prove that frontier-class language models can orchestrate
a multi-agent research pipeline end-to-end with minimal scaffolding code.


OVERVIEW
--------
A single web application where:
1. The user has a conversation with a context agent
2. An orchestrator agent watches the system state and drives all transitions
3. Agents spawn other agents, write their prompts, evaluate their output,
   and decide when the work is done
4. Every agent's full context window is visible and downloadable at all times
5. The entire run — first message to final transcript — completes in under
   5 minutes


TECHNOLOGY STACK
----------------
- Frontend: Single-page app (React or vanilla JS)
- Backend: Node.js or Python — a thin agent runtime, not business logic
- LLM: Anthropic Claude API (claude-sonnet-4-20250514) for all agents
- Storage: In-memory with filesystem export — no database
- API key: Environment variable ANTHROPIC_API_KEY
- All agent calls use the Anthropic /v1/messages endpoint


THE AGENT RUNTIME — WHAT CODE ACTUALLY DOES
---------------------------------------------
The backend is an "agent runtime" — minimal infrastructure that agents
operate on top of. It provides exactly five capabilities:

1. CREATE AGENT: Register an agent with an ID, a system prompt, and an
   initial message history. The system prompt and ID can be provided by
   another agent.

2. SEND MESSAGE: Send a message to a named agent and return its response.
   Append both to that agent's message history.

3. LOG: Record every agent call — timestamp, agent ID, system prompt,
   full message history, response, token counts — to a system log.

4. EMIT EVENT: Push a structured event to the UI and to the orchestrator
   agent. Events are: agent_created, message_sent, message_received,
   phase_changed, error_occurred, output_produced.

5. EXPORT: Serialize any agent's full state (system prompt + message
   history) or the entire system state to JSON.

That is it. The runtime does not decide what agents to create, when to
create them, what to send, or when to stop. Agents decide all of that.


SYSTEM ARCHITECTURE — AGENTS
------------------------------

THE ORCHESTRATOR AGENT
  Role: The system's executive. Observes all events and decides what
    happens next. Replaces all coded flow logic and user-facing buttons.
  Input: Every system event is appended to the orchestrator's context as
    a structured message: { event_type, agent_id, summary, timestamp }.
  Behaviour:
    - After each event, the orchestrator is called and asked: "Given the
      current system state, what is the next action?"
    - It responds with a structured decision. Valid decisions:
        CREATE_AGENT { id, system_prompt, initial_message }
        SEND_MESSAGE { target_agent_id, message }
        ADVANCE_PHASE { new_phase, reason }
        REQUEST_REVISION { target_agent_id, feedback }
        COMPLETE_SYSTEM { summary }
    - The orchestrator can chain decisions — e.g., create an agent AND
      send it a message in one response.
    - The orchestrator sees summaries of events, not full transcripts.
      It can request full state for any agent if it needs it.
  What it replaces:
    - The "Generate Personas" button → orchestrator decides when the
      brief is ready and triggers persona generation
    - The "Run Interviews" button → orchestrator decides when personas
      are satisfactory and triggers interviews
    - Sequential interview scheduling → orchestrator decides which
      persona to interview next and when to move on
    - Error recovery logic → orchestrator decides how to handle failures
  System prompt (base):
    You are the orchestrator of a synthetic audience research system.
    You observe events from the system and decide what happens next.
    Your goal: guide the system from initial user conversation to a
    complete set of high-quality interview transcripts.
    The phases are: context_gathering, persona_generation, interviewing,
    complete. You decide when to transition between them.
    You can create agents, send messages, request revisions, or advance
    the phase. You always explain your reasoning briefly.
    Respond with one or more JSON action objects.

THE CONTEXT AGENT
  Role: Interviews the human user to build a research brief.
  Input: Nothing — it opens the conversation.
  Behaviour:
    - Conducts a conversational interview with the user
    - Asks about the organisation, the research question, the context,
      the tensions, and the goals — but decides for itself what to ask
      based on what it learns. There is no predefined checklist.
    - Decides when it has enough context. Signals completion with
      [BRIEF_COMPLETE] followed by a JSON object.
    - The JSON brief structure is determined by the agent based on
      what it learned. It includes whatever fields are relevant to
      THIS specific research context. There is no fixed schema.
      The only required field is research_topic.
    - If the orchestrator requests revisions (e.g., "probe deeper on
      organisational tensions"), the context agent continues the
      conversation with the user.
  Transparency: Full system prompt, conversation history, and the
    produced brief are all visible and downloadable.

THE PERSONA ARCHITECT AGENT
  Role: Takes the brief and designs a synthetic audience.
  Input: The JSON brief from the context agent.
  Behaviour:
    - Reads the brief and decides how many personas are needed and what
      dimensions of diversity matter for this specific research context.
      A study on cross-departmental conflict needs different persona
      diversity than a study on remote work satisfaction.
    - Generates personas with genuine epistemic diversity — people who
      disagree, see things differently, have conflicting priorities.
    - For each persona, produces:
        a) A human-readable profile (name, role, traits, description)
        b) A complete system prompt that will make an LLM embody this
           persona consistently through a full interview
    - The persona system prompts are written by this agent — they are
      not templates with variable injection. The architect crafts each
      prompt specifically for the persona's character, considering how
      that character would behave in an interview on this specific topic.
    - Also produces a brief "audience design rationale" explaining why
      it chose these personas and what range of perspectives they cover.
  Output: A JSON object containing:
    - design_rationale: why these personas, what diversity dimensions
    - personas: array of persona objects, each with profile fields and
      a system_prompt field
  Transparency: The full prompt, raw response, and design rationale
    are all visible and downloadable.

THE INTERVIEW DESIGNER AGENT
  Role: Designs the interview strategy before any interviews run.
  Input: The brief and the persona profiles (not their system prompts).
  Behaviour:
    - Reads the research topic, organisational context, and persona
      profiles, and produces an interview strategy document.
    - Decides: opening approach, key themes to explore, how to adapt
      for different persona types (e.g., terse vs verbose respondents),
      probing strategies, and the criteria for when an interview is
      "deep enough."
    - Writes the interview agent's system prompt. This is not a
      template — it is a complete, tailored prompt designed for this
      specific research context and audience.
    - This agent exists because interview design is a skilled task.
      A generic "ask open questions and probe" prompt produces generic
      interviews. A researcher who has read the brief and knows the
      personas will design a better instrument.
  Output:
    - interview_strategy: the strategy document (visible to user)
    - interviewer_system_prompt: the complete system prompt for the
      interview agent, tailored to this research context
  Transparency: Full prompt, strategy document, and the interviewer
    system prompt it wrote are all visible and downloadable.

THE INTERVIEW AGENT (instantiated per interview)
  Role: Conducts a single interview with a single persona.
  Input: The system prompt written by the Interview Designer. The
    research brief is embedded in that prompt by the designer.
  Behaviour:
    - Opens the interview, asks questions, probes, and concludes.
    - Decides its own depth and completion. There are no hardcoded
      turn counts. The interview designer's prompt gives it criteria
      for "deep enough," and the agent uses its judgment.
    - Signals completion with [INTERVIEW_COMPLETE] followed by brief
      notes on what it learned.
    - Safety rail only: a maximum of 15 turns is enforced by the
      runtime (not the agent) to prevent runaway API costs. This is
      the only hardcoded threshold in the system and it exists for
      cost control, not quality control.
  Transparency: Full system prompt, full message history, and notes
    are visible and downloadable.

THE PERSONA AGENT (instantiated per interview)
  Role: Embodies a synthetic persona during an interview.
  Input: The system prompt written by the Persona Architect for this
    specific persona.
  Behaviour:
    - Responds to interview questions in character.
    - Maintains consistency — remembers what it said, does not
      contradict itself, maintains communication style.
    - Does not know it is being interviewed by an AI. Does not know
      anything about the system. It believes it is a person in a
      research interview.
  Transparency: Full system prompt and message history are visible
    and downloadable.

THE QUALITY REVIEWER AGENT (optional, spawned by orchestrator)
  Role: Evaluates outputs at any stage and provides feedback.
  Input: Whatever the orchestrator asks it to review — personas, a
    transcript, the brief, the interview strategy.
  Behaviour:
    - The orchestrator can spawn this agent at any point to get a
      second opinion. For example:
        - After persona generation: "Are these personas diverse enough?
          Does anyone overlap? Is there a perspective missing?"
        - After an interview: "Was this interview deep enough? Did the
          interviewer miss an obvious probe?"
    - Returns a structured assessment: passed / needs_revision, with
      specific feedback if revision is needed.
    - The orchestrator uses this feedback to decide whether to proceed
      or request revision from the responsible agent.
  Note: This agent is NOT required in every run. The orchestrator
    decides whether to spawn it. For a simple brief and clean personas,
    it might skip review entirely. For a complex brief with subtle
    dynamics, it might review every output. That judgment is the
    orchestrator's job.


WHAT THE ORCHESTRATOR DECIDES — EXAMPLES
------------------------------------------
These illustrate the kinds of decisions the orchestrator makes. They are
NOT coded as rules — they emerge from the orchestrator's judgment.

- Brief complete → "The brief has enough context. Creating the persona
  architect agent."
- Personas generated → "Five personas generated. The rationale says they
  cover four departments but the brief mentions five. I will ask the
  quality reviewer to assess diversity."
- Quality reviewer says revision needed → "Reviewer says marketing
  perspective is missing. Requesting revision from persona architect
  with this specific feedback."
- Personas satisfactory → "Personas are diverse and well-designed.
  Creating the interview designer."
- Interview strategy ready → "Strategy looks appropriate. Beginning
  interviews. Starting with the most senior persona to test the
  interview approach on the most challenging respondent first."
- Interview complete → "Interview with Persona 3 complete. The notes
  suggest rich material on the restructuring tension. Moving to the
  next persona."
- Shallow interview → "Interview with Persona 5 reached 10 turns but
  the notes suggest only surface-level responses. The orchestrator can
  choose to: accept it, re-interview with adjusted approach, or flag
  it for the user."
- All interviews done → "All five interviews complete. Producing final
  outputs. COMPLETE_SYSTEM."
- API error → "The persona architect call failed with a rate limit
  error. Waiting 30 seconds and retrying."


THE FLOW — WHAT HAPPENS, NOT WHAT'S CODED
-------------------------------------------
This describes the typical sequence. The orchestrator drives it, not code.

1. User opens the app. The context agent is created and sends its
   opening message.

2. User and context agent converse. Each exchange is an event the
   orchestrator observes. The orchestrator does not intervene during
   context gathering — it watches and waits for [BRIEF_COMPLETE].

3. Context agent signals brief complete. The orchestrator receives this
   event, reads the brief, and decides to proceed. It creates the
   persona architect agent and sends it the brief.

4. Persona architect generates personas and design rationale. The
   orchestrator receives the output. It may optionally spawn a quality
   reviewer. If satisfied, it creates the interview designer agent
   and sends it the brief and persona profiles.

5. Interview designer produces the strategy and the interviewer system
   prompt. The orchestrator reads the strategy.

6. Orchestrator decides interview order and begins. For each persona:
   it creates an interview agent (with the designer's prompt) and a
   persona agent (with the architect's prompt), and sends the opening
   message. It monitors turn-by-turn and decides when to move on.

7. After all interviews complete, the orchestrator emits COMPLETE_SYSTEM
   and all outputs become available for download.

User intervention: The user can override the orchestrator at any point
via a command input. For example: "Skip quality review" or "Re-interview
persona 3 with more focus on the budget conflict." These commands are
sent to the orchestrator as events, and it adapts.


USER INTERFACE — SINGLE PAGE, FOUR PANELS
-------------------------------------------
The UI is a single page with four always-visible panels. No tabs, no
hidden sections. The user sees the full system state at all times.
The system runs continuously — no buttons gate transitions between
phases. The orchestrator drives everything.

Design priorities: functional clarity over polish. Dense but readable.
Monospace where data is structured. System fonts elsewhere. Dark
background optional but recommended — this is a control room, not a
marketing page.

PANEL 1 — CONVERSATION (left side, ~40% width, full height)
  Top section: Chat interface for user ↔ context agent
    - Messages stream in real time
    - Standard chat layout: user messages right-aligned, agent left
    - When the brief is finalised, it appears inline as formatted JSON
      with a subtle background to distinguish it from chat
  Bottom section: Command input
    - A single text input with a toggle or prefix to switch between:
        "Chat" mode → sends to context agent
        "Command" mode → sends to orchestrator as a user_command event
    - Prefix approach is simplest: messages starting with / go to the
      orchestrator (e.g., "/skip review", "/pause", "/re-interview 3")
    - Normal messages go to the context agent (during context phase)
      or are ignored (during later phases, with a note saying so)
  Download buttons below: Brief JSON, Context agent state

PANEL 2 — PERSONAS (top right, ~60% width, ~40% height)
  Empty with a "Waiting for brief..." message until personas are generated.
  When populated:
    - Horizontal row of persona cards (or a scrollable grid if >5)
    - Each card shows: name, role, department, one-line description,
      interview status indicator (waiting / in progress / complete / error)
    - Click a card → expands a detail panel or modal showing:
        Full profile (all fields the architect generated)
        The system prompt that will run this persona (collapsible, mono)
    - Above the cards: the design rationale — a short paragraph from the
      persona architect explaining why it chose these personas.
      Collapsible, starts expanded.
  Download buttons: Personas JSON, Architect agent state

PANEL 3 — INTERVIEWS (bottom right, ~60% width, ~40% height)
  Empty with "Waiting for personas..." until interviews begin.
  When active:
    - Left sidebar: list of personas with status icons
        Grey dot = waiting
        Pulsing blue = in progress
        Green check = complete
        Red x = error
    - Main area: the currently active (or selected) interview transcript
        Each turn clearly labelled: INTERVIEWER / [PERSONA NAME]
        Streams in real time during active interviews
        Click any persona in the sidebar to view their transcript
    - Above the transcript: the interview strategy document (collapsible)
    - For each completed interview: interviewer notes (the summary the
      interview agent produced at completion)
    - Inspection buttons per interview:
        "Interviewer context" → modal/panel: system prompt + full history
        "Persona context" → modal/panel: system prompt + full history
  Download buttons: Transcripts JSON, Transcripts TXT, Interview strategy

PANEL 4 — ORCHESTRATOR & SYSTEM LOG (bottom strip, full width, ~15% height)
  A scrolling feed showing two interleaved streams, visually distinguished:

  Orchestrator decisions (highlighted, e.g., with a left border colour):
    - Timestamp
    - Event that triggered the decision
    - The decision: what action, which agent, why
    - Reasoning (the orchestrator's own explanation, 1-2 sentences)
    - Expandable: full orchestrator context at that moment

  System log entries (dimmer, lower visual weight):
    - Timestamp
    - Agent name
    - Action type (create_agent, send_message, receive_response, error)
    - Token count (in/out)
    - Expandable: full context window snapshot (system prompt + messages)

  Auto-scrolls to latest. User can scroll up to review history.
  Download buttons: Orchestrator log JSON, System log JSON, Full export


INSPECTION MODALS
------------------
Every "view context" action opens the same modal structure:
  - Agent ID and type
  - Agent status (active / completed / errored)
  - System prompt (in a scrollable monospace block, with a copy button)
  - Message history (each message in a collapsible block, newest last)
  - If the system prompt was written by another agent, a note saying:
    "This prompt was generated by [agent name]" with a link to view
    that agent's state
  - Download button: exports this agent's full state as JSON


AGENT PROMPT PRINCIPLES
------------------------
The following are principles, not templates. Each agent prompt in the
actual system is written or refined by another agent (except the
orchestrator and context agent, which have base prompts).

CONTEXT AGENT — base prompt provided by the system:
  "You are a senior research consultant conducting a briefing interview.
  Your job is to understand the organisation, the research question, and
  the context well enough to design a synthetic audience.
  You decide what to ask based on what you learn. Do not follow a
  checklist — follow the conversation.
  Probe for: organisational tensions, political dynamics, generational
  divides, geography-based differences, known factions or disagreements.
  These are what make a synthetic audience useful.
  When you have enough to design a rich, realistic audience, produce
  your brief. Signal with [BRIEF_COMPLETE] followed by a JSON object.
  The JSON structure is yours to decide. Include whatever fields are
  needed to fully capture this specific research context."

ORCHESTRATOR — base prompt provided by the system:
  (See THE ORCHESTRATOR AGENT section above.)

PERSONA ARCHITECT — base prompt provided by the system:
  "You are designing a synthetic audience for research interviews.
  Given the brief, decide how many personas are needed and what
  dimensions of diversity matter for this specific context.
  Each persona needs: a profile card with name, role, traits, and
  description; and a complete system prompt that will make a language
  model embody this person in an interview.
  Write each persona's system prompt yourself — do not use templates.
  Each prompt should encode the character's voice, opinions, communication
  patterns, emotional state, and consistency rules.
  Also write a design rationale: why these personas, what perspectives
  they represent, and what range of views they collectively cover.
  Return a JSON object with design_rationale and personas array."

INTERVIEW DESIGNER — base prompt provided by the system:
  "You are a qualitative research methodologist. Given the research brief
  and the persona profiles, design an interview strategy and write a
  complete system prompt for the interviewer agent.
  Your strategy should address: opening approach, core themes, probing
  techniques for different respondent types, and criteria for when an
  interview has achieved sufficient depth.
  The interviewer prompt you write should make the agent a skilled,
  adaptive interviewer — not a script-follower."

INTERVIEW AGENT — prompt written by the interview designer:
  (Not a template. The interview designer writes this based on the
  specific research context.)

PERSONA AGENTS — prompts written by the persona architect:
  (Not templates. The persona architect writes each one specifically.)

QUALITY REVIEWER — base prompt provided by the system:
  "You are a quality reviewer for a synthetic audience research system.
  You will be given an output to review and a specific question to answer.
  Be direct. Assess whether the output meets the standard described.
  Return: { passed: true/false, feedback: '...' }"


OUTPUT FILES
-------------
At the end of a complete run, the following are available:

1. brief.json — The research brief (structure determined by context agent)
2. personas.json — All persona profiles, system prompts, and design rationale
3. interview_strategy.json — The strategy document and interviewer prompt
4. transcripts.json — All interview transcripts with metadata
5. transcripts.txt — Human-readable flat file of all interviews
6. orchestrator_log.json — Every orchestrator decision with reasoning
7. system_log.json — Every API call: timestamp, agent, prompt, messages,
   response, tokens
8. full_export.json — Everything above in a single file


ERROR HANDLING — AGENT-DRIVEN
-------------------------------
Errors are events. They are sent to the orchestrator, which decides
how to respond.

- API call fails → orchestrator decides: retry, wait and retry, skip,
  or report to user
- Brief JSON unparseable → orchestrator sends the context agent a
  message asking it to re-emit the brief in valid JSON
- Persona generation returns invalid JSON → orchestrator asks the
  persona architect to retry
- Interview hits the 15-turn safety rail → orchestrator marks it as
  max_turns_reached and decides whether to accept, re-interview, or
  move on
- Persona breaks character → if the orchestrator notices (via quality
  review or event summaries), it can flag the transcript

The only coded error handling: catch API exceptions, log them, and
send them to the orchestrator as error_occurred events. The orchestrator
decides the response.


WHAT CODE DOES vs WHAT AGENTS DO
----------------------------------

CODE DOES:
  - Serve the frontend
  - Maintain WebSocket/SSE connections for real-time UI updates
  - Call the Claude API and handle responses
  - Maintain each agent's message history in memory
  - Log every API call
  - Route orchestrator decisions to runtime actions
  - Enforce the 15-turn safety rail
  - Serialize state to JSON for export
  - Parse signal tokens ([BRIEF_COMPLETE], [INTERVIEW_COMPLETE]) from
    agent responses and emit them as events

AGENTS DO:
  - Decide what to ask the user
  - Decide when the brief is complete
  - Decide what the brief structure should be
  - Decide how many personas to create
  - Decide what dimensions of diversity matter
  - Write persona system prompts
  - Design the interview strategy
  - Write the interviewer system prompt
  - Conduct the interviews (decide questions, depth, completion)
  - Evaluate quality of any output
  - Decide when to advance between phases
  - Decide how to handle errors
  - Decide interview order
  - Decide whether quality review is needed


WHAT SUCCESS LOOKS LIKE
------------------------
A working POC demonstrates this:
- User opens the app, converses with the context agent
- The orchestrator autonomously drives the system forward
- Personas appear with a visible design rationale explaining the choices
- An interview strategy appears before interviews begin
- Interviews run one by one, each uniquely adapted to the persona
- The orchestrator log shows clear reasoning at every decision point
- Every agent's full context window is inspectable at any time
- All outputs download cleanly
- The system recovers from at least one injected error (e.g., a
  deliberately malformed persona) via orchestrator-driven recovery
- The whole run takes under 5 minutes
- The amount of application code is notably small relative to what
  the system accomplishes — because agents are doing the work


IMPLEMENTATION NOTES FOR CODING AGENT
---------------------------------------
- The orchestrator is called after EVERY event. Keep its context window
  manageable: send it event summaries, not full transcripts. It can
  request full state if needed.
- The orchestrator's response format must be reliably parseable. Use a
  structured output instruction: "Respond with a JSON array of actions."
  Each action has a type and parameters. Parse with error handling.
- Agent system prompts are immutable once created. If the orchestrator
  wants to modify an agent's behaviour, it sends a message, not a
  prompt edit.
- The frontend should poll or subscribe to events and update all
  sections reactively. No section waits for user action to appear.
- For the POC, all interviews run sequentially. The orchestrator decides
  order but starts only one at a time.
- The interview designer is a single-shot agent — one call, one output.
  The quality reviewer is also single-shot per invocation. The context
  agent and interview agent are multi-turn.
- Token budget estimate: ~5 context turns (~2K tokens), ~1 persona
  generation (~4K), ~1 interview design (~2K), ~5 interviews × ~10
  turns × ~500 tokens = ~25K, plus orchestrator calls (~5K). Total
  rough budget: ~40K tokens per run.

================================================================================
END OF SPECIFICATION v2
================================================================================
