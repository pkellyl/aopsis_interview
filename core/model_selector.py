"""Dynamic model selection. Agents request by capability tier, resolved to model IDs."""

import config

TIER_ORDER = ["fast", "balanced", "smart", "reasoning"]

# Hardcoded fallback presets (config.presets overrides these)
_FALLBACK_PRESETS = {
    "test": {
        "fast": "claude-haiku-4-5",
        "balanced": "claude-haiku-4-5",
        "smart": "claude-haiku-4-5",
        "reasoning": "claude-haiku-4-5",
    },
    "dev": {
        "fast": "claude-haiku-4-5",
        "balanced": "claude-haiku-4-5",
        "smart": "claude-sonnet-4-6",
        "reasoning": "claude-sonnet-4-6",
    },
    "production": {
        "fast": "claude-haiku-4-5",
        "balanced": "claude-sonnet-4-6",
        "smart": "claude-opus-4-6",
        "reasoning": "claude-opus-4-6",
    },
}


def resolve(tier=None, agent_type=None):
    """Resolve a capability tier to a model ID, checking agent_overrides first."""
    cfg = config.get()

    # 1. Check per-agent-type override
    overrides = cfg.get("agent_overrides", {})
    if agent_type and agent_type in overrides:
        return overrides[agent_type]

    # 2. Resolve via mode preset (config presets first, then fallback)
    mode = cfg.get("model_mode", "")
    presets = cfg.get("presets", {})
    models = presets.get(mode) or _FALLBACK_PRESETS.get(mode) or cfg.get("models", {})
    tier = tier or cfg.get("default_model_tier", "balanced")
    if tier in models:
        return models[tier]
    return models.get("balanced", "claude-sonnet-4-6")


def suggest_tier(agent_type):
    """Suggest a default model tier based on agent type."""
    suggestions = {
        "orchestrator": "smart",
        "context": "balanced",
        "persona_architect": "smart",
        "interview_designer": "smart",
        "interviewer": "balanced",
        "persona": "fast",
        "quality_reviewer": "smart",
        "synthesis_designer": "smart",
        "synthesis_agent": "balanced",
        "synthesis_refiner": "balanced",
        "visualizer": "smart"
    }
    return suggestions.get(agent_type, "balanced")
