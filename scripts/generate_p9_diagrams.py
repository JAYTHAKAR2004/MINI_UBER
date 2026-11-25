"""Generate technical architecture, state-machine, and latency charts for P9 report."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.patches as patches
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
DIAGRAM_DIR = ROOT / "reports" / "P9_Diagrams"
RESULTS_PATH = ROOT / "reports" / "P9_experiment_results.json"


def draw_circuit_breaker_diagram() -> Path:
    DIAGRAM_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DIAGRAM_DIR / "circuit_breaker_state_machine.png"

    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=180)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 5.5)
    ax.axis("off")

    ax.text(
        5.5,
        5.15,
        "Circuit Breaker State Machine (Mini-Uber-ETA Redis Cache Protection)",
        ha="center",
        va="center",
        fontsize=13,
        fontweight="bold",
        color="#0f172a",
    )

    def box(cx: float, cy: float, w: float, h: float, title: str, subtitle: str, fc: str, ec: str):
        rect = patches.FancyBboxPatch(
            (cx - w / 2, cy - h / 2),
            w,
            h,
            boxstyle="round,pad=0.12,rounding_size=0.18",
            facecolor=fc,
            edgecolor=ec,
            linewidth=2.2,
        )
        ax.add_patch(rect)
        ax.text(cx, cy + 0.24, title, ha="center", va="center", fontsize=12, fontweight="bold", color=ec)
        ax.text(cx, cy - 0.22, subtitle, ha="center", va="center", fontsize=8.8, color="#334155")

    box(2.0, 2.7, 2.5, 1.35, "CLOSED", "Normal traffic allowed\nfailure_count = 0", "#ecfdf5", "#047857")
    box(9.0, 2.7, 2.5, 1.35, "OPEN", "Fail-fast bypass (ML fallback)\nRejects without calling Redis", "#fef2f2", "#b91c1c")
    box(5.5, 0.95, 2.8, 1.2, "HALF_OPEN", "Recovery test state\nAllows 1 health probe", "#fffbeb", "#b45309")

    # CLOSED -> OPEN
    ax.annotate(
        "",
        xy=(7.65, 2.95),
        xytext=(3.35, 2.95),
        arrowprops=dict(arrowstyle="->,head_width=0.35,head_length=0.45", lw=2.0, color="#b91c1c"),
    )
    ax.text(
        5.5,
        3.35,
        "Consecutive failures >= 3\n(after 3x retry exhaustion per call)",
        ha="center",
        va="bottom",
        fontsize=9,
        color="#991b1b",
        fontweight="bold",
    )

    # OPEN -> HALF_OPEN
    ax.annotate(
        "",
        xy=(6.95, 1.25),
        xytext=(8.85, 2.0),
        arrowprops=dict(arrowstyle="->,head_width=0.32,head_length=0.42", lw=2.0, color="#b45309", connectionstyle="arc3,rad=-0.15"),
    )
    ax.text(
        8.65,
        1.35,
        "recovery_timeout >= 5s",
        ha="center",
        va="center",
        fontsize=9,
        color="#92400e",
        fontweight="bold",
    )

    # HALF_OPEN -> CLOSED
    ax.annotate(
        "",
        xy=(2.15, 2.0),
        xytext=(4.05, 1.25),
        arrowprops=dict(arrowstyle="->,head_width=0.32,head_length=0.42", lw=2.0, color="#047857", connectionstyle="arc3,rad=-0.15"),
    )
    ax.text(
        2.35,
        1.35,
        "Probe succeeds\n(reset failures = 0)",
        ha="center",
        va="center",
        fontsize=9,
        color="#065f46",
        fontweight="bold",
    )

    # HALF_OPEN -> OPEN
    ax.annotate(
        "",
        xy=(7.7, 2.4),
        xytext=(6.6, 1.6),
        arrowprops=dict(arrowstyle="->,head_width=0.3,head_length=0.4", lw=1.8, linestyle="--", color="#dc2626", connectionstyle="arc3,rad=0.18"),
    )
    ax.text(
        6.55,
        2.25,
        "Probe fails",
        ha="center",
        va="center",
        fontsize=8.8,
        color="#b91c1c",
        fontweight="bold",
    )

    fig.tight_layout()
    fig.savefig(out_path, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return out_path


def draw_architecture_diagram() -> Path:
    DIAGRAM_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DIAGRAM_DIR / "fault_tolerance_architecture.png"

    fig, ax = plt.subplots(figsize=(12, 6.2), dpi=180)
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 6.2)
    ax.axis("off")

    ax.text(
        6.0,
        5.85,
        "Mini-Uber-ETA Fault-Tolerant Distributed Architecture (P9)",
        ha="center",
        va="center",
        fontsize=13,
        fontweight="bold",
        color="#0f172a",
    )

    def node(x: float, y: float, w: float, h: float, title: str, desc: str, fc: str, ec: str):
        p = patches.FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0.08,rounding_size=0.14",
            facecolor=fc,
            edgecolor=ec,
            linewidth=1.8,
        )
        ax.add_patch(p)
        ax.text(x + w / 2, y + h * 0.66, title, ha="center", va="center", fontsize=10, fontweight="bold", color=ec)
        ax.text(x + w / 2, y + h * 0.30, desc, ha="center", va="center", fontsize=8.2, color="#334155")

    node(0.3, 2.4, 1.6, 1.2, "Client / Tests", "HTTP POST /predict\nGET /resilience/status", "#eff6ff", "#1d4ed8")
    node(2.4, 2.4, 1.8, 1.2, "Nginx (:8000)", "Round-Robin LB\nmax_fails=2, 10s", "#f0fdf4", "#15803d")
    node(4.7, 2.0, 2.5, 2.0, "FastAPI Replicas", "mini_uber_api1/2/3\nRandom Forest ML\nStructured Logging", "#eef2ff", "#4338ca")

    node(8.0, 4.4, 3.6, 1.15, "Redis Cache (:6379)", "Circuit Breaker (3 fails / 5s)\nRetry (3x: 1s, 2s) | Timeout (1s)\nFallback: BYPASS -> ML Model", "#fef2f2", "#b91c1c")
    node(8.0, 2.5, 3.6, 1.15, "PostgreSQL (:5432)", "Persistent ETA & Orders\nconnect_timeout=5s\npool_pre_ping=True", "#ecfeff", "#0e7490")
    node(8.0, 0.6, 3.6, 1.15, "Redpanda / Kafka (:9092)", "Producer Retry (3x: 1s, 2s)\nDelivery Timeout (5s)\nConsumer Manual ACK Commit", "#fffbeb", "#b45309")

    arrows = [
        ((1.9, 3.0), (2.4, 3.0)),
        ((4.2, 3.0), (4.7, 3.0)),
        ((7.2, 3.5), (8.0, 4.95)),
        ((7.2, 3.0), (8.0, 3.05)),
        ((7.2, 2.4), (8.0, 1.15)),
    ]
    for start, end in arrows:
        ax.annotate(
            "",
            xy=end,
            xytext=start,
            arrowprops=dict(arrowstyle="->,head_width=0.28,head_length=0.35", lw=1.8, color="#475569"),
        )

    fig.tight_layout()
    fig.savefig(out_path, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return out_path


def draw_latency_chart() -> Path | None:
    if not RESULTS_PATH.exists():
        return None
    data = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    by_exp = {e["experiment"]: e for e in data.get("experiments", [])}

    exp1 = by_exp.get(1, {})
    exp8 = by_exp.get(8, {})
    exp9 = by_exp.get(9, {})

    hit_ms = exp1.get("hit_latency_ms", 0)
    miss_ms = exp1.get("miss_latency_ms", 0)

    outage_reqs = exp8.get("failure_phase", {}).get("requests", [])
    closed_retry_lat = [r["latency_ms"] for r in outage_reqs if r.get("circuit_state") == "CLOSED"]
    open_fast_lat = [r["latency_ms"] for r in outage_reqs if r.get("circuit_state") == "OPEN"]
    avg_retry_ms = round(sum(closed_retry_lat) / len(closed_retry_lat), 2) if closed_retry_lat else 0
    avg_open_ms = round(sum(open_fast_lat) / len(open_fast_lat), 2) if open_fast_lat else 0

    kafka_fail_ms = exp9.get("failure_phase", {}).get("latency_ms", 0)

    labels = [
        "Normal\n(Cache HIT)",
        "Normal\n(Cache MISS)",
        "Redis Outage\n(Retry + Timeout)",
        "Redis Outage\n(Circuit OPEN)",
        "Kafka Outage\n(3x Timeout Retry)",
    ]
    values = [hit_ms, miss_ms, avg_retry_ms, avg_open_ms, kafka_fail_ms]
    colors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"]

    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=180)
    bars = ax.bar(labels, values, color=colors, width=0.55, edgecolor="#1e293b", linewidth=1.0)
    ax.set_ylabel("Measured Request Latency (ms)", fontsize=10.5, fontweight="bold")
    ax.set_title("Measured /predict API Latency: Normal vs Failure Conditions", fontsize=12.5, fontweight="bold")
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    ax.set_ylim(0, max(values) * 1.18 if max(values) > 0 else 100)

    for bar, val in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + max(values) * 0.02,
            f"{val:.1f} ms",
            ha="center",
            va="bottom",
            fontsize=9.5,
            fontweight="bold",
            color="#0f172a",
        )

    out_path = DIAGRAM_DIR / "latency_comparison_chart.png"
    fig.tight_layout()
    fig.savefig(out_path, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return out_path


if __name__ == "__main__":
    p1 = draw_circuit_breaker_diagram()
    p2 = draw_architecture_diagram()
    p3 = draw_latency_chart()
    print("Generated diagrams:", p1, p2, p3)

