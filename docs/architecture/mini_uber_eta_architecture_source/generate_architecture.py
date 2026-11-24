"""
Mini-Uber-ETA | 30-Second Distributed Architecture Animation Generator

Generates:
  1. docs/architecture/mini_uber_eta_architecture.gif (1920x1080, 30.00s, 300 frames @ 100ms, loop=0)
  2. docs/architecture/mini_uber_eta_architecture.png (1920x1080 crisp final static architecture diagram)

Dependencies: Pillow (PIL)
Run from repository root:
  python docs/architecture/mini_uber_eta_architecture_source/generate_architecture.py
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Output Paths & Video Timing Constants
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT_DIR / "docs" / "architecture"
GIF_PATH = OUT_DIR / "mini_uber_eta_architecture.gif"
PNG_PATH = OUT_DIR / "mini_uber_eta_architecture.png"

WIDTH = 1920
HEIGHT = 1080
FPS = 10
DURATION_SEC = 30
TOTAL_FRAMES = FPS * DURATION_SEC  # 300 frames -> exact 30,000 ms
FRAME_DURATION_MS = 100

# ---------------------------------------------------------------------------
# Color Palette (Consistent Layer Colors on Dark Navy Canvas)
# ---------------------------------------------------------------------------
BG_DARK = (11, 17, 32)         # #0B1120
GRID_LINE = (20, 31, 56)       # #141F38
CARD_BG = (18, 29, 53)         # #121D35
CARD_BG_ALT = (23, 36, 65)     # #172441
CARD_BORDER = (46, 65, 104)    # #2E4168
TEXT_PRIMARY = (241, 245, 249) # #F1F5F9
TEXT_MUTED = (148, 163, 184)   # #94A3B8
TEXT_DIM = (100, 116, 139)     # #64748B

C_CLIENT = (56, 189, 248)      # Sky Cyan
C_NGINX = (16, 185, 129)       # Emerald
C_API = (129, 140, 248)        # Indigo
C_APP = (192, 132, 252)        # Purple
C_REDIS = (251, 113, 133)      # Rose
C_PG = (96, 165, 250)          # Royal Blue
C_KAFKA = (251, 191, 36)       # Amber
C_RETURN = (45, 212, 191)      # Bright Mint
C_ALERT = (248, 113, 113)      # Soft Coral Red (Circuit OPEN callout)

SCENES = [
    (1, 0.0, 4.0, "Scene 1 · Client Request", C_CLIENT),
    (2, 4.0, 8.0, "Scene 2 · Round-Robin LB", C_NGINX),
    (3, 8.0, 14.0, "Scene 3 · Cache & ML ETA", C_APP),
    (4, 14.0, 21.0, "Scene 4 · Postgres & Kafka", C_KAFKA),
    (5, 21.0, 25.0, "Scene 5 · Fault Tolerance", C_REDIS),
    (6, 25.0, 30.0, "Scene 6 · Client Response", C_RETURN),
]

# ---------------------------------------------------------------------------
# Font Loading
# ---------------------------------------------------------------------------
def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


FONT_SANS_BOLD = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
FONT_SANS_REG = [
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
FONT_MONO_BOLD = [
    r"C:\Windows\Fonts\consolab.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
]
FONT_MONO_REG = [
    r"C:\Windows\Fonts\consola.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]

F_TITLE = load_font(FONT_SANS_BOLD, 25)
F_SUBTITLE = load_font(FONT_SANS_REG, 14)
F_LAYER_TAG = load_font(FONT_MONO_BOLD, 12)
F_CARD_TITLE = load_font(FONT_SANS_BOLD, 17)
F_CARD_SUB = load_font(FONT_SANS_REG, 13)
F_SMALL_BOLD = load_font(FONT_SANS_BOLD, 13)
F_SMALL = load_font(FONT_SANS_REG, 12)
F_MONO_SM = load_font(FONT_MONO_BOLD, 13)
F_MONO_XS = load_font(FONT_MONO_REG, 12)
F_PANEL_TITLE = load_font(FONT_SANS_BOLD, 19)
F_PANEL_BODY = load_font(FONT_SANS_REG, 14)


# ---------------------------------------------------------------------------
# Geometry & Drawing Helpers
# ---------------------------------------------------------------------------
def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


def draw_rounded_card(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    accent: tuple[int, int, int],
    active: float = 0.0,
    radius: int = 14,
    fill_override: tuple[int, int, int] | None = None,
) -> None:
    x1, y1, x2, y2 = box
    if active > 0.05:
        glow_col = mix(BG_DARK, accent, 0.35 * active)
        draw.rounded_rectangle(
            (x1 - 3, y1 - 3, x2 + 3, y2 + 3),
            radius=radius + 3,
            outline=glow_col,
            width=3,
        )
    fill = fill_override or mix(CARD_BG, accent, 0.14 * active)
    border = mix(CARD_BORDER, accent, 0.85 * active if active > 0.05 else 0.25)
    border_w = 3 if active > 0.4 else 2
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=border, width=border_w)
    # Left or top subtle accent bar
    draw.rounded_rectangle(
        (x1 + 10, y1 + 8, x1 + 14, y2 - 8),
        radius=2,
        fill=mix(border, accent, 0.65 + 0.35 * active),
    )


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int],
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2 - 1), text, font=font, fill=fill)


def draw_pill(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    accent: tuple[int, int, int],
    filled: bool = False,
    font: ImageFont.ImageFont = F_MONO_XS,
    pad_x: int = 10,
    pad_y: int = 5,
) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    w = tw + pad_x * 2
    h = th + pad_y * 2
    bg = mix(BG_DARK, accent, 0.28 if filled else 0.14)
    outline = accent if filled else mix(CARD_BORDER, accent, 0.5)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=bg, outline=outline, width=1)
    draw.text(
        (x + pad_x, y + pad_y - 1),
        text,
        font=font,
        fill=TEXT_PRIMARY if filled else accent,
    )
    return w


def polyline_length(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(points) - 1):
        dx = points[i + 1][0] - points[i][0]
        dy = points[i + 1][1] - points[i][1]
        total += math.hypot(dx, dy)
    return total


def point_along_polyline(points: list[tuple[float, float]], t: float) -> tuple[float, float]:
    t = max(0.0, min(1.0, t))
    total = polyline_length(points)
    if total <= 0:
        return points[0]
    target = total * t
    acc = 0.0
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        seg = math.hypot(x2 - x1, y2 - y1)
        if acc + seg >= target and seg > 0:
            local = (target - acc) / seg
            return (x1 + (x2 - x1) * local, y1 + (y2 - y1) * local)
        acc += seg
    return points[-1]


def draw_arrowhead(
    draw: ImageDraw.ImageDraw,
    p_prev: tuple[float, float],
    p_tip: tuple[float, float],
    color: tuple[int, int, int],
    size: int = 9,
) -> None:
    dx = p_tip[0] - p_prev[0]
    dy = p_tip[1] - p_prev[1]
    length = math.hypot(dx, dy)
    if length < 1e-3:
        return
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    base_x = p_tip[0] - ux * size
    base_y = p_tip[1] - uy * size
    p2 = (base_x + px * (size * 0.55), base_y + py * (size * 0.55))
    p3 = (base_x - px * (size * 0.55), base_y - py * (size * 0.55))
    draw.polygon([p_tip, p2, p3], fill=color)


def draw_dashed_segment(
    draw: ImageDraw.ImageDraw,
    p1: tuple[float, float],
    p2: tuple[float, float],
    color: tuple[int, int, int],
    width: int = 3,
    dash_len: float = 10.0,
    gap_len: float = 7.0,
    phase: float = 0.0,
) -> None:
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    dist = math.hypot(dx, dy)
    if dist < 1:
        return
    ux, uy = dx / dist, dy / dist
    step = dash_len + gap_len
    pos = -(phase % step)
    while pos < dist:
        start = max(0.0, pos)
        end = min(dist, pos + dash_len)
        if end > start:
            draw.line(
                [(p1[0] + ux * start, p1[1] + uy * start), (p1[0] + ux * end, p1[1] + uy * end)],
                fill=color,
                width=width,
            )
        pos += step


def draw_connector(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    color: tuple[int, int, int],
    active: float = 0.0,
    dashed: bool = False,
    packet_phases: Iterable[float] = (),
    dash_phase: float = 0.0,
) -> None:
    line_col = mix((58, 76, 114), color, 0.35 + 0.65 * active)
    width = 3 if active > 0.35 else 2

    if active > 0.45:
        glow = mix(BG_DARK, color, 0.4 * active)
        for i in range(len(points) - 1):
            draw.line([points[i], points[i + 1]], fill=glow, width=7)

    for i in range(len(points) - 1):
        if dashed:
            draw_dashed_segment(draw, points[i], points[i + 1], line_col, width=width, phase=dash_phase)
        else:
            draw.line([points[i], points[i + 1]], fill=line_col, width=width)

    draw_arrowhead(draw, points[-2], points[-1], line_col, size=9)

    for phase in packet_phases:
        if 0.0 <= phase <= 1.0:
            px, py = point_along_polyline(points, phase)
            draw.ellipse((px - 8, py - 8, px + 8, py + 8), fill=mix(BG_DARK, color, 0.55))
            draw.ellipse((px - 5, py - 5, px + 5, py + 5), fill=color)
            draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=(255, 255, 255))


def create_static_background() -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_DARK)
    draw = ImageDraw.Draw(img)
    for x in range(0, WIDTH, 48):
        draw.line([(x, 0), (x, HEIGHT)], fill=GRID_LINE, width=1)
    for y in range(0, HEIGHT, 48):
        draw.line([(0, y), (WIDTH, y)], fill=GRID_LINE, width=1)
    # Top header bar & divider
    draw.rectangle((0, 0, WIDTH, 78), fill=(13, 21, 38))
    draw.line([(0, 78), (WIDTH, 78)], fill=CARD_BORDER, width=2)
    return img


BASE_BG = create_static_background()


def scene_window(t: float, start: float, end: float, fade: float = 0.35) -> float:
    if t < start or t > end:
        return 0.0
    in_f = min(1.0, (t - start) / fade)
    out_f = min(1.0, (end - t) / fade)
    return min(in_f, out_f)


def pulse_packets(t: float, start: float, end: float, speed: float = 0.85, count: int = 2) -> list[float]:
    if t < start or t > end:
        return []
    out = []
    for k in range(count):
        p = ((t - start) * speed + k / count) % 1.0
        out.append(p)
    return out


# ---------------------------------------------------------------------------
# Frame Renderer
# ---------------------------------------------------------------------------
def render_frame(frame_idx: int) -> Image.Image:
    t = frame_idx / FPS  # 0.0 .. 29.9s
    img = BASE_BG.copy()
    draw = ImageDraw.Draw(img)

    # Determine active scene (1..6)
    current_scene = SCENES[-1]
    for s in SCENES:
        if s[1] <= t < s[2]:
            current_scene = s
            break
    scene_num, s_start, s_end, s_name, s_color = current_scene

    # Scene activation intensities (Scene 6 illuminates complete overview cleanly)
    is_final_overview = scene_num == 6
    a_s1 = max(scene_window(t, 0.0, 4.0), 0.75 if is_final_overview else 0.25)
    a_s2 = max(scene_window(t, 4.0, 8.0), 0.75 if is_final_overview else 0.15)
    a_s3 = max(scene_window(t, 8.0, 14.0), 0.75 if is_final_overview else 0.15)
    a_s4 = max(scene_window(t, 14.0, 21.0), 0.75 if is_final_overview else 0.15)
    a_s5 = max(scene_window(t, 21.0, 25.0), 0.65 if is_final_overview else 0.15)
    a_s6 = scene_window(t, 25.0, 30.0)

    # -----------------------------------------------------------------------
    # 1. Top Header
    # -----------------------------------------------------------------------
    draw.text(
        (44, 13),
        "Mini-Uber-ETA | Distributed Real-Time Food Delivery ETA Prediction System",
        font=F_TITLE,
        fill=TEXT_PRIMARY,
    )
    draw.text(
        (44, 46),
        "End-to-End Request Lifecycle: React Frontend  ->  Nginx LB  ->  FastAPI (3x)  ->  Random Forest / Redis / PostgreSQL / Redpanda",
        font=F_SUBTITLE,
        fill=TEXT_MUTED,
    )

    # Top Legend Pills
    lx = 1072
    lx += draw_pill(draw, lx, 22, "Sync HTTP / Cache / DB", C_CLIENT, filled=False) + 8
    lx += draw_pill(draw, lx, 22, "Async Kafka Event", C_KAFKA, filled=False) + 8
    draw_pill(draw, lx, 22, "Return Path", C_RETURN, filled=False)

    # Active Scene Header Pill
    draw_pill(draw, 1624, 22, f"STAGE {scene_num}/6 · {t:04.1f}s / 30.0s", s_color, filled=True, font=F_MONO_SM)

    # -----------------------------------------------------------------------
    # 2. Layer Boxes (Left Main Architecture Canvas: x = 44 .. 1356)
    # -----------------------------------------------------------------------

    # --- ROW 1: CLIENT LAYER (y: 94..184) ---
    draw.text((48, 82), "CLIENT LAYER", font=F_LAYER_TAG, fill=C_CLIENT)
    box_browser = (48, 100, 412, 184)
    box_react = (462, 100, 868, 184)
    box_req = (918, 100, 1346, 184)

    draw_rounded_card(draw, box_browser, C_CLIENT, active=a_s1 if scene_num != 6 else 0.9)
    draw.text((70, 114), "Customer Browser", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((70, 144), "Zomato-Inspired Ordering & Tracking UI", font=F_CARD_SUB, fill=TEXT_MUTED)

    draw_rounded_card(draw, box_react, C_CLIENT, active=a_s1 if scene_num != 6 else 0.9)
    draw.text((484, 114), "React.js Frontend", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((484, 144), "Vite SPA · Axios Client · Leaflet Maps", font=F_CARD_SUB, fill=TEXT_MUTED)

    draw_rounded_card(draw, box_req, C_CLIENT, active=a_s1)
    draw.text((940, 114), "ETA Prediction Request", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((940, 144), "POST /predict  (17 Delivery Features JSON)", font=F_MONO_XS, fill=C_CLIENT)

    p_c1 = pulse_packets(t, 0.0, 2.2, speed=0.95, count=2)
    p_c2 = pulse_packets(t, 1.0, 3.8, speed=0.95, count=2)
    draw_connector(draw, [(412, 142), (462, 142)], C_CLIENT, active=a_s1, packet_phases=p_c1)
    draw_connector(draw, [(868, 142), (918, 142)], C_CLIENT, active=a_s1, packet_phases=p_c2)

    # --- ROW 2: LOAD BALANCING LAYER (y: 222..304) ---
    draw.text((48, 204), "LOAD BALANCING LAYER", font=F_LAYER_TAG, fill=C_NGINX)
    box_nginx = (230, 222, 1164, 304)
    draw_rounded_card(draw, box_nginx, C_NGINX, active=a_s2)
    draw.text((254, 236), "Nginx Load Balancer", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((254, 266), "Reverse Proxy (:8000 -> :80) · Round-Robin Routing across FastAPI Replicas", font=F_CARD_SUB, fill=TEXT_MUTED)
    draw_pill(draw, 956, 246, "ROUND-ROBIN ACTIVE", C_NGINX, filled=(scene_num == 2))

    # Downward arrow from Client Request to Nginx
    p_c_lb = pulse_packets(t, 2.4, 5.2, speed=0.95, count=2)
    draw_connector(draw, [(1132, 184), (1132, 222)], C_CLIENT, active=max(a_s1, a_s2), packet_phases=p_c_lb)

    # --- ROW 3: API LAYER (y: 346..430) ---
    draw.text((48, 324), "API LAYER (3 REPLICAS)", font=F_LAYER_TAG, fill=C_API)
    box_api1 = (48, 346, 444, 430)
    box_api2 = (494, 346, 900, 430)
    box_api3 = (950, 346, 1346, 430)

    # In Scene 2 animate cycling highlight API1 -> API2 -> API3 then lock on API2
    if scene_num == 2:
        phase_rr = (t - 4.0) / 4.0
        if phase_rr < 0.30:
            rr_idx = 1
        elif phase_rr < 0.60:
            rr_idx = 3
        else:
            rr_idx = 2
    elif scene_num in (3, 4, 5):
        rr_idx = 2
    else:
        rr_idx = 0  # idle or overview all highlighted

    a_api1 = 0.95 if (rr_idx == 1 or is_final_overview) else 0.25
    a_api2 = 0.95 if (rr_idx == 2 or is_final_overview) else 0.25
    a_api3 = 0.95 if (rr_idx == 3 or is_final_overview) else 0.25

    for box, title, sub, act, selected in [
        (box_api1, "FastAPI Instance 1", "Container: mini_uber_api1 · Uvicorn :8000", a_api1, rr_idx == 1),
        (box_api2, "FastAPI Instance 2", "Container: mini_uber_api2 · Uvicorn :8000", a_api2, rr_idx == 2),
        (box_api3, "FastAPI Instance 3", "Container: mini_uber_api3 · Uvicorn :8000", a_api3, rr_idx == 3),
    ]:
        draw_rounded_card(draw, box, C_API, active=act)
        draw.text((box[0] + 22, box[1] + 15), title, font=F_CARD_TITLE, fill=TEXT_PRIMARY)
        draw.text((box[0] + 22, box[1] + 45), sub, font=F_CARD_SUB, fill=TEXT_MUTED)
        if selected and scene_num in (2, 3, 4):
            draw_pill(draw, box[2] - 112, box[1] + 14, "SELECTED", C_NGINX, filled=True)

    # Fan-out arrows Nginx -> 3 APIs (no crossing)
    draw_connector(
        draw,
        [(440, 304), (440, 325), (246, 325), (246, 346)],
        C_NGINX,
        active=a_api1,
        packet_phases=pulse_packets(t, 4.2, 5.4, speed=1.1, count=1),
    )
    draw_connector(
        draw,
        [(697, 304), (697, 346)],
        C_NGINX,
        active=a_api2,
        packet_phases=pulse_packets(t, 5.8, 8.2, speed=1.0, count=2),
    )
    draw_connector(
        draw,
        [(954, 304), (954, 325), (1148, 325), (1148, 346)],
        C_NGINX,
        active=a_api3,
        packet_phases=pulse_packets(t, 4.9, 6.2, speed=1.1, count=1),
    )

    # --- ROW 4: APPLICATION & ML PROCESSING LAYER (y: 470..594) ---
    draw.text((48, 450), "APPLICATION & ML PROCESSING LAYER (INSIDE FASTAPI APPLICATION)", font=F_LAYER_TAG, fill=C_APP)
    app_outer = (48, 470, 1346, 594)
    draw_rounded_card(draw, app_outer, C_APP, active=max(a_s3, a_s5) * 0.65, radius=16, fill_override=(15, 24, 46))

    sub_cards = [
        ((66, 490, 294, 578), "REST API", "POST /predict · /health", C_API, max(a_s3, a_s6)),
        ((312, 490, 540, 578), "GraphQL API", "POST /graphql (Strawberry)", C_API, 0.35 if not is_final_overview else 0.75),
        ((558, 490, 816, 578), "ETA Prediction Service", "Schema & Cache Lookup", C_APP, max(a_s3, a_s4)),
        ((834, 490, 1086, 578), "Random Forest Model", "eta_model.joblib Inference", C_APP, a_s3),
        ((1104, 490, 1328, 578), "Circuit Breaker & Retry", "CLOSED / OPEN / HALF_OPEN", C_REDIS if scene_num == 5 else C_APP, max(a_s3 * 0.7, a_s5)),
    ]
    for sbox, stitle, ssub, scol, sact in sub_cards:
        draw_rounded_card(draw, sbox, scol, active=sact, radius=10, fill_override=(21, 33, 60))
        draw.text((sbox[0] + 18, sbox[1] + 16), stitle, font=F_CARD_TITLE, fill=TEXT_PRIMARY)
        draw.text((sbox[0] + 18, sbox[1] + 46), ssub, font=F_SMALL, fill=TEXT_MUTED)

    # Arrow from Selected API2 into Application Layer
    draw_connector(
        draw,
        [(697, 430), (697, 470)],
        C_API,
        active=max(a_s2, a_s3),
        packet_phases=pulse_packets(t, 7.2, 9.6, speed=1.1, count=1),
    )

    # --- ROW 5: DATA & PRODUCER LAYER (y: 638..754) ---
    draw.text((48, 616), "DATA, CACHING & EVENT PRODUCER LAYER", font=F_LAYER_TAG, fill=C_PG)
    box_redis = (48, 638, 444, 754)
    box_pg = (494, 638, 900, 754)
    box_prod = (950, 638, 1346, 754)

    draw_rounded_card(draw, box_redis, C_REDIS, active=max(a_s3, a_s5))
    draw.text((70, 652), "Redis Cache", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((70, 681), "SHA-256 Keys · TTL 300s · 1s Timeout", font=F_CARD_SUB, fill=TEXT_MUTED)
    draw.text((70, 707), "Cache HIT / MISS / BYPASS (Circuit Guarded)", font=F_SMALL_BOLD, fill=C_REDIS)

    draw_rounded_card(draw, box_pg, C_PG, active=a_s4)
    draw.text((516, 652), "PostgreSQL Database", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((516, 681), "Persistent Storage (eta_predictions table)", font=F_CARD_SUB, fill=TEXT_MUTED)
    draw.text((516, 707), "Database Sharding & Replication Architecture", font=F_SMALL_BOLD, fill=C_PG)

    draw_rounded_card(draw, box_prod, C_KAFKA, active=a_s4)
    draw.text((972, 652), "Kafka Producer", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((972, 681), "src/messaging/kafka_producer.py", font=F_MONO_XS, fill=TEXT_MUTED)
    draw.text((972, 707), "5000ms Delivery Timeout · Callback Check", font=F_SMALL_BOLD, fill=C_KAFKA)

    # Application Layer -> Redis (Scene 3), PostgreSQL (Scene 4), Kafka Producer (Scene 4)
    draw_connector(
        draw,
        [(246, 594), (246, 638)],
        C_REDIS,
        active=max(a_s3, a_s5),
        packet_phases=pulse_packets(t, 8.2, 11.2, speed=1.0, count=2),
    )
    draw_connector(
        draw,
        [(697, 594), (697, 638)],
        C_PG,
        active=a_s4,
        packet_phases=pulse_packets(t, 14.2, 17.0, speed=0.95, count=2),
    )
    draw_connector(
        draw,
        [(1148, 594), (1148, 638)],
        C_KAFKA,
        active=a_s4,
        dashed=True,
        dash_phase=t * 28.0,
        packet_phases=pulse_packets(t, 15.8, 18.6, speed=0.95, count=2),
    )

    # --- ROW 6: MESSAGING LAYER (y: 804..916) ---
    draw.text((48, 780), "MESSAGING LAYER (ASYNC)", font=F_LAYER_TAG, fill=C_KAFKA)
    box_redpanda = (48, 804, 444, 916)
    box_topic = (494, 804, 900, 916)
    box_consumer = (950, 804, 1346, 916)

    draw_rounded_card(draw, box_redpanda, C_KAFKA, active=a_s4)
    draw.text((70, 818), "Redpanda Broker", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((70, 847), "Kafka-Compatible Event Broker", font=F_CARD_SUB, fill=TEXT_MUTED)
    draw.text((70, 873), "Internal :9092 · External :19092", font=F_MONO_XS, fill=C_KAFKA)

    draw_rounded_card(draw, box_topic, C_KAFKA, active=a_s4)
    draw.text((516, 818), "Topic: eta-predictions", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((516, 847), "Event: ETA_PREDICTION_CREATED", font=F_MONO_XS, fill=TEXT_MUTED)
    draw.text((516, 873), "Prediction ID · Features · ETA Payload", font=F_SMALL_BOLD, fill=C_KAFKA)

    draw_rounded_card(draw, box_consumer, C_KAFKA, active=max(a_s4, a_s5 * 0.85))
    draw.text((972, 818), "Kafka Consumer", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
    draw.text((972, 847), "Group: eta-analytics-consumer", font=F_MONO_XS, fill=TEXT_MUTED)
    draw.text((972, 873), "3 Retries (1s, 2s Backoff) · Manual Commit", font=F_SMALL_BOLD, fill=C_KAFKA)

    # Non-crossing corridor between Row 5 (y=754) and Row 6 (y=804):
    # Kafka Producer (1148, 754) -> (1148, 774) -> (246, 774) -> Redpanda (246, 804)
    draw_connector(
        draw,
        [(1148, 754), (1148, 774), (246, 774), (246, 804)],
        C_KAFKA,
        active=a_s4,
        dashed=True,
        dash_phase=t * 28.0,
        packet_phases=pulse_packets(t, 17.0, 19.8, speed=0.85, count=2),
    )
    # Redpanda -> Topic -> Kafka Consumer
    draw_connector(
        draw,
        [(444, 860), (494, 860)],
        C_KAFKA,
        active=a_s4,
        dashed=True,
        dash_phase=t * 28.0,
        packet_phases=pulse_packets(t, 18.2, 20.6, speed=1.1, count=1),
    )
    draw_connector(
        draw,
        [(900, 860), (950, 860)],
        C_KAFKA,
        active=max(a_s4, a_s5 * 0.7),
        dashed=True,
        dash_phase=t * 28.0,
        packet_phases=pulse_packets(t, 19.0, 21.4, speed=1.1, count=1),
    )

    # -----------------------------------------------------------------------
    # 3. Dedicated Return Response Highway (x = 1398, zero crossing!)
    #    FastAPI App/API -> x=1398 -> Nginx (tap at y=263) -> Client (y=142)
    # -----------------------------------------------------------------------
    ret_act = max(a_s6, 0.7 if is_final_overview else 0.15)
    draw_connector(
        draw,
        [(1346, 532), (1398, 532), (1398, 263), (1164, 263)],
        C_RETURN,
        active=ret_act,
        packet_phases=pulse_packets(t, 25.0, 28.0, speed=0.95, count=2),
    )
    draw_connector(
        draw,
        [(1398, 263), (1398, 142), (1346, 142)],
        C_RETURN,
        active=ret_act,
        packet_phases=pulse_packets(t, 26.2, 29.6, speed=0.95, count=2),
    )
    draw.text((1368, 392), "200", font=F_MONO_XS, fill=mix(TEXT_DIM, C_RETURN, ret_act))
    draw.text((1368, 408), "OK", font=F_MONO_XS, fill=mix(TEXT_DIM, C_RETURN, ret_act))

    # -----------------------------------------------------------------------
    # 4. Right Inspector Sidebar (x = 1446 .. 1876)
    # -----------------------------------------------------------------------
    # Top Dynamic Scene Callout Panel (y: 100..520)
    insp_box = (1446, 100, 1876, 524)
    draw_rounded_card(draw, insp_box, s_color, active=0.85, radius=16, fill_override=(16, 26, 49))
    draw.text((1468, 118), s_name.upper(), font=F_MONO_SM, fill=s_color)
    draw.line([(1468, 144), (1854, 144)], fill=CARD_BORDER, width=1)

    if scene_num == 1:
        draw.text((1468, 160), "Client Initiates Request", font=F_PANEL_TITLE, fill=TEXT_PRIMARY)
        lines = [
            "1. Customer orders food in React UI.",
            "2. Frontend calculates Haversine km.",
            "3. Sends HTTP POST /predict with 17",
            "   delivery, route & weather features.",
        ]
        for idx, line in enumerate(lines):
            draw.text((1468, 198 + idx * 24), line, font=F_PANEL_BODY, fill=TEXT_MUTED)
        draw.rounded_rectangle((1468, 314, 1854, 494), radius=12, fill=(11, 18, 34), outline=C_CLIENT, width=1)
        draw.text((1484, 326), "POST /predict  (Payload Preview)", font=F_MONO_SM, fill=C_CLIENT)
        json_lines = [
            "{",
            '  "distance_km": 5.28,',
            '  "Road_traffic_density": "Medium",',
            '  "Weather_conditions": "Cloudy",',
            '  "Type_of_vehicle": "motorcycle",',
            '  "City": "Metropolitian"',
            "}",
        ]
        for idx, jl in enumerate(json_lines):
            draw.text((1484, 352 + idx * 19), jl, font=F_MONO_XS, fill=TEXT_PRIMARY)

    elif scene_num == 2:
        draw.text((1468, 160), "Nginx Round-Robin Routing", font=F_PANEL_TITLE, fill=TEXT_PRIMARY)
        lines = [
            "Nginx listens on port 8000 and rotates",
            "incoming traffic across 3 Uvicorn",
            "FastAPI workers in equal order:",
            "  api1  ->  api2  ->  api3",
        ]
        for idx, line in enumerate(lines):
            draw.text((1468, 198 + idx * 24), line, font=F_PANEL_BODY, fill=TEXT_MUTED)

        for idx, label in enumerate(["FastAPI Instance 1 (api1)", "FastAPI Instance 2 (api2)", "FastAPI Instance 3 (api3)"]):
            y0 = 320 + idx * 58
            is_sel = (idx + 1) == rr_idx
            col = C_NGINX if is_sel else CARD_BORDER
            draw.rounded_rectangle((1468, y0, 1854, y0 + 46), radius=10, fill=mix(CARD_BG, C_NGINX, 0.2 if is_sel else 0.0), outline=col, width=2 if is_sel else 1)
            draw.text((1484, y0 + 13), label, font=F_SMALL_BOLD, fill=TEXT_PRIMARY if is_sel else TEXT_MUTED)
            if is_sel:
                draw_pill(draw, 1742, y0 + 10, "ROUTED", C_NGINX, filled=True)

    elif scene_num == 3:
        draw.text((1468, 160), "Cache Lookup & ML Inference", font=F_PANEL_TITLE, fill=TEXT_PRIMARY)
        miss_phase = t - 8.0  # 0..6s
        step_cards = [
            ("1. Redis Cache Lookup", "SHA-256 key · Protected by Circuit Breaker", C_REDIS, miss_phase >= 0.0),
            ("2. Cache MISS -> ML Inference", "HIT returns cached value; MISS invokes RF", C_APP, miss_phase >= 1.8),
            ("3. Random Forest Prediction", "Predicted ETA: 24.5 min (Illustrative Example)", C_APP, miss_phase >= 3.2),
            ("4. Cache Write (SETEX)", "Stored in Redis with 300s TTL", C_REDIS, miss_phase >= 4.5),
        ]
        for idx, (st, sd, sc, on) in enumerate(step_cards):
            y0 = 202 + idx * 74
            draw.rounded_rectangle((1468, y0, 1854, y0 + 62), radius=10, fill=mix(CARD_BG, sc, 0.16 if on else 0.02), outline=sc if on else CARD_BORDER, width=2 if on else 1)
            draw.text((1484, y0 + 10), st, font=F_SMALL_BOLD, fill=TEXT_PRIMARY if on else TEXT_DIM)
            draw.text((1484, y0 + 34), sd, font=F_SMALL, fill=sc if on else TEXT_DIM)

    elif scene_num == 4:
        draw.text((1468, 160), "PostgreSQL & Async Kafka", font=F_PANEL_TITLE, fill=TEXT_PRIMARY)
        db_on = (t - 14.0) >= 0.2
        kf_on = (t - 14.0) >= 2.0
        draw.rounded_rectangle((1468, 204, 1854, 294), radius=12, fill=mix(CARD_BG, C_PG, 0.16 if db_on else 0.02), outline=C_PG if db_on else CARD_BORDER, width=2)
        draw.text((1484, 216), "1. PostgreSQL Persistence", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
        draw.text((1484, 246), "Commits record to eta_predictions table.", font=F_SMALL, fill=TEXT_MUTED)
        draw.text((1484, 266), "Sharding & Replication ready design.", font=F_SMALL_BOLD, fill=C_PG)

        draw.rounded_rectangle((1468, 312, 1854, 496), radius=12, fill=mix(CARD_BG, C_KAFKA, 0.14 if kf_on else 0.02), outline=C_KAFKA if kf_on else CARD_BORDER, width=2)
        draw.text((1484, 326), "2. Asynchronous Event Streaming", font=F_CARD_TITLE, fill=TEXT_PRIMARY)
        flow_steps = [
            "FastAPI -> Kafka Producer (5s flush)",
            "        -> Redpanda Broker",
            "        -> Topic: eta-predictions",
            "        -> Kafka Consumer receives",
            "           & logs event (no DB write)",
        ]
        for idx, fl in enumerate(flow_steps):
            draw.text((1484, 360 + idx * 24), fl, font=F_MONO_XS, fill=C_KAFKA if kf_on else TEXT_DIM)

    elif scene_num == 5:
        draw.text((1468, 160), "Resilience & Fault Tolerance", font=F_PANEL_TITLE, fill=TEXT_PRIMARY)
        draw.text((1468, 188), "(Architecture Walkthrough — No Active Failure)", font=F_SMALL, fill=TEXT_MUTED)

        # Circuit Breaker State Machine Pills
        sub_t = (t - 21.0) / 4.0
        cb_active = 0 if sub_t < 0.35 else (1 if sub_t < 0.70 else 2)
        states = [("CLOSED", C_NGINX), ("OPEN", C_ALERT), ("HALF_OPEN", C_KAFKA)]
        sx = 1468
        for idx, (st_lbl, st_col) in enumerate(states):
            w = draw_pill(draw, sx, 224, st_lbl, st_col, filled=(idx == cb_active), font=F_MONO_SM, pad_x=11, pad_y=6)
            sx += w + 12

        items_s5 = [
            ("Redis Bypass Fallback", "1s timeout -> circuit opens; ML predicts directly."),
            ("Consumer Exponential Backoff", "Retries up to 3 attempts (1s then 2s delay)."),
            ("Manual Offset Commit", "enable.auto.commit=False; ACK after success."),
        ]
        for idx, (it, idesc) in enumerate(items_s5):
            y0 = 282 + idx * 78
            draw.rounded_rectangle((1468, y0, 1854, y0 + 66), radius=10, fill=(21, 32, 58), outline=C_REDIS if idx == 0 else C_KAFKA, width=1)
            draw.text((1484, y0 + 10), it, font=F_SMALL_BOLD, fill=TEXT_PRIMARY)
            draw.text((1484, y0 + 34), idesc, font=F_SMALL, fill=TEXT_MUTED)

    else:  # Scene 6 (25..30s)
        draw.text((1468, 160), "Response Returned to Client", font=F_PANEL_TITLE, fill=C_RETURN)
        draw.text((1468, 188), "FastAPI -> Nginx -> React Frontend -> Customer", font=F_MONO_XS, fill=TEXT_MUTED)

        draw.rounded_rectangle((1468, 222, 1854, 434), radius=12, fill=(12, 24, 42), outline=C_RETURN, width=2)
        draw_pill(draw, 1484, 238, "HTTP 200 OK · RESPONSE RECEIVED", C_RETURN, filled=True)
        resp_lines = [
            ("Predicted ETA:", "24.5 minutes (Example)"),
            ("Prediction ID:", "#1042 (Example)"),
            ("Model:", "Random Forest"),
            ("Cache / DB:", "Redis + PostgreSQL"),
            ("Kafka Event:", "eta-predictions (Published)"),
        ]
        for idx, (rk, rv) in enumerate(resp_lines):
            y0 = 282 + idx * 28
            draw.text((1484, y0), rk, font=F_SMALL_BOLD, fill=TEXT_MUTED)
            draw.text((1614, y0), rv, font=F_MONO_XS, fill=TEXT_PRIMARY if idx < 3 else C_RETURN)

        draw.text((1468, 456), "Full Distributed Pipeline Verified End-to-End", font=F_SMALL_BOLD, fill=C_RETURN)
        draw.text((1468, 480), "Complete architecture active across all 6 layers.", font=F_SMALL, fill=TEXT_MUTED)

    # Bottom Architecture Flow Checklist (y: 544..916)
    list_box = (1446, 544, 1876, 916)
    draw_rounded_card(draw, list_box, CARD_BORDER, active=0.2, radius=16, fill_override=(14, 22, 42))
    draw.text((1468, 562), "END-TO-END STORYLINE", font=F_MONO_SM, fill=TEXT_MUTED)
    for idx, (sn, _, _, s_lbl, sc) in enumerate(SCENES):
        y0 = 598 + idx * 50
        done = scene_num > sn
        curr = scene_num == sn
        row_fill = mix(CARD_BG, sc, 0.22 if curr else (0.08 if done else 0.0))
        row_out = sc if curr else (mix(CARD_BORDER, sc, 0.45) if done else CARD_BORDER)
        draw.rounded_rectangle((1468, y0, 1854, y0 + 40), radius=9, fill=row_fill, outline=row_out, width=2 if curr else 1)
        badge_txt = "ACTIVE" if curr else ("DONE" if done else f"0{sn}")
        draw_pill(draw, 1478, y0 + 7, badge_txt, sc if (curr or done) else TEXT_DIM, filled=curr)
        draw.text((1556, y0 + 11), s_lbl, font=F_SMALL_BOLD, fill=TEXT_PRIMARY if (curr or done) else TEXT_DIM)

    # -----------------------------------------------------------------------
    # 5. Bottom 30-Second Progress Bar (y: 944..1048)
    # -----------------------------------------------------------------------
    draw.rounded_rectangle((48, 944, 1876, 1046), radius=14, fill=(15, 24, 44), outline=CARD_BORDER, width=1)
    bar_x1, bar_x2 = 72, 1852
    bar_w = bar_x2 - bar_x1
    seg_y1, seg_y2 = 966, 996

    timeline_labels = {
        1: "1. Client (0-4s)",
        2: "2. Load Balancer (4-8s)",
        3: "3. Cache & ML ETA (8-14s)",
        4: "4. Postgres & Kafka (14-21s)",
        5: "5. Fault Tolerance (21-25s)",
        6: "6. Client Response (25-30s)",
    }
    for sn, st, en, s_lbl, sc in SCENES:
        sx1 = bar_x1 + int((st / DURATION_SEC) * bar_w) + (3 if sn > 1 else 0)
        sx2 = bar_x1 + int((en / DURATION_SEC) * bar_w) - (3 if sn < 6 else 0)
        is_curr = scene_num == sn
        passed = t >= en
        fill_col = mix(CARD_BG_ALT, sc, 0.35 if is_curr else (0.20 if passed else 0.05))
        draw.rounded_rectangle((sx1, seg_y1, sx2, seg_y2), radius=8, fill=fill_col, outline=sc if is_curr else CARD_BORDER, width=2 if is_curr else 1)
        draw_centered_text(draw, (sx1 + sx2) // 2, (seg_y1 + seg_y2) // 2, timeline_labels[sn], F_MONO_XS, TEXT_PRIMARY if (is_curr or passed) else TEXT_MUTED)

    # Smooth Playhead Bar below segments
    track_y = 1014
    draw.rounded_rectangle((bar_x1, track_y, bar_x2, track_y + 10), radius=5, fill=(26, 39, 68))
    prog_x = bar_x1 + int((t / DURATION_SEC) * bar_w)
    if prog_x > bar_x1 + 4:
        draw.rounded_rectangle((bar_x1, track_y, prog_x, track_y + 10), radius=5, fill=s_color)
    draw.ellipse((prog_x - 8, track_y - 3, prog_x + 8, track_y + 13), fill=(255, 255, 255), outline=s_color, width=3)

    return img


# ---------------------------------------------------------------------------
# Build Master 256-Color Palette & Export GIF + PNG
# ---------------------------------------------------------------------------
def build_master_palette(sample_frames: list[Image.Image]) -> Image.Image:
    cols = 3
    rows = math.ceil(len(sample_frames) / cols)
    tw, th = 640, 360
    sheet = Image.new("RGB", (cols * tw, rows * th), BG_DARK)
    for idx, frame in enumerate(sample_frames):
        thumb = frame.resize((tw, th), Image.Resampling.BILINEAR)
        r = idx // cols
        c = idx % cols
        sheet.paste(thumb, (c * tw, r * th))
    return sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Rendering {TOTAL_FRAMES} frames at {WIDTH}x{HEIGHT} ({DURATION_SEC}s @ {FPS}fps)...")

    rgb_frames: list[Image.Image] = []
    for idx in range(TOTAL_FRAMES):
        rgb_frames.append(render_frame(idx))
        if (idx + 1) % 60 == 0:
            print(f"  Rendered {idx + 1}/{TOTAL_FRAMES} frames...")

    # Save crisp static final architecture PNG from Scene 6 steady overview frame (frame 288 -> 28.8s)
    static_frame = rgb_frames[288]
    static_frame.save(PNG_PATH, format="PNG", optimize=True)
    print(f"Saved static PNG: {PNG_PATH} ({PNG_PATH.stat().st_size / 1024:.1f} KB)")

    # Quantize all frames against a shared master 256-color palette for flicker-free playback
    sample_indices = [20, 60, 110, 175, 230, 285]
    master_palette = build_master_palette([rgb_frames[i] for i in sample_indices])
    pal_frames = [
        f.quantize(palette=master_palette, dither=Image.Dither.NONE)
        for f in rgb_frames
    ]

    print(f"Writing optimized animated GIF to {GIF_PATH}...")
    pal_frames[0].save(
        GIF_PATH,
        format="GIF",
        save_all=True,
        append_images=pal_frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        optimize=True,
    )
    size_mb = GIF_PATH.stat().st_size / (1024 * 1024)
    print(f"Saved animated GIF: {GIF_PATH} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
