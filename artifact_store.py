"""Artifact storage. Save/list/load pipeline outputs as JSON files in data/artifacts/{stage}/."""

import json
from pathlib import Path
from datetime import datetime, timezone

ARTIFACTS_DIR = Path(__file__).parent / "data" / "artifacts"

STAGES = ("briefs", "personas", "strategies", "transcripts", "syntheses", "visualizations")


def save(stage, data, label=None):
    """Save an artifact for a pipeline stage. Returns the artifact ID."""
    if stage not in STAGES:
        return None
    folder = ARTIFACTS_DIR / stage
    folder.mkdir(parents=True, exist_ok=True)

    artifact_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    # Avoid collisions
    existing = [f.stem for f in folder.glob("*.json")]
    if artifact_id in existing:
        artifact_id += f"_{len(existing)}"

    artifact = {
        "id": artifact_id,
        "label": label or _auto_label(stage, data),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data
    }

    with open(folder / f"{artifact_id}.json", "w") as f:
        json.dump(artifact, f, indent=2, default=str)

    return artifact_id


def list_artifacts(stage):
    """List all artifacts for a stage. Returns list of {id, label, timestamp}."""
    if stage not in STAGES:
        return []
    folder = ARTIFACTS_DIR / stage
    if not folder.exists():
        return []

    artifacts = []
    for path in sorted(folder.glob("*.json"), reverse=True):
        try:
            with open(path) as f:
                meta = json.load(f)
            artifacts.append({
                "id": meta.get("id", path.stem),
                "label": meta.get("label", path.stem),
                "timestamp": meta.get("timestamp", "")
            })
        except (json.JSONDecodeError, IOError):
            continue
    return artifacts


def load(stage, artifact_id):
    """Load an artifact's data by stage and ID. Returns the data dict or None."""
    if stage not in STAGES:
        return None
    path = ARTIFACTS_DIR / stage / f"{artifact_id}.json"
    if not path.exists():
        return None
    try:
        with open(path) as f:
            artifact = json.load(f)
        return artifact.get("data")
    except (json.JSONDecodeError, IOError):
        return None


def _auto_label(stage, data):
    """Generate a short label from artifact content."""
    if stage == "briefs":
        return data.get("research_topic", data.get("context", {}).get("organization_name", "Brief"))[:60]
    if stage == "personas":
        count = len(data.get("personas", []))
        return f"{count} personas"
    if stage == "strategies":
        return "Interview strategy"
    if stage == "transcripts":
        count = len(data) if isinstance(data, list) else 0
        return f"{count} transcripts"
    if stage == "syntheses":
        return data.get("title", "Synthesis")[:60] if isinstance(data, dict) else "Synthesis"
    if stage == "visualizations":
        return f"Visualization ({len(data) // 1024}KB)" if isinstance(data, str) else "Visualization"
    return stage
