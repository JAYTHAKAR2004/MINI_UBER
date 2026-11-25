"""Convert reports/P9_Fault_Tolerance_Report.md into a print-ready PDF via Chrome headless."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[1]
MD_PATH = ROOT / "reports" / "P9_Fault_Tolerance_Report.md"
HTML_PATH = ROOT / "reports" / "P9_Fault_Tolerance_Report.html"
PDF_PATH = ROOT / "reports" / "P9_Fault_Tolerance_Report.pdf"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

CSS_STYLES = """
@page {
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
}
body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1f2937;
    max-width: 960px;
    margin: 0 auto;
}
h1 {
    font-size: 20pt;
    color: #0f172a;
    border-bottom: 2.5px solid #1d4ed8;
    padding-bottom: 6px;
    margin-top: 24px;
    page-break-after: avoid;
}
h2 {
    font-size: 14pt;
    color: #1e3a8a;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
    margin-top: 22px;
    page-break-after: avoid;
}
h3 {
    font-size: 11.5pt;
    color: #1e40af;
    margin-top: 14px;
    page-break-after: avoid;
}
.cover-box {
    border: 2px solid #1e3a8a;
    border-radius: 8px;
    padding: 36px 28px;
    text-align: center;
    background: #f8fafc;
    margin: 24px 0 36px 0;
    page-break-after: always;
}
.cover-box h1 {
    border-bottom: none;
    font-size: 22pt;
    color: #1e3a8a;
    margin-bottom: 8px;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 18px 0;
    font-size: 9.2pt;
    page-break-inside: avoid;
}
th, td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
}
th {
    background-color: #1e3a8a;
    color: #ffffff;
    font-weight: 600;
}
tr:nth-child(even) td {
    background-color: #f8fafc;
}
pre {
    background-color: #0f172a;
    color: #e2e8f0;
    padding: 10px 12px;
    border-radius: 6px;
    font-family: Consolas, "Courier New", monospace;
    font-size: 8.3pt;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    page-break-inside: avoid;
}
code {
    background-color: #f1f5f9;
    color: #0f172a;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: Consolas, "Courier New", monospace;
    font-size: 9pt;
}
pre code {
    background: transparent;
    color: inherit;
    padding: 0;
}
img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10px auto 6px auto;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    page-break-inside: avoid;
}
figure {
    margin: 14px 0 18px 0;
    text-align: center;
    page-break-inside: avoid;
}
figcaption {
    font-size: 9pt;
    color: #475569;
    font-style: italic;
    margin-top: 4px;
}
blockquote {
    border-left: 4px solid #2563eb;
    background: #eff6ff;
    margin: 10px 0;
    padding: 8px 12px;
    color: #1e3a8a;
}
hr {
    border: none;
    border-top: 1px solid #cbd5e1;
    margin: 18px 0;
}
"""


def find_browser() -> str:
    for candidate in CHROME_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
    raise FileNotFoundError("Neither Google Chrome nor Microsoft Edge was found for PDF generation.")


def _resolve_missing_images(md_text: str) -> str:
    """Replace image embeds whose PNG files are not yet captured with clean styled placeholders."""
    import re

    def repl(match: re.Match[str]) -> str:
        alt = match.group(1)
        rel_path = match.group(2)
        target = (ROOT / "reports" / rel_path).resolve()
        if target.exists() and target.stat().st_size > 0:
            return match.group(0)
        return (
            f'\n<div style="border:1.5px dashed #64748b;background:#f8fafc;'
            f'padding:14px 16px;border-radius:6px;margin:10px 0;color:#334155;">'
            f'<strong>[Pending interactive desktop capture: <code>{rel_path}</code>]</strong><br>'
            f'Caption: {alt}<br>'
            f'Run <code>python scripts/capture_p9_screenshots.py {Path(rel_path).name} --rebuild-pdf</code> '
            f'from an interactive Windows PowerShell session to embed the live screenshot.'
            f'</div>\n'
        )

    return re.sub(r"!\[([^\]]*)\]\(([^)]+\.png)\)", repl, md_text)


def build_pdf() -> Path:
    md_text = _resolve_missing_images(MD_PATH.read_text(encoding="utf-8"))
    html_body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "toc"],
    )
    reports_uri = (ROOT / "reports").as_uri()
    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<base href="{reports_uri}/">
<title>P9 – Implementation of Fault Tolerance Mechanisms</title>
<style>{CSS_STYLES}</style>
</head>
<body>
{html_body}
</body>
</html>
"""
    HTML_PATH.write_text(html_doc, encoding="utf-8")

    browser = find_browser()
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        f"--print-to-pdf={PDF_PATH}",
        "--no-pdf-header-footer",
        HTML_PATH.as_uri(),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    if proc.returncode != 0 or not PDF_PATH.exists():
        raise RuntimeError(f"PDF generation failed (rc={proc.returncode}): {proc.stderr}")
    print(f"Generated PDF: {PDF_PATH} ({PDF_PATH.stat().st_size:,} bytes)")
    return PDF_PATH


if __name__ == "__main__":
    build_pdf()

