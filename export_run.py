"""Export a complete run as styled HTML files in data/runs/{timestamp}/."""

import json
import re
from pathlib import Path
from datetime import datetime, timezone

from core import hub

RUNS_DIR = Path(__file__).parent / "data" / "runs"

_CSS = """
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
h1 { border-bottom: 2px solid #2563eb; padding-bottom: 8px; color: #1e3a5f; }
h2 { color: #2563eb; margin-top: 32px; }
h3 { color: #374151; }
.card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 12px 0; }
.label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
.tag { display: inline-block; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin: 2px; }
blockquote { border-left: 3px solid #2563eb; margin: 12px 0; padding: 8px 16px; background: #f0f9ff; }
pre { background: #f1f5f9; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; } th { background: #f8fafc; }
.meta { color: #6b7280; font-size: 13px; }
@media print { body { margin: 20px; } .card { break-inside: avoid; } }
"""


def _wrap_html(title, body_html, include_mermaid=False):
    """Wrap body content in a styled HTML page."""
    mermaid_script = ""
    if include_mermaid:
        mermaid_script = '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script><script>mermaid.initialize({startOnLoad:true, theme:"default"});</script>'
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{title}</title><style>{_CSS}</style></head>
<body>
<h1>{title}</h1>
{body_html}
{mermaid_script}
</body>
</html>"""


def _esc(text):
    """Escape HTML entities."""
    if text is None:
        return ""
    s = str(text)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _render_value(v, depth=0):
    """Recursively render a value (str, list, dict) as human-readable HTML."""
    if isinstance(v, str):
        return f"<p>{_esc(v)}</p>"
    elif isinstance(v, list):
        items = []
        for item in v:
            if isinstance(item, dict):
                # List of objects — render each as a mini card
                inner = []
                for ik, iv in item.items():
                    label = _esc(ik.replace('_', ' '))
                    if isinstance(iv, str):
                        inner.append(f"<span class='label'>{label}</span>: {_esc(iv)}")
                    elif isinstance(iv, list):
                        inner.append(f"<span class='label'>{label}</span>:{_render_value(iv, depth + 1)}")
                    elif isinstance(iv, dict):
                        inner.append(f"<span class='label'>{label}</span>:{_render_value(iv, depth + 1)}")
                    else:
                        inner.append(f"<span class='label'>{label}</span>: {_esc(str(iv))}")
                items.append(f"<li>{'<br>'.join(inner)}</li>")
            else:
                items.append(f"<li>{_esc(str(item))}</li>")
        return "<ul>" + "\n".join(items) + "</ul>"
    elif isinstance(v, dict):
        parts = []
        for dk, dv in v.items():
            label = _esc(dk.replace('_', ' '))
            parts.append(f"<div style='margin-top:8px'><span class='label'>{label}</span>")
            parts.append(_render_value(dv, depth + 1))
            parts.append("</div>")
        return "\n".join(parts)
    else:
        return f"<p>{_esc(str(v))}</p>"


def _render_section(title, data):
    """Render a brief section as HTML with proper nested structure."""
    if not data:
        return ""
    parts = [f"<h2>{_esc(title)}</h2><div class='card'>"]
    if isinstance(data, dict):
        for k, v in data.items():
            label = _esc(k.replace('_', ' '))
            parts.append(f"<div style='margin-bottom:12px'><span class='label'>{label}</span>")
            parts.append(_render_value(v))
            parts.append("</div>")
    else:
        parts.append(_render_value(data))
    parts.append("</div>")
    return "\n".join(parts)


def export_brief(brief):
    """Generate HTML for the research brief."""
    if not brief:
        return None

    parts = []

    # New 4-part format
    for section_key, section_title in [
        ("context", "Context"),
        ("interview_objectives", "Interview Objectives"),
        ("interview_output_structure", "Interview Output Structure"),
        ("report_objectives", "Report Objectives"),
    ]:
        if brief.get(section_key):
            parts.append(_render_section(section_title, brief[section_key]))

    # Legacy flat format fallback
    if not parts:
        for k, v in brief.items():
            parts.append(_render_section(k.replace('_', ' ').title(), v))

    return _wrap_html("Research Brief", "\n".join(parts))


def export_personas(personas):
    """Generate HTML for persona profiles."""
    if not personas:
        return None

    parts = []
    if personas.get("design_rationale"):
        parts.append(f"<h2>Design Rationale</h2><div class='card'><p>{_esc(personas['design_rationale'])}</p></div>")

    for p in personas.get("personas", []):
        parts.append(f"<h2>{_esc(p.get('name', 'Persona'))}</h2>")
        parts.append("<div class='card'>")
        parts.append(f"<p><span class='label'>Role</span><br>{_esc(p.get('role', ''))}</p>")
        parts.append(f"<p><span class='label'>Department</span><br>{_esc(p.get('department', ''))}</p>")
        parts.append(f"<p><span class='label'>Description</span><br>{_esc(p.get('description', ''))}</p>")
        traits = p.get("traits", [])
        if traits:
            parts.append("<p class='label'>Traits</p>")
            parts.append("".join(f"<span class='tag'>{_esc(t)}</span>" for t in traits))
        parts.append("</div>")

    return _wrap_html("Persona Profiles", "\n".join(parts))


def export_transcripts(transcripts):
    """Generate HTML for interview transcripts."""
    if not transcripts:
        return None

    parts = []
    for t in transcripts:
        name = t.get("persona_name", t.get("persona_id", "Unknown"))
        status = t.get("status", "unknown")
        # Support both 'turns' (hub format) and 'messages' (legacy)
        turns = t.get("turns") or t.get("messages") or []
        parts.append(f"<h2>Interview: {_esc(name)}</h2>")
        parts.append(f"<p class='meta'>Status: {_esc(status)} · Turns: {len(turns)}</p>")

        for msg in turns:
            role = msg.get("role", "")
            content = msg.get("content", "")
            speaker = "Interviewer" if role == "interviewer" else _esc(name)
            bg = "#f0f9ff" if role == "interviewer" else "#f8fafc"
            parts.append(f"<div class='card' style='background:{bg}'><strong>{speaker}</strong><p>{_esc(content)}</p></div>")

    return _wrap_html("Interview Transcripts", "\n".join(parts))


def _inline_md(text):
    """Convert inline markdown (bold, italic, code) in already-escaped text."""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
    return text


def _md_to_html(content):
    """Convert markdown content to HTML, handling code/mermaid blocks."""
    parts = []
    has_mermaid = False
    lines = content.split("\n")
    i = 0
    in_list = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Fenced code block (```lang ... ```)
        if stripped.startswith("```"):
            lang = stripped[3:].strip().lower()
            block_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            block_text = "\n".join(block_lines)

            if in_list:
                parts.append("</ul>")
                in_list = False

            if lang == "mermaid":
                has_mermaid = True
                parts.append(f'<pre class="mermaid">{block_text}</pre>')
            else:
                parts.append(f"<pre><code>{_esc(block_text)}</code></pre>")
            continue

        # Headings
        if stripped.startswith("#### "):
            if in_list: parts.append("</ul>"); in_list = False
            parts.append(f"<h4>{_inline_md(_esc(stripped[5:]))}</h4>")
        elif stripped.startswith("### "):
            if in_list: parts.append("</ul>"); in_list = False
            parts.append(f"<h3>{_inline_md(_esc(stripped[4:]))}</h3>")
        elif stripped.startswith("## "):
            if in_list: parts.append("</ul>"); in_list = False
            parts.append(f"<h2>{_inline_md(_esc(stripped[3:]))}</h2>")
        # List item
        elif stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{_inline_md(_esc(stripped[2:]))}</li>")
        # Blockquote
        elif stripped.startswith("> "):
            if in_list: parts.append("</ul>"); in_list = False
            parts.append(f"<blockquote>{_inline_md(_esc(stripped[2:]))}</blockquote>")
        # Blank line
        elif not stripped:
            if in_list: parts.append("</ul>"); in_list = False
        # Regular paragraph
        else:
            if in_list: parts.append("</ul>"); in_list = False
            parts.append(f"<p>{_inline_md(_esc(stripped))}</p>")

        i += 1

    if in_list:
        parts.append("</ul>")

    return "\n".join(parts), has_mermaid


def export_synthesis(synthesis):
    """Generate HTML for the synthesis report."""
    if not synthesis:
        return None

    parts = []
    has_mermaid = False
    title = synthesis.get("title", "Interview Synthesis")

    summary = synthesis.get("executive_summary") or synthesis.get("management_summary") or ""
    if summary:
        summary_html, sm = _md_to_html(summary)
        has_mermaid = has_mermaid or sm
        parts.append(f"<h2>Executive Summary</h2><div class='card' style='background:#eff6ff;border-color:#bfdbfe'>{summary_html}</div>")

    for section in synthesis.get("sections", []):
        heading = section.get("heading", "Section")
        content = section.get("content", "")
        parts.append(f"<h2>{_esc(heading)}</h2>")
        section_html, sm = _md_to_html(content)
        has_mermaid = has_mermaid or sm
        parts.append(section_html)

    return _wrap_html(title, "\n".join(parts), include_mermaid=has_mermaid)


def export_conversation(agents):
    """Generate HTML for the briefing conversation."""
    context = agents.get("context") if agents else None
    if not context:
        return None
    messages = context.get("messages", [])
    if not messages:
        return None

    parts = []
    parts.append("<p class='meta'>Briefing conversation between user and context agent</p>")

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        # Strip [BRIEF_COMPLETE] signal and JSON blob from display
        if role == "assistant" and "[BRIEF_COMPLETE]" in content:
            content = content.split("[BRIEF_COMPLETE]")[0].strip()
            if not content:
                content = "(Brief generated — see Research Brief)"
        speaker = "You" if role == "user" else "Context Agent"
        bg = "#eff6ff" if role == "user" else "#f8fafc"
        align = "margin-left:40px" if role == "user" else "margin-right:40px"
        parts.append(
            f"<div class='card' style='background:{bg};{align}'>"
            f"<strong>{speaker}</strong>"
            f"<p>{_esc(content)}</p></div>"
        )

    return _wrap_html("Briefing Conversation", "\n".join(parts))


def generate():
    """Generate a complete run export folder. Returns the folder path."""
    outputs = hub.get_outputs()
    state = hub.get_state()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    folder = RUNS_DIR / timestamp
    folder.mkdir(parents=True, exist_ok=True)

    files_written = []

    conversation_html = export_conversation(state.get("agents"))
    if conversation_html:
        (folder / "00_conversation.html").write_text(conversation_html)
        files_written.append("00_conversation.html")

    brief_html = export_brief(outputs.get("brief"))
    if brief_html:
        (folder / "01_research_brief.html").write_text(brief_html)
        files_written.append("01_research_brief.html")

    personas_html = export_personas(outputs.get("personas"))
    if personas_html:
        (folder / "02_personas.html").write_text(personas_html)
        files_written.append("02_personas.html")

    transcripts_html = export_transcripts(outputs.get("transcripts"))
    if transcripts_html:
        (folder / "03_interviews.html").write_text(transcripts_html)
        files_written.append("03_interviews.html")

    synthesis_html = export_synthesis(outputs.get("synthesis"))
    if synthesis_html:
        (folder / "04_synthesis_report.html").write_text(synthesis_html)
        files_written.append("04_synthesis_report.html")

    viz = outputs.get("visualization")
    if viz:
        (folder / "05_visualization.html").write_text(viz)
        files_written.append("05_visualization.html")

    return {"folder": str(folder), "files": files_written}
