"""Chat API routes. Handles user ↔ context agent conversation and session lifecycle."""

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

import config
import artifact_store
from core import hub, agent_runtime

router = APIRouter()

BRIEF_SIGNAL = "[BRIEF_COMPLETE]"


@router.post("/api/start")
def start_session():
    """Initialize a new session: create context agent, set phase, get opening message."""
    if hub.get_phase() != "idle":
        return JSONResponse(
            status_code=400,
            content={"error": "Session already active", "phase": hub.get_phase()}
        )

    hub.set_phase("context_gathering")
    prompt = config.load_prompt("context_agent")

    agent_runtime.create_agent(
        agent_id="context",
        agent_type="context",
        system_prompt=prompt,
        model_tier="balanced"
    )

    try:
        opening = agent_runtime.send_message(
            "context", "Hello, I'd like to begin the research briefing."
        )
        return {"status": "started", "phase": "context_gathering", "opening": opening}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/chat")
def chat(body: dict = Body(...)):
    """Send a user message to the context agent."""
    message = body.get("message", "").strip()
    if not message:
        return JSONResponse(status_code=400, content={"error": "Empty message"})

    agent = hub.get_agent("context")
    if agent is None:
        return JSONResponse(status_code=400, content={"error": "No context agent. Call /api/start first."})

    if agent["status"] != "active":
        return JSONResponse(status_code=400, content={"error": "Context agent is not active"})

    try:
        response = agent_runtime.send_message("context", message)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # Check for brief completion signal
    brief = _extract_brief(response)
    if brief is not None:
        hub.set_output("brief", brief)
        artifact_store.save("briefs", brief)
        hub.update_agent_status("context", "completed")
        hub.set_pending_phase("persona_generation")
        agent_runtime.emit_event(
            "output_produced", "context",
            "Brief complete", {"type": "brief", "brief": brief}
        )

    return {"response": response, "brief_complete": brief is not None}


@router.post("/api/command")
def command(body: dict = Body(...)):
    """Send a user command (currently a no-op — kept for API compat)."""
    message = body.get("message", "").strip()
    if not message:
        return JSONResponse(status_code=400, content={"error": "Empty command"})

    agent_runtime.emit_event(
        "user_command", None,
        f"User command: {message}", {"command": message}
    )

    return {"status": "received", "message": message}


@router.post("/api/upload/brief")
def upload_brief(body: dict = Body(...)):
    """Upload a brief JSON to skip the briefing phase. Gates with pending_phase."""
    if hub.get_phase() not in ("idle", "context_gathering"):
        return JSONResponse(status_code=400, content={"error": "Cannot upload brief in current phase", "phase": hub.get_phase()})

    hub.set_output("brief", body)
    artifact_store.save("briefs", body, label="Uploaded")
    hub.set_pending_phase("persona_generation")

    agent_runtime.emit_event(
        "artifact_loaded", "system",
        "Brief uploaded by user", {"type": "brief"}
    )
    return {"status": "brief_uploaded", "pending_phase": "persona_generation"}


@router.post("/api/upload/personas")
def upload_personas(body: dict = Body(...)):
    """Upload personas JSON (with optional brief) to skip briefing and persona generation."""
    if hub.get_phase() not in ("idle", "context_gathering", "persona_generation"):
        return JSONResponse(status_code=400, content={"error": "Cannot upload personas in current phase", "phase": hub.get_phase()})

    # Accept either {personas: [...]} or {brief: {...}, personas: [...]}
    brief = body.get("brief")
    personas_data = body if "personas" in body and isinstance(body.get("personas"), list) else None
    if personas_data is None:
        return JSONResponse(status_code=400, content={"error": "JSON must contain a 'personas' array"})

    if brief:
        hub.set_output("brief", brief)
    elif not hub.get_outputs().get("brief"):
        hub.set_output("brief", {"research_objective": "Uploaded personas (no brief provided)"})

    hub.set_output("personas", personas_data)
    artifact_store.save("personas", personas_data, label="Uploaded")
    hub.set_pending_phase("interviewing")

    agent_runtime.emit_event(
        "artifact_loaded", "system",
        f"Personas uploaded by user ({len(personas_data.get('personas', []))} personas)",
        {"type": "personas"}
    )
    return {"status": "personas_uploaded", "pending_phase": "interviewing", "persona_count": len(personas_data.get("personas", []))}


@router.post("/api/synthesize")
def synthesize():
    """Manually trigger interview synthesis. Re-runs synthesis even if already complete."""
    transcripts = hub.get_outputs().get("transcripts", [])
    if not transcripts:
        return JSONResponse(status_code=400, content={"error": "No transcripts available"})

    complete = [t for t in transcripts if t.get("status") == "complete"]
    if not complete:
        return JSONResponse(status_code=400, content={"error": "No completed transcripts"})

    # Run synthesis in background thread so API responds immediately
    import threading
    from core.orchestrator import _do_synthesize
    threading.Thread(target=_do_synthesize, args=({},), daemon=True).start()
    return {"status": "synthesis_triggered", "transcripts": len(complete)}


@router.post("/api/refine-synthesis")
def refine_synthesis(body: dict = Body(...)):
    """Refine synthesis report based on user instruction. Runs in background thread."""
    instruction = body.get("instruction", "").strip()
    if not instruction:
        return JSONResponse(status_code=400, content={"error": "Empty instruction"})

    synthesis = hub.get_outputs().get("synthesis")
    if not synthesis:
        return JSONResponse(status_code=400, content={"error": "No synthesis to refine"})

    import threading
    threading.Thread(
        target=_do_refine_synthesis,
        args=(instruction, synthesis),
        daemon=True
    ).start()
    return {"status": "refining", "instruction": instruction}


def _do_refine_synthesis(instruction, current_synthesis):
    """Background worker: send instruction + current synthesis to refiner agent, update output."""
    hub.set_phase("refining")
    agent_id = "synthesis_refiner"

    # Create agent on first use, reuse on subsequent calls (multi-turn memory)
    agent = hub.get_agent(agent_id)
    if agent is None or agent["status"] != "active":
        prompt = config.load_prompt("synthesis_refiner")
        agent_runtime.create_agent(
            agent_id=agent_id,
            agent_type="synthesis_refiner",
            system_prompt=prompt,
            model_tier="balanced",
            created_by="system"
        )

    # Build the refinement message
    message = (
        f"CURRENT SYNTHESIS:\n{json.dumps(current_synthesis, indent=2)}\n\n"
        f"USER INSTRUCTION: {instruction}\n\n"
        f"Apply the instruction and return the complete updated synthesis JSON."
    )

    try:
        response = agent_runtime.send_message(agent_id, message)

        # Parse JSON from response (strip markdown fences first)
        cleaned = re.sub(r'```(?:json)?\s*', '', response).strip()
        json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        data = None
        if json_match:
            try:
                data = json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        if data and ("sections" in data or "executive_summary" in data):
            # Save previous version to history
            history = hub.get_outputs().get("synthesis_history") or []
            history.append({
                "version": len(history) + 1,
                "instruction": "Original" if len(history) == 0 else instruction,
                "synthesis": current_synthesis,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            hub.set_output("synthesis_history", history)

            # Update current synthesis
            hub.set_output("synthesis", data)
            hub.set_phase("complete")
            agent_runtime.emit_event(
                "synthesis_refined", agent_id,
                f"Synthesis refined: {instruction[:80]}",
                {"instruction": instruction, "version": len(history) + 1}
            )
        else:
            hub.set_phase("complete")
            agent_runtime.emit_event(
                "error_occurred", agent_id,
                f"Refiner JSON parse failed. Raw: {response[:200]}"
            )
    except Exception as e:
        hub.set_phase("complete")
        agent_runtime.emit_event("error_occurred", agent_id, f"Refinement failed: {e}")


@router.post("/api/visualize")
def visualize():
    """Generate rich HTML visualization from synthesis. Runs in background thread."""
    synthesis = hub.get_outputs().get("synthesis")
    if not synthesis:
        return JSONResponse(status_code=400, content={"error": "No synthesis to visualize"})

    brief = hub.get_outputs().get("brief", {})

    import threading
    threading.Thread(
        target=_do_visualize,
        args=(brief, synthesis),
        daemon=True
    ).start()
    return {"status": "visualizing"}


def _do_visualize(brief, synthesis):
    """Background worker: generate rich HTML visualization from synthesis data."""
    agent_id = "visualizer"

    hub.set_output("visualization", None)
    agent_runtime.emit_event(
        "visualization_started", agent_id, "Generating rich HTML visualization"
    )

    prompt = config.load_prompt("visualizer")
    agent_runtime.create_agent(
        agent_id=agent_id,
        agent_type="visualizer",
        system_prompt=prompt,
        model_tier="smart",
        created_by="system"
    )

    task = (
        f"RESEARCH BRIEF:\n{json.dumps(brief, indent=2)}\n\n"
        f"SYNTHESIS REPORT:\n{json.dumps(synthesis, indent=2)}\n\n"
        f"Create a comprehensive HTML visualization of these research findings. "
        f"Choose the most appropriate visualization types based on the data."
    )

    try:
        response = agent_runtime.send_message(agent_id, task, use_thinking=True)

        html = _extract_html(response)
        if html:
            hub.set_output("visualization", html)
            artifact_store.save("visualizations", html)
            agent_runtime.emit_event(
                "visualization_complete", agent_id,
                f"HTML visualization ready ({len(html)} chars)"
            )
        else:
            agent_runtime.emit_event(
                "visualization_error", agent_id,
                f"Visualizer did not produce valid HTML. Raw: {response[:200]}"
            )
    except Exception as e:
        agent_runtime.emit_event(
            "visualization_error", agent_id, f"Visualization failed: {e}"
        )


def _extract_html(text):
    """Extract HTML document from agent response, stripping markdown fences if present."""
    text = text.strip()
    text = re.sub(r'^```(?:html)?\s*', '', text)
    text = re.sub(r'\s*```\s*$', '', text)
    text = text.strip()
    match = re.search(r'(<!DOCTYPE html>.*?</html>)', text, re.DOTALL | re.IGNORECASE)
    if match:
        return _postprocess_html(match.group(1))
    if text.lower().startswith('<!doctype') or text.lower().startswith('<html'):
        return _postprocess_html(text)
    return None


_TAB_SCRIPT = """
<script>
(function(){
  var btns = document.querySelectorAll('[data-section]');
  if (!btns.length) return;
  var sections = document.querySelectorAll('[id^="sec-"]');
  if (!sections.length) return;
  function show(key) {
    sections.forEach(function(s) { s.style.display = s.id === 'sec-' + key ? '' : 'none'; });
    btns.forEach(function(b) {
      if (b.getAttribute('data-section') === key) b.classList.add('active');
      else b.classList.remove('active');
    });
  }
  btns.forEach(function(b) {
    b.addEventListener('click', function() { show(b.getAttribute('data-section')); });
  });
  var first = document.querySelector('[data-section].active') || btns[0];
  if (first) show(first.getAttribute('data-section'));
})()
</script>"""


def _postprocess_html(html):
    """Ensure generated HTML has working interactivity before storing."""
    if not html:
        return html
    has_tab_buttons = 'data-section=' in html
    has_tab_script = 'addEventListener' in html or 'onclick' in html
    if has_tab_buttons and not has_tab_script:
        if '</body>' in html:
            html = html.replace('</body>', _TAB_SCRIPT + '\n</body>')
        else:
            html += _TAB_SCRIPT
    return html


def _extract_brief(text):
    """Parse [BRIEF_COMPLETE] signal and extract JSON brief from response."""
    if BRIEF_SIGNAL not in text:
        return None

    after_signal = text.split(BRIEF_SIGNAL, 1)[1].strip()

    # Try to find JSON in the remaining text
    json_match = re.search(r'\{.*\}', after_signal, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # Try parsing the whole remainder
    try:
        return json.loads(after_signal)
    except (json.JSONDecodeError, ValueError):
        pass

    return None
