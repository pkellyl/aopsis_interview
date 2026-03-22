"""Centralized configuration loader. Reads data/config.json and environment variables."""

import json
import os
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
CONFIG_PATH = DATA_DIR / "config.json"

_config = None


def _defaults():
    """Return default configuration."""
    return {
        "models": {
            "fast": "claude-3-5-haiku-20241022",
            "balanced": "claude-sonnet-4-20250514",
            "smart": "claude-opus-4-20250514",
            "reasoning": "claude-opus-4-20250514"
        },
        "organization": {
            "name": "",
            "industry": "",
            "description": ""
        },
        "max_interview_turns": 15,
        "default_model_tier": "balanced"
    }


def load():
    """Load config from disk."""
    global _config
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                _config = json.load(f)
        except (json.JSONDecodeError, IOError):
            _config = _defaults()
    else:
        _config = _defaults()
        save()
    return _config


def save():
    """Persist current config to disk."""
    DATA_DIR.mkdir(exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(_config, f, indent=2)


def get():
    """Return current config, loading if needed."""
    if _config is None:
        load()
    return _config


def update(data: dict):
    """Merge data into config and save."""
    global _config
    if _config is None:
        load()
    _config.update(data)
    save()
    return _config


def get_api_key():
    """Return Anthropic API key from environment."""
    return os.environ.get("ANTHROPIC_API_KEY", "")


PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name):
    """Load a prompt file from prompts/ directory. Always reads fresh from disk."""
    path = PROMPTS_DIR / f"{name}.md"
    try:
        return path.read_text().strip()
    except (IOError, FileNotFoundError):
        return ""
