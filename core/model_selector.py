"""Dynamic model selection. Agents request by capability tier, resolved to model IDs."""

import config

TIER_ORDER = ["fast", "balanced", "smart", "reasoning"]


def resolve(tier=None):
    """Resolve a capability tier to a model ID."""
    cfg = config.get()
    models = cfg.get("models", {})
    tier = tier or cfg.get("default_model_tier", "balanced")
    if tier in models:
        return models[tier]
    return models.get("balanced", "claude-sonnet-4-20250514")


def suggest_tier(agent_type):
    """Suggest a default model tier based on agent type."""
    suggestions = {
        "orchestrator": "smart",
        "context": "balanced",
        "persona_architect": "smart",
        "interview_designer": "smart",
        "interviewer": "balanced",
        "persona": "fast",
        "quality_reviewer": "smart"
    }
    return suggestions.get(agent_type, "balanced")
