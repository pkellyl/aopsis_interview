"""Orchestrator loop. Background worker that receives events, calls orchestrator agent,
parses decisions, and executes actions. Runs in its own thread to avoid blocking API responses."""

import json
import re
import queue
import threading
from datetime import datetime, timezone

import config
from core import hub, agent_runtime

_queue = queue.Queue()
_worker_thread = None
_running = False

# Events worth sending to the orchestrator
_NOTIFY_EVENTS = {
    "output_produced", "phase_changed", "user_command",
    "error_occurred", "interview_complete"
}


def initialize():
    """Create the orchestrator agent with base prompt and start background worker."""
    prompt = config.load_prompt("orchestrator")
    agent_runtime.create_agent(
        agent_id="orchestrator",
        agent_type="orchestrator",
        system_prompt=prompt,
        model_tier="smart"
    )
    start_worker()


def start_worker():
    """Start the background worker thread."""
    global _worker_thread, _running
    if _worker_thread and _worker_thread.is_alive():
        return
    _running = True
    _worker_thread = threading.Thread(target=_worker_loop, daemon=True)
    _worker_thread.start()


def stop_worker():
    """Stop the background worker thread."""
    global _running
    _running = False


# Events from the orchestrator itself that should still be processed (not filtered as loops)
_SELF_EVENTS = {"interview_complete"}


def enqueue(event):
    """Add an event to the orchestrator's processing queue. Called from any thread."""
    if not _running:
        return
    event_type = event.get("event_type")
    if event_type not in _NOTIFY_EVENTS:
        return
    # Skip orchestrator's own events to prevent loops, EXCEPT self-events like interview_complete
    if event.get("agent_id") == "orchestrator" and event_type not in _SELF_EVENTS:
        return
    _queue.put(event)


def _worker_loop():
    """Background loop: pull events from queue and process them."""
    while _running:
        try:
            event = _queue.get(timeout=1.0)
        except queue.Empty:
            continue

        agent = hub.get_agent("orchestrator")
        if agent is None or agent["status"] != "active":
            continue

        try:
            _process_event(event)
        except Exception as e:
            hub.add_orchestrator_log({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "decision": f"WORKER ERROR: {e}",
                "reasoning": "Unhandled exception in orchestrator loop"
            })


def _process_event(event):
    """Send event summary to orchestrator and handle response."""
    summary = _format_event(event)

    try:
        response = agent_runtime.send_message("orchestrator", summary)
    except Exception as e:
        hub.add_orchestrator_log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": summary,
            "decision": f"ERROR: {e}",
            "reasoning": "Orchestrator call failed"
        })
        return

    actions = _parse_actions(response)

    hub.add_orchestrator_log({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": summary,
        "decision": response[:500],
        "reasoning": response[:200],
        "action_count": len(actions)
    })

    for action in actions:
        _execute_action(action)


def _format_event(event):
    """Format an event as a concise message for the orchestrator."""
    parts = [
        f"EVENT: {event.get('event_type', 'unknown')}",
        f"AGENT: {event.get('agent_id', 'system')}",
        f"SUMMARY: {event.get('summary', '')}",
        f"CURRENT_PHASE: {hub.get_phase()}",
    ]

    # Add outputs context so orchestrator knows what's available
    outputs = hub.get_state().get("outputs", {})
    if outputs.get("brief"):
        parts.append(f"BRIEF_DATA: {json.dumps(outputs['brief'])[:3000]}")
    if outputs.get("personas"):
        # Send persona summaries (not full system prompts — those are large)
        personas = outputs["personas"].get("personas", [])
        summaries = [{"name": p.get("name"), "role": p.get("role"),
                       "department": p.get("department"), "traits": p.get("traits"),
                       "description": p.get("description")} for p in personas]
        parts.append(f"PERSONAS: {json.dumps(summaries)[:3000]}")
    if outputs.get("interview_strategy"):
        parts.append("INTERVIEW_STRATEGY: available")

    # Add active agents
    agents = hub.get_all_agents()
    parts.append(f"ACTIVE_AGENTS: {[a['id'] for a in agents.values() if a['status'] == 'active']}")

    # Add event-specific data
    data = event.get("data", {})
    if data.get("command"):
        parts.append(f"COMMAND: {data['command']}")

    return "\n".join(parts)


def _parse_actions(response):
    """Extract JSON action array from orchestrator response."""
    # Try to find a JSON array in the response
    # The orchestrator might include reasoning text before/after the JSON
    json_match = re.search(r'\[.*\]', response, re.DOTALL)
    if json_match:
        try:
            actions = json.loads(json_match.group())
            if isinstance(actions, list):
                return actions
        except json.JSONDecodeError:
            pass

    # Try parsing the whole response as JSON
    try:
        result = json.loads(response)
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return [result]
    except (json.JSONDecodeError, ValueError):
        pass

    return []


def _execute_action(action):
    """Execute a single orchestrator action."""
    action_type = action.get("type", "")
    params = action.get("params", {})

    try:
        if action_type == "CREATE_AGENT":
            _do_create_agent(params)
        elif action_type == "SEND_MESSAGE":
            _do_send_message(params)
        elif action_type == "ADVANCE_PHASE":
            _do_advance_phase(params)
        elif action_type == "REQUEST_REVISION":
            _do_request_revision(params)
        elif action_type == "RUN_INTERVIEW":
            _do_run_interview(params)
        elif action_type == "COMPLETE_SYSTEM":
            _do_complete_system(params)
        else:
            agent_runtime.emit_event(
                "error_occurred", "orchestrator",
                f"Unknown action type: {action_type}"
            )
    except Exception as e:
        agent_runtime.emit_event(
            "error_occurred", "orchestrator",
            f"Action {action_type} failed: {e}"
        )


# Agent types that have base prompts on disk — orchestrator should NOT override these
_BASE_PROMPT_AGENTS = {
    "persona_architect": "persona_architect",
    "interview_designer": "interview_designer",
    "quality_reviewer": "quality_reviewer",
}


def _do_create_agent(params):
    """Execute CREATE_AGENT action. Uses base prompts from disk for known agent types."""
    agent_id = params.get("id", "")
    agent_type = params.get("agent_type", agent_id)
    model_tier = params.get("model_tier")
    initial_message = params.get("initial_message")

    # For known agent types, load base prompt from disk (not orchestrator-written)
    if agent_type in _BASE_PROMPT_AGENTS:
        system_prompt = config.load_prompt(_BASE_PROMPT_AGENTS[agent_type])
    else:
        system_prompt = params.get("system_prompt", "")

    if not agent_id or not system_prompt:
        return

    agent_runtime.create_agent(
        agent_id=agent_id,
        agent_type=agent_type,
        system_prompt=system_prompt,
        model_tier=model_tier,
        created_by="orchestrator"
    )

    if initial_message:
        response = agent_runtime.send_message(agent_id, initial_message)
        _handle_agent_output(agent_id, agent_type, response)


def _do_send_message(params):
    """Execute SEND_MESSAGE action."""
    target = params.get("target_agent_id", "")
    message = params.get("message", "")
    if not target or not message:
        return

    agent = hub.get_agent(target)
    if agent is None:
        return

    response = agent_runtime.send_message(target, message)
    _handle_agent_output(target, agent.get("type", ""), response)


def _do_advance_phase(params):
    """Execute ADVANCE_PHASE action."""
    new_phase = params.get("new_phase", "")
    reason = params.get("reason", "")
    if new_phase:
        hub.set_phase(new_phase)
        agent_runtime.emit_event(
            "phase_changed", "orchestrator",
            f"Phase → {new_phase}: {reason}"
        )


def _do_request_revision(params):
    """Execute REQUEST_REVISION action and process the revised output."""
    target = params.get("target_agent_id", "")
    feedback = params.get("feedback", "")
    if not target or not feedback:
        return

    agent = hub.get_agent(target)
    if agent is None:
        return

    response = agent_runtime.send_message(target, f"REVISION REQUESTED: {feedback}")
    _handle_agent_output(target, agent.get("type", ""), response)


MAX_INTERVIEW_TURNS = 15


def _do_run_interview(params):
    """Execute RUN_INTERVIEW: create interviewer+persona agents, run multi-turn loop, store transcript."""
    persona_id = params.get("persona_id", "")
    if not persona_id:
        return

    # Get persona data from stored outputs
    personas_data = hub.get_outputs().get("personas", {})
    persona_list = personas_data.get("personas", [])
    persona = None
    for p in persona_list:
        if p.get("name", "").lower().replace(" ", "_") == persona_id or p.get("name") == persona_id:
            persona = p
            break
    # Fallback: match by index if persona_id is numeric
    if persona is None and persona_id.isdigit():
        idx = int(persona_id)
        if 0 <= idx < len(persona_list):
            persona = persona_list[idx]

    if persona is None:
        agent_runtime.emit_event(
            "error_occurred", "orchestrator",
            f"Persona not found: {persona_id}"
        )
        return

    # Get interviewer prompt from interview strategy
    strategy = hub.get_outputs().get("interview_strategy", {})
    interviewer_prompt = strategy.get("interviewer_system_prompt", "")
    if not interviewer_prompt:
        agent_runtime.emit_event(
            "error_occurred", "orchestrator",
            "No interviewer system prompt available"
        )
        return

    persona_name = persona.get("name", persona_id)
    persona_prompt = persona.get("system_prompt", "")
    safe_id = persona_name.lower().replace(" ", "_")
    interviewer_id = f"interviewer_{safe_id}"
    persona_agent_id = f"persona_{safe_id}"

    # Create both agents
    agent_runtime.create_agent(
        agent_id=interviewer_id,
        agent_type="interviewer",
        system_prompt=interviewer_prompt,
        model_tier="balanced",
        created_by="orchestrator"
    )
    agent_runtime.create_agent(
        agent_id=persona_agent_id,
        agent_type="persona",
        system_prompt=persona_prompt,
        model_tier="balanced",
        created_by="orchestrator"
    )

    # Start transcript
    hub.add_transcript(safe_id, persona_name)

    agent_runtime.emit_event(
        "interview_started", "orchestrator",
        f"Interview started with {persona_name}",
        {"persona_id": safe_id, "persona_name": persona_name}
    )

    # Get interviewer's opening question
    opening = agent_runtime.send_message(
        interviewer_id,
        f"Begin the interview. The respondent is: {persona_name}, {persona.get('role', '')}, {persona.get('department', '')}. {persona.get('description', '')}"
    )
    hub.append_turn(safe_id, "interviewer", opening)

    # Multi-turn loop
    turn_count = 0
    last_interviewer_msg = opening

    while turn_count < MAX_INTERVIEW_TURNS:
        turn_count += 1

        # Persona responds to interviewer
        persona_response = agent_runtime.send_message(persona_agent_id, last_interviewer_msg)
        hub.append_turn(safe_id, "persona", persona_response)

        agent_runtime.emit_event(
            "interview_turn", "orchestrator",
            f"Interview {persona_name}: turn {turn_count}",
            {"persona_id": safe_id, "turn": turn_count, "role": "persona"}
        )

        # Check if we've hit the safety rail
        if turn_count >= MAX_INTERVIEW_TURNS:
            break

        # Interviewer follows up
        interviewer_response = agent_runtime.send_message(interviewer_id, persona_response)
        hub.append_turn(safe_id, "interviewer", interviewer_response)

        # Check if interviewer signals end (contains "[END_INTERVIEW]")
        if "[END_INTERVIEW]" in interviewer_response:
            break

        last_interviewer_msg = interviewer_response

    # Complete transcript and mark agents done
    hub.complete_transcript(safe_id)
    hub.update_agent_status(interviewer_id, "completed")
    hub.update_agent_status(persona_agent_id, "completed")

    agent_runtime.emit_event(
        "interview_complete", "orchestrator",
        f"Interview complete with {persona_name} ({turn_count} turns)",
        {"persona_id": safe_id, "persona_name": persona_name, "turns": turn_count}
    )


def _do_complete_system(params):
    """Execute COMPLETE_SYSTEM action."""
    summary = params.get("summary", "System complete")
    hub.set_phase("complete")
    agent_runtime.emit_event(
        "phase_changed", "orchestrator",
        f"SYSTEM COMPLETE: {summary}"
    )


def _handle_agent_output(agent_id, agent_type, response):
    """Check agent responses for structured outputs and store them."""
    if agent_type == "persona_architect":
        data = _try_parse_json(response)
        if data and "personas" in data:
            hub.set_output("personas", data)
            agent_runtime.emit_event(
                "output_produced", agent_id,
                f"Personas generated: {len(data['personas'])} personas",
                {"type": "personas"}
            )
            hub.update_agent_status(agent_id, "completed")

    elif agent_type == "interview_designer":
        data = _try_parse_json(response)
        if data and "interviewer_system_prompt" in data:
            hub.set_output("interview_strategy", data)
            agent_runtime.emit_event(
                "output_produced", agent_id,
                "Interview strategy and interviewer prompt produced",
                {"type": "interview_strategy"}
            )
            hub.update_agent_status(agent_id, "completed")

    elif agent_type == "quality_reviewer":
        data = _try_parse_json(response)
        if data:
            agent_runtime.emit_event(
                "output_produced", agent_id,
                f"Quality review: {'PASSED' if data.get('passed') else 'NEEDS REVISION'}",
                {"type": "quality_review", "review": data}
            )
            hub.update_agent_status(agent_id, "completed")


def _try_parse_json(text):
    """Try to extract JSON from a response that may contain text + JSON."""
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
