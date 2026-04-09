"""Config and prompt API routes. Thin wrappers over config module."""

from fastapi import APIRouter, Body, HTTPException

import config

router = APIRouter()


@router.get("/api/config")
def get_config():
    """Return current configuration."""
    return config.get()


@router.put("/api/config")
def update_config(data: dict = Body(...)):
    """Update configuration."""
    return config.update(data)


@router.get("/api/prompts")
def list_prompts():
    """Return list of available prompt names."""
    return config.list_prompts()


@router.get("/api/prompts/{name}")
def get_prompt(name: str):
    """Return prompt content by name."""
    content = config.load_prompt(name)
    if content == "" and name not in config.list_prompts():
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' not found")
    return {"name": name, "content": content}


@router.put("/api/prompts/{name}")
def update_prompt(name: str, data: dict = Body(...)):
    """Write prompt content to disk."""
    content = data.get("content", "")
    if name not in config.list_prompts():
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' not found")
    ok = config.save_prompt(name, content)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to write prompt file")
    return {"name": name, "content": content}
