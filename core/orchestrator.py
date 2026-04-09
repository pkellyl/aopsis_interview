"""Deterministic pipeline runner. Executes the fixed pipeline (brief → personas → strategy →
interviews → synthesis) in a background thread. No LLM orchestrator — each step directly
triggers the next. Interview loops run in parallel threads."""

import json
import re
import threading
from datetime import datetime, timezone

import config
import artifact_store
from core import hub, agent_runtime


# ---------------------------------------------------------------------------
# Public API (called by server.py, state_routes.py, chat_routes.py)
# ---------------------------------------------------------------------------

def initialize():
    """No-op. Kept for backward compatibility with callers."""
    pass


def start_worker():
    """No-op. Pipeline runs on demand via resume(), not as a persistent worker."""
    pass


def stop_worker():
    """No-op. No persistent worker to stop."""
    pass


def enqueue(event):
    """No-op. No event queue — pipeline is deterministic."""
    pass


def resume(override_phase=None):
    """Clear the pipeline gate and run the appropriate pipeline step in a background thread."""
    pending = override_phase or hub.get_pending_phase()
    if not pending:
        return False
    hub.clear_pending_phase()
    hub.set_phase(pending)
    _emit("pipeline_progress", f"Phase → {pending}")
    threading.Thread(target=_run_from_phase, args=(pending,), daemon=True).start()
    return True


# ---------------------------------------------------------------------------
# Pipeline entry point
# ---------------------------------------------------------------------------

def _run_from_phase(phase):
    """Run the pipeline starting from the given phase. Called in a background thread."""
    try:
        if phase == "persona_generation":
            _step_personas()
            _step_strategy()
            _step_interviews()
            _step_synthesize()
        elif phase == "interviewing":
            if not hub.get_outputs().get("interview_strategy"):
                _step_strategy()
            _step_interviews()
            _step_synthesize()
        elif phase == "synthesizing":
            _step_synthesize()
        else:
            _emit("pipeline_progress", f"No pipeline action for phase: {phase}")
    except Exception as e:
        _emit("error_occurred", f"Pipeline failed: {e}")
        hub.add_orchestrator_log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "decision": f"PIPELINE ERROR: {e}",
            "reasoning": "Unhandled exception in pipeline thread"
        })


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------

def _step_personas():
    """Step 1: Run persona_architect → produces personas + design rationale."""
    _emit("pipeline_progress", "Creating personas...")
    data = _run_agent("persona_architect", "persona_architect_1")
    if not data or "personas" not in data:
        raise RuntimeError("Persona architect did not produce valid personas")

    # Enforce max_personas
    cfg = config.get()
    mode = cfg.get("model_mode", "")
    max_p = cfg.get("max_personas", {}).get(mode)
    if max_p and len(data["personas"]) > max_p:
        data["personas"] = data["personas"][:max_p]

    hub.set_output("personas", data)
    artifact_store.save("personas", data)
    _emit("output_produced", f"Personas generated: {len(data['personas'])} personas")


def _step_strategy():
    """Step 2: Run interview_designer → produces interview strategy + interviewer prompt."""
    _emit("pipeline_progress", "Designing interview strategy...")
    data = _run_agent("interview_designer", "interview_designer_1")
    if not data or "interviewer_system_prompt" not in data:
        raise RuntimeError("Interview designer did not produce valid strategy")

    hub.set_output("interview_strategy", data)
    artifact_store.save("strategies", data)
    _emit("output_produced", "Interview strategy produced")


def _step_interviews():
    """Step 3: Run all interviews in parallel, wait for all to complete."""
    hub.set_phase("interviewing")
    _emit("pipeline_progress", "Starting interviews...")

    persona_list = hub.get_outputs().get("personas", {}).get("personas", [])
    max_allowed = _get_max_interviewees()
    personas_to_interview = persona_list[:max_allowed]

    strategy = hub.get_outputs().get("interview_strategy", {})
    interviewer_prompt = strategy.get("interviewer_system_prompt", "")
    if not interviewer_prompt:
        raise RuntimeError("No interviewer system prompt available")

    threads = []
    for persona in personas_to_interview:
        name = persona.get("name", "")
        if not name:
            continue
        safe_id = name.lower().replace(" ", "_")
        interviewer_id = f"interviewer_{safe_id}"
        persona_agent_id = f"persona_{safe_id}"

        agent_runtime.create_agent(
            agent_id=interviewer_id, agent_type="interviewer",
            system_prompt=interviewer_prompt, created_by="pipeline"
        )
        agent_runtime.create_agent(
            agent_id=persona_agent_id, agent_type="persona",
            system_prompt=persona.get("system_prompt", ""), created_by="pipeline"
        )
        hub.add_transcript(safe_id, name)
        _emit("interview_started", f"Interview started with {name}")

        t = threading.Thread(
            target=_interview_loop,
            args=(safe_id, name, interviewer_id, persona_agent_id, persona),
            daemon=True
        )
        threads.append(t)
        t.start()

    # Wait for all interviews to finish
    for t in threads:
        t.join()

    # Save transcripts artifact
    transcripts = hub.get_outputs().get("transcripts", [])
    complete = [t for t in transcripts if t.get("status") == "complete"]
    if not complete:
        raise RuntimeError("All interviews failed — cannot proceed to synthesis")
    artifact_store.save("transcripts", complete)
    _emit("pipeline_progress", f"All interviews done ({len(complete)} complete)")


def _step_synthesize():
    """Step 4: Run synthesis designer + synthesis agent → produce report."""
    _do_synthesize({})


# ---------------------------------------------------------------------------
# Agent runner
# ---------------------------------------------------------------------------

def _run_agent(agent_type, agent_id):
    """Create agent from disk prompt, compose message from hub data, send, parse JSON output."""
    prompt = config.load_prompt(agent_type)
    if not prompt:
        raise RuntimeError(f"No prompt found for agent type: {agent_type}")

    agent_runtime.create_agent(
        agent_id=agent_id, agent_type=agent_type,
        system_prompt=prompt, created_by="pipeline"
    )

    message = _compose_initial_message(agent_type)
    if not message:
        raise RuntimeError(f"Could not compose message for {agent_type}")

    response = agent_runtime.send_message(agent_id, message)
    hub.update_agent_status(agent_id, "completed")
    return _try_parse_json(response)


def _compose_initial_message(agent_type):
    """Build the data payload for each agent type from hub outputs."""
    outputs = hub.get_outputs()

    if agent_type == "persona_architect":
        brief = outputs.get("brief")
        if brief:
            cfg = config.get()
            mode = cfg.get("model_mode", "")
            max_p = cfg.get("max_personas", {}).get(mode)
            if max_p:
                constraint = (
                    f"MANDATORY REQUIREMENT: You MUST create exactly {max_p} personas. "
                    f"Not fewer, not more — exactly {max_p}. "
                    f"This is a hard constraint from the system configuration.\n\n"
                )
            else:
                constraint = ""
            return f"{constraint}RESEARCH BRIEF:\n{json.dumps(brief, indent=2)}"

    elif agent_type == "interview_designer":
        brief = outputs.get("brief")
        personas = outputs.get("personas", {})
        if brief and personas:
            summaries = [
                {k: p.get(k) for k in ("name", "role", "department", "traits", "description")}
                for p in personas.get("personas", [])
            ]
            return (
                f"RESEARCH BRIEF:\n{json.dumps(brief, indent=2)}\n\n"
                f"PERSONAS:\n{json.dumps(summaries, indent=2)}\n\n"
                f"Design the interview strategy and write the interviewer system prompt."
            )

    return None


# ---------------------------------------------------------------------------
# Interview loop (runs in its own thread per persona)
# ---------------------------------------------------------------------------

def _interview_loop(safe_id, persona_name, interviewer_id, persona_agent_id, persona):
    """Run the multi-turn interview conversation. Executes in its own thread."""
    turn_count = 0
    try:
        opening = agent_runtime.send_message(
            interviewer_id,
            f"Begin the interview. The respondent is: {persona_name}, "
            f"{persona.get('role', '')}, {persona.get('department', '')}. "
            f"{persona.get('description', '')}"
        )
        hub.append_turn(safe_id, "interviewer", opening)
        last_interviewer_msg = opening

        max_turns = _get_max_turns()
        while turn_count < max_turns:
            turn_count += 1

            persona_response = agent_runtime.send_message(persona_agent_id, last_interviewer_msg)
            hub.append_turn(safe_id, "persona", persona_response)

            _emit("interview_turn", f"Interview {persona_name}: turn {turn_count}")

            if turn_count >= max_turns:
                break

            interviewer_response = agent_runtime.send_message(interviewer_id, persona_response)
            hub.append_turn(safe_id, "interviewer", interviewer_response)

            if "[END_INTERVIEW]" in interviewer_response:
                break

            last_interviewer_msg = interviewer_response

    except Exception as e:
        hub.complete_transcript(safe_id)
        hub.update_agent_status(interviewer_id, "completed")
        hub.update_agent_status(persona_agent_id, "completed")
        _emit("interview_complete", f"Interview FAILED with {persona_name}: {e}")
        return

    hub.complete_transcript(safe_id)
    hub.update_agent_status(interviewer_id, "completed")
    hub.update_agent_status(persona_agent_id, "completed")
    _emit("interview_complete", f"Interview complete with {persona_name} ({turn_count} turns)")


# ---------------------------------------------------------------------------
# Synthesis (also called directly by /api/synthesize)
# ---------------------------------------------------------------------------

def _do_synthesize(params):
    """Run synthesis designer + synthesis agent to produce the final report."""
    hub.set_phase("synthesizing")
    outputs = hub.get_outputs()
    transcripts = outputs.get("transcripts", [])
    complete_transcripts = [t for t in transcripts if t.get("status") == "complete"]
    if not complete_transcripts:
        _emit("error_occurred", "No completed transcripts to synthesize")
        hub.set_phase("interviewing")
        return

    brief = outputs.get("brief", {})

    # Step 1: Run synthesis designer to craft the synthesis agent's prompt
    synthesis_prompt = _design_synthesis(brief, complete_transcripts)

    # Step 2: Build transcript texts
    transcript_texts = _build_transcript_texts(complete_transcripts)
    all_transcripts = "\n\n---\n\n".join(transcript_texts)

    # Step 3: Create synthesis agent
    agent_id = "synthesis_agent"
    agent_runtime.create_agent(
        agent_id=agent_id, agent_type="synthesis_agent",
        system_prompt=synthesis_prompt, model_tier="balanced", created_by="pipeline"
    )

    # Step 4: Send brief + transcripts
    brief_text = json.dumps(brief, indent=2) if brief else "No brief available."
    message = (
        f"RESEARCH BRIEF:\n{brief_text}\n\n"
        f"INTERVIEW TRANSCRIPTS ({len(complete_transcripts)} interviews):\n\n{all_transcripts}"
    )

    try:
        response = agent_runtime.send_message(agent_id, message)
        data = _try_parse_json(response)
        if data and "sections" in data:
            hub.set_output("synthesis", data)
            artifact_store.save("syntheses", data)
            hub.update_agent_status(agent_id, "completed")
            hub.set_phase("complete")
            _emit("synthesis_complete", "Interview synthesis complete")
        else:
            hub.update_agent_status(agent_id, "completed")
            hub.set_phase("complete")
            _emit("error_occurred", f"Synthesis JSON parse failed. Raw: {response[:200]}")
    except Exception as e:
        hub.update_agent_status(agent_id, "completed")
        hub.set_phase("complete")
        _emit("error_occurred", f"Synthesis failed: {e}")


def _design_synthesis(brief, complete_transcripts):
    """Run synthesis designer agent to craft the synthesis agent's system prompt."""
    designer_id = "synthesis_designer"
    prompt = config.load_prompt("synthesis_designer")
    agent_runtime.create_agent(
        agent_id=designer_id, agent_type="synthesis_designer",
        system_prompt=prompt, model_tier="smart", created_by="pipeline"
    )

    interview_info = [f"- {t.get('persona_name', 'Unknown')}: {len(t.get('turns', []))} turns"
                      for t in complete_transcripts]
    interviews_summary = "\n".join(interview_info)
    brief_text = json.dumps(brief, indent=2) if brief else "No brief available."
    message = (
        f"RESEARCH BRIEF:\n{brief_text}\n\n"
        f"COMPLETED INTERVIEWS:\n{interviews_summary}\n\n"
        f"Design the synthesis agent's system prompt based on this brief and interviews."
    )

    try:
        response = agent_runtime.send_message(designer_id, message)
        data = _try_parse_json(response)
        if data and "synthesis_system_prompt" in data:
            hub.set_output("synthesis_design", data)
            hub.update_agent_status(designer_id, "completed")
            _emit("output_produced", "Synthesis methodology designed")
            return data["synthesis_system_prompt"]
        else:
            hub.update_agent_status(designer_id, "completed")
            _emit("error_occurred", f"Designer parse failed, using fallback. Raw: {response[:200]}")
    except Exception as e:
        hub.update_agent_status(designer_id, "completed")
        _emit("error_occurred", f"Designer failed, using fallback: {e}")

    return config.load_prompt("synthesis_agent")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _emit(event_type, summary, data=None):
    """Emit an SSE event for frontend updates."""
    agent_runtime.emit_event(event_type, "pipeline", summary, data)


def _get_max_turns():
    """Return max interview turns for current mode."""
    cfg = config.get()
    mode = cfg.get("model_mode", "dev")
    turn_limits = cfg.get("turn_limits", {})
    return turn_limits.get(mode, cfg.get("max_interview_turns", 15))


def _get_max_interviewees():
    """Return max interviewees for current mode."""
    cfg = config.get()
    mode = cfg.get("model_mode", "dev")
    return cfg.get("max_interviewees", {}).get(mode, 8)


def _build_transcript_texts(complete_transcripts):
    """Build concise transcript text summaries for the synthesis agent."""
    texts = []
    for t in complete_transcripts:
        lines = [f"=== Interview: {t.get('persona_name', 'Unknown')} ==="]
        for turn in t.get("turns", []):
            role = turn.get("role", "unknown").upper()
            content = turn.get("content", "")
            if len(content) > 800:
                content = content[:800] + "..."
            lines.append(f"{role}: {content}")
        texts.append("\n".join(lines))
    return texts


def _try_parse_json(text):
    """Extract JSON from a response that may contain text + JSON + markdown fences."""
    cleaned = re.sub(r'```(?:json)?\s*', '', text).strip()
    json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return None
