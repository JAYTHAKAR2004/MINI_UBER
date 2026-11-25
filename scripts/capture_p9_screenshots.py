"""Capture genuine OS window screenshots of real terminal experiments for P9.

Launches a visible PowerShell console window at fixed geometry, executes the real
command, waits for completion via a marker file, captures the foreground console
window rectangle via PIL.ImageGrab, verifies the capture is non-blank, and saves
each PNG into reports/P9_Screenshots/.
"""

from __future__ import annotations

import ctypes
import subprocess
import sys
import tempfile
import time
from ctypes import wintypes
from pathlib import Path

from PIL import ImageGrab, ImageStat

ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT_DIR = ROOT / "reports" / "P9_Screenshots"
VENV_PY = ROOT / ".venv" / "Scripts" / "python.exe"

user32 = ctypes.windll.user32


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]


def _set_window_rect(hwnd: int, x: int = 60, y: int = 40, w: int = 1280, h: int = 800) -> None:
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.MoveWindow(hwnd, x, y, w, h, True)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.45)


def _get_window_rect(hwnd: int) -> tuple[int, int, int, int]:
    rect = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    return (rect.left, rect.top, rect.right, rect.bottom)


def _find_window_by_title_substring(needle: str, timeout: float = 15.0) -> int | None:
    found: list[int] = []
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def callback(hwnd: int, lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if needle in buf.value:
            found.append(hwnd)
            return False
        return True

    deadline = time.time() + timeout
    while time.time() < deadline:
        found.clear()
        user32.EnumWindows(EnumWindowsProc(callback), 0)
        if found:
            return found[0]
        time.sleep(0.2)
    return None


def capture_powershell_command(
    filename: str,
    ps_command: str,
    timeout_sec: int = 120,
    pause_after_finish: float = 1.0,
) -> Path:
    """Run a command inside a visible PowerShell window and capture its real pixels."""
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SCREENSHOT_DIR / filename
    title_tag = f"P9_CAPTURE_{filename}"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        done_marker = tmp_path / "done.txt"
        script_file = tmp_path / "run_capture.ps1"

        script_text = f"""
$Host.UI.RawUI.WindowTitle = '{title_tag}'
try {{
    $Host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(150, 300)
    $Host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(145, 42)
}} catch {{}}
Set-Location '{str(ROOT)}'
Clear-Host
Write-Host "PS Mini-Uber-ETA> " -NoNewline -ForegroundColor Cyan
Write-Host @'
{ps_command.strip()}
'@ -ForegroundColor Yellow
Write-Host ""
{ps_command}
Set-Content -Path '{str(done_marker)}' -Value 'DONE'
Start-Sleep -Seconds 30
"""
        script_file.write_text(script_text, encoding="utf-8")

        proc = subprocess.Popen(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_file),
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        try:
            hwnd = _find_window_by_title_substring(title_tag, timeout=15.0)
            deadline = time.time() + timeout_sec
            while not done_marker.exists():
                if time.time() > deadline:
                    raise TimeoutError(f"Command for {filename} timed out after {timeout_sec}s")
                time.sleep(0.25)

            time.sleep(pause_after_finish)
            if hwnd:
                _set_window_rect(hwnd, 60, 40, 1280, 800)
                bbox = _get_window_rect(hwnd)
                img = ImageGrab.grab(bbox=bbox, all_screens=True)
            else:
                img = ImageGrab.grab(all_screens=False)

            stat = ImageStat.Stat(img.convert("L"))
            mean_l = stat.mean[0]
            std_l = stat.stddev[0]
            if std_l < 3.0:
                raise RuntimeError(
                    f"Captured screenshot {filename} appears blank/uniform "
                    f"(mean={mean_l:.2f}, std={std_l:.2f})."
                )
            img.save(out_path, format="PNG")
            print(
                f"Captured {out_path.name} ({img.size[0]}x{img.size[1]}, "
                f"mean={mean_l:.1f}, std={std_l:.1f})"
            )
            return out_path
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()


def build_capture_jobs() -> list[tuple[str, str]]:
    py = f'& "{VENV_PY}"'
    exp_runner = f'{py} scripts/run_p9_experiments.py'
    return [
        (
            "01_project_structure.png",
            "Get-ChildItem src/resilience, src/api/main.py, src/messaging/kafka_producer.py, "
            "src/kafka/consumer.py, tests/test_fault_tolerance.py | Select-Object Name, Length, LastWriteTime; "
            "Write-Output '--- src/resilience ---'; "
            "Get-ChildItem src/resilience | Select-Object Name, Length",
        ),
        (
            "02_normal_api_operation.png",
            f"{exp_runner} --experiment 1",
        ),
        (
            "03_retry_mechanism.png",
            f"{exp_runner} --experiment 2a",
        ),
        (
            "04_retry_exhaustion.png",
            f"{exp_runner} --experiment 2b",
        ),
        (
            "05_timeout_handling.png",
            f"{exp_runner} --experiment 3",
        ),
        (
            "06_circuit_breaker_closed.png",
            f"{exp_runner} --experiment 4",
        ),
        (
            "07_circuit_breaker_open.png",
            f"{exp_runner} --experiment 5",
        ),
        (
            "08_circuit_breaker_half_open.png",
            f"{exp_runner} --experiment 6",
        ),
        (
            "09_circuit_breaker_recovery.png",
            f"{exp_runner} --experiment 7",
        ),
        (
            "10_redis_failure.png",
            f"{exp_runner} --experiment 8a",
        ),
        (
            "11_redis_recovery.png",
            f"{exp_runner} --experiment 8b",
        ),
        (
            "12_kafka_failure.png",
            f"{exp_runner} --experiment 9a",
        ),
        (
            "13_kafka_recovery.png",
            f"{exp_runner} --experiment 9b",
        ),
        (
            "14_pytest_results.png",
            f"{py} -m pytest -v tests/test_fault_tolerance.py",
        ),
        (
            "15_docker_containers.png",
            "docker compose ps; Write-Output '--- Live Health Check ---'; "
            "Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json",
        ),
    ]


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Capture 15 genuine PowerShell screenshots for P9.")
    parser.add_argument("files", nargs="*", help="Optional subset of screenshot filenames to capture")
    parser.add_argument(
        "--rebuild-pdf",
        action="store_true",
        help="Rebuild reports/P9_Fault_Tolerance_Report.pdf after capturing screenshots",
    )
    args = parser.parse_args()

    only = set(args.files)
    jobs = build_capture_jobs()
    for fname, cmd in jobs:
        if only and fname not in only:
            continue
        capture_powershell_command(fname, cmd)

    if args.rebuild_pdf:
        from build_p9_pdf import build_pdf
        build_pdf()
    else:
        print("\nAll requested screenshots captured in reports/P9_Screenshots/.")
        print("Run `python scripts/build_p9_pdf.py` to embed them into reports/P9_Fault_Tolerance_Report.pdf.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

