"""System state hub. The only shared dependency. All modules access state through this."""

import json
import threading
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR = Path(__file__).parent.parent / "data"
STATE_PATH = DATA_DIR / "state.json"

_state = None
_lock = threading.Lock()


def _initial_state():
    """Return a fresh system state."""
    return {
        "phase": "idle",
        "pending_phase": None,
        "agents": {},
        "events": [],
        "system_log": [],
        "orchestrator_log": [],
        "outputs": {
            "brief": None,
            "personas": None,
            "interview_strategy": None,
            "transcripts": []
        }
    }


def load():
    """Load state from disk, or initialize fresh."""
    global _state
    if STATE_PATH.exists():
        try:
            with open(STATE_PATH) as f:
                _state = json.load(f)
        except (json.JSONDecodeError, IOError):
            _state = _initial_state()
    else:
        _state = _initial_state()
    return _state


def save():
    """Persist current state to disk."""
    DATA_DIR.mkdir(exist_ok=True)
    with _lock:
        with open(STATE_PATH, "w") as f:
            json.dump(_state, f, indent=2, default=str)


def get_state():
    """Return current in-memory state."""
    if _state is None:
        load()
    return _state


def set_state(data: dict):
    """Replace in-memory state."""
    global _state
    with _lock:
        _state = data


def reset():
    """Reset to initial state."""
    global _state
    with _lock:
        _state = _initial_state()
    save()
    return _state


# --- Agent management ---

def register_agent(agent_id, agent_type, system_prompt, model_tier="balanced",
                   created_by=None, metadata=None):
    """Register a new agent in state."""
    with _lock:
        state = get_state()
        state["agents"][agent_id] = {
            "id": agent_id,
            "type": agent_type,
            "model_tier": model_tier,
            "system_prompt": system_prompt,
            "messages": [],
            "status": "active",
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {}
        }
    save()
    return state["agents"][agent_id]


def get_agent(agent_id):
    """Return agent data or None."""
    return get_state()["agents"].get(agent_id)


def get_all_agents():
    """Return all agents dict."""
    return get_state()["agents"]


def append_message(agent_id, role, content):
    """Append a message to an agent's history."""
    with _lock:
        agent = get_agent(agent_id)
        if agent is None:
            return None
        agent["messages"].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    save()
    return agent


def update_agent_status(agent_id, status):
    """Update an agent's status."""
    with _lock:
        agent = get_agent(agent_id)
        if agent:
            agent["status"] = status
    save()
    return agent


# --- Events ---

def add_event(event_type, agent_id=None, summary="", data=None):
    """Record a system event."""
    event = {
        "event_type": event_type,
        "agent_id": agent_id,
        "summary": summary,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    with _lock:
        get_state()["events"].append(event)
    save()
    return event


# --- Phase ---

def get_phase():
    """Return current phase."""
    return get_state()["phase"]


def set_phase(phase):
    """Set current phase."""
    with _lock:
        get_state()["phase"] = phase
    save()


# --- Pending phase (gated pipeline) ---

def get_pending_phase():
    """Return pending phase or None."""
    return get_state().get("pending_phase")


def set_pending_phase(phase):
    """Store a pending phase transition (gate)."""
    with _lock:
        get_state()["pending_phase"] = phase
    save()


def clear_pending_phase():
    """Clear the pending phase gate."""
    with _lock:
        get_state()["pending_phase"] = None
    save()


# --- Outputs ---

def set_output(key, value):
    """Set an output value."""
    with _lock:
        get_state()["outputs"][key] = value
    save()


def get_outputs():
    """Return all outputs."""
    return get_state()["outputs"]


# --- Logs ---

def add_system_log(entry):
    """Add entry to system log."""
    with _lock:
        get_state()["system_log"].append(entry)
    save()


def add_orchestrator_log(entry):
    """Add entry to orchestrator log."""
    with _lock:
        get_state()["orchestrator_log"].append(entry)
    save()


# --- Transcripts ---

def add_transcript(persona_id, persona_name):
    """Create a new transcript entry for an interview. Returns the transcript."""
    transcript = {
        "persona_id": persona_id,
        "persona_name": persona_name,
        "status": "running",
        "turns": [],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None
    }
    with _lock:
        get_state()["outputs"]["transcripts"].append(transcript)
    save()
    return transcript


def append_turn(persona_id, role, content):
    """Append a turn to a running transcript. Role is 'interviewer' or 'persona'."""
    with _lock:
        for t in get_state()["outputs"]["transcripts"]:
            if t["persona_id"] == persona_id and t["status"] == "running":
                t["turns"].append({
                    "role": role,
                    "content": content,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                break
        else:
            return None
    save()
    return t


def complete_transcript(persona_id):
    """Mark a transcript as complete."""
    with _lock:
        for t in get_state()["outputs"]["transcripts"]:
            if t["persona_id"] == persona_id and t["status"] == "running":
                t["status"] = "complete"
                t["completed_at"] = datetime.now(timezone.utc).isoformat()
                break
        else:
            return None
    save()
    return t
