"""Agent runtime. Provides the 5 capabilities: create, send, log, emit, export."""

import json
import time
import threading
import anthropic
from datetime import datetime, timezone

import config
from core import hub
from core import model_selector

_client = None
_event_callbacks = []
_api_semaphore = None

MAX_RETRIES = 3
RETRY_BACKOFF = [1, 3, 9]


def _get_client():
    """Return Anthropic client, creating if needed."""
    global _client
    if _client is None:
        api_key = config.get_api_key()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


def _get_semaphore():
    """Return API semaphore, creating if needed."""
    global _api_semaphore
    if _api_semaphore is None:
        max_concurrent = config.get().get("max_concurrent_api_calls", 10)
        _api_semaphore = threading.Semaphore(max_concurrent)
    return _api_semaphore


# --- Capability 1: CREATE AGENT ---

def create_agent(agent_id, agent_type, system_prompt, model_tier=None,
                 created_by=None, metadata=None):
    """Register an agent with an ID, system prompt, and initial state."""
    if model_tier is None:
        model_tier = model_selector.suggest_tier(agent_type)
    agent = hub.register_agent(
        agent_id, agent_type, system_prompt, model_tier, created_by, metadata
    )
    emit_event("agent_created", agent_id,
               f"Agent {agent_id} ({agent_type}) created, tier={model_tier}")
    return agent


# --- Capability 2: SEND MESSAGE ---

def send_message(agent_id, message, role="user", use_thinking=False):
    """Send a message to a named agent and return its response."""
    agent = hub.get_agent(agent_id)
    if agent is None:
        raise ValueError(f"Agent {agent_id} not found")

    hub.append_message(agent_id, role, message)
    emit_event("message_sent", agent_id,
               f"Message sent to {agent_id} ({len(message)} chars)")

    # Build API messages (strip timestamps, ensure content is always a string)
    api_messages = []
    for m in agent["messages"]:
        c = m["content"]
        if isinstance(c, list):
            c = "\n".join(block.get("text", str(block)) if isinstance(block, dict) else str(block) for block in c)
        api_messages.append({"role": m["role"], "content": c})

    model = model_selector.resolve(agent["model_tier"], agent_type=agent.get("type"))

    sem = _get_semaphore()
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            with sem:
                client = _get_client()
                api_kwargs = dict(
                    model=model,
                    max_tokens=16384,
                    system=agent["system_prompt"],
                    messages=api_messages
                )
                if use_thinking:
                    api_kwargs["thinking"] = {
                        "type": "enabled",
                        "budget_tokens": 10000
                    }
                response = client.messages.create(**api_kwargs)
            content = "".join(
                    block.text for block in response.content
                    if getattr(block, "type", None) == "text"
                )
            tokens_in = response.usage.input_tokens
            tokens_out = response.usage.output_tokens
            last_error = None
            break
        except (anthropic.RateLimitError, anthropic.APIConnectionError) as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF[attempt]
                emit_event("error_occurred", agent_id,
                           f"API retry {attempt+1}/{MAX_RETRIES} for {agent_id}, waiting {wait}s: {e}")
                time.sleep(wait)
        except Exception as e:
            error_msg = str(e)
            _log_api_call(agent_id, model, agent["system_prompt"],
                          api_messages, None, 0, 0, error=error_msg)
            emit_event("error_occurred", agent_id,
                       f"API error for {agent_id}: {error_msg}")
            raise

    if last_error is not None:
        error_msg = str(last_error)
        _log_api_call(agent_id, model, agent["system_prompt"],
                      api_messages, None, 0, 0, error=error_msg)
        emit_event("error_occurred", agent_id,
                   f"API failed after {MAX_RETRIES} retries for {agent_id}: {error_msg}")
        raise last_error

    hub.append_message(agent_id, "assistant", content)

    _log_api_call(agent_id, model, agent["system_prompt"],
                  api_messages, content, tokens_in, tokens_out)

    emit_event("message_received", agent_id,
               f"Response from {agent_id} ({tokens_out} tokens)")

    return content


# --- Capability 3: LOG ---

def _log_api_call(agent_id, model, system_prompt, messages, response,
                  tokens_in, tokens_out, error=None):
    """Record an API call to the system log."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": agent_id,
        "model": model,
        "system_prompt_length": len(system_prompt),
        "message_count": len(messages),
        "response_length": len(response) if response else 0,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "error": error
    }
    hub.add_system_log(entry)
    return entry


# --- Capability 4: EMIT EVENT ---

def subscribe(callback):
    """Register an event callback."""
    _event_callbacks.append(callback)


def unsubscribe(callback):
    """Remove an event callback."""
    if callback in _event_callbacks:
        _event_callbacks.remove(callback)


def emit_event(event_type, agent_id=None, summary="", data=None):
    """Push a structured event to the hub and all subscribers."""
    event = hub.add_event(event_type, agent_id, summary, data)
    for cb in list(_event_callbacks):
        try:
            cb(event)
        except Exception:
            pass
    return event


# --- Capability 5: EXPORT ---

def export_agent(agent_id):
    """Serialize an agent's full state."""
    agent = hub.get_agent(agent_id)
    if agent is None:
        return None
    return json.loads(json.dumps(agent, default=str))


def export_all():
    """Serialize the entire system state."""
    return json.loads(json.dumps(hub.get_state(), default=str))
