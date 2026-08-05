#!/usr/bin/env python3
"""
BPM sidecar server — runs librosa v5 BPM detection as a micro-service.
Endpoints:
  POST /detect       — multipart audio file, returns {bpm, confidence, ...}
  GET  /health       — returns {"status": "ok"}
"""
import io, os, tempfile, uuid, time, warnings, json
from flask import Flask, request, jsonify

warnings.filterwarnings("ignore")

import librosa
import numpy as np
from scipy import signal

app = Flask(__name__)

# ── Tunables ─────────────────────────────────────────────────────────
RAP_SEEDS = [65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160]
MAX_BPM, MIN_BPM, RAP_MIN = 180, 50, 80
HOP_LENGTH = 512

# ── Core algorithm (v5) ──────────────────────────────────────────────

def clamp_bpm(bpm: float) -> int:
    b = int(round(bpm))
    while b > MAX_BPM: b = round(b / 2)
    while b < MIN_BPM: b = round(b * 2)
    return max(MIN_BPM, min(MAX_BPM, b))

def cv_from_intervals(intervals):
    if len(intervals) < 2: return 999.0
    return float(np.std(intervals) / (np.mean(intervals) + 1e-9))

def cv_score(cv):
    return max(0.0, min(1.0, np.exp(-cv * 4)))

def alignment_score(beat_times, bpm):
    interval = 60.0 / bpm
    if interval <= 0: return 0.0
    start = beat_times[0]
    n = max(2, int((beat_times[-1] - start) / interval) + 2)
    theory = np.array([start + i * interval for i in range(n)])
    errors = np.array([min(abs(bt - theory)) for bt in beat_times])
    return float(np.exp(-np.mean(errors) * 10))

def onset_peak_score(onset_env, bpm, sr):
    frame_rate = sr / HOP_LENGTH
    period_frames = (frame_rate * 60) / bpm
    if period_frames < 3 or period_frames >= len(onset_env) - 2: return 0.0
    i = int(round(period_frames))
    peak = float(onset_env[max(0, i-1):i+2].mean())
    mean_val = float(onset_env.mean()) + 1e-9
    return min(1.0, peak / (mean_val * 2))

def detect_bpm_v5(audio_bytes: bytes, filename: str = "audio.mp3") -> dict:
    t0 = time.time()

    # Write to temp file — librosa.load needs a path or checks audio data format
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        y, sr = librosa.load(tmp_path, sr=22050, mono=True, duration=60)
    finally:
        os.unlink(tmp_path)

    dur = len(y) / sr
    if dur < 5:
        return {"error": "file_too_short", "duration_s": round(dur, 2)}

    # ── Multi-onset representations ─────────────────────────────────
    onset_default = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
    sos_lp = signal.butter(6, 150, btype='low', fs=sr, output='sos')
    y_low = signal.sosfilt(sos_lp, y)
    onset_low = librosa.onset.onset_strength(y=y_low, sr=sr, hop_length=HOP_LENGTH)
    sos_bp = signal.butter(4, [150, 4000], btype='band', fs=sr, output='sos')
    y_mid = signal.sosfilt(sos_bp, y)
    onset_mid = librosa.onset.onset_strength(y=y_mid, sr=sr, hop_length=HOP_LENGTH)
    onset_blend = 0.55 * onset_low + 0.45 * onset_default

    representations = [
        ("default",    onset_default),
        ("lowfreq",    onset_low),
        ("midfreq",    onset_mid),
        ("blend_kick", onset_blend),
    ]

    # ── Collect all entries, keyed by raw (unclamped) BPM ────────────
    seen = {}  # raw_bpm -> best entry

    for onset_name, onset_env in representations:
        for seed in RAP_SEEDS:
            try:
                tempo_raw, beats = librosa.beat.beat_track(
                    y=y, sr=sr, onset_envelope=onset_env,
                    start_bpm=float(seed), tightness=400, hop_length=HOP_LENGTH
                )
                tempo_raw = float(tempo_raw[0])
                beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=HOP_LENGTH)
                intervals = np.diff(beat_times)
                intervals = intervals[intervals > 0.1]
                cv = cv_from_intervals(intervals)

                raw_candidates = {round(tempo_raw)}
                for factor in (0.5, 1.5, 2.0):
                    raw_candidates.add(round(tempo_raw * factor))
                    raw_candidates.add(round(tempo_raw / factor))

                for raw_bpm in raw_candidates:
                    if raw_bpm <= 0: continue
                    bpm_for_score = clamp_bpm(raw_bpm)

                    align_s  = alignment_score(beat_times, bpm_for_score)
                    onset_s  = onset_peak_score(onset_env, bpm_for_score, sr)
                    cv_s     = cv_score(cv)
                    composite = 0.55 * align_s + 0.30 * cv_s + 0.15 * onset_s

                    key = raw_bpm
                    if key not in seen or align_s > seen[key]["align_s"]:
                        seen[key] = {
                            "raw_bpm": raw_bpm,
                            "bpm": bpm_for_score,
                            "onset_type": onset_name,
                            "cv": round(cv, 4),
                            "cv_s": round(cv_s, 4),
                            "align_s": round(align_s, 4),
                            "onset_s": round(onset_s, 4),
                            "composite": round(composite, 4),
                            "beats": len(beats),
                        }
            except Exception:
                pass

    scored = sorted(seen.values(), key=lambda x: -x["composite"])
    if not scored:
        return {"error": "no_bpm_found", "duration_s": round(dur, 2)}

    best = scored[0]

    # ── Octave tiebreak: prefer higher BPM in [RAP_MIN, MAX_BPM] ──
    if len(scored) >= 2:
        b1, b2 = scored[0]["raw_bpm"], scored[1]["raw_bpm"]
        if b2 <= 0: b2 = scored[1]["bpm"]
        ratio = b1 / b2 if b2 > 0 else 0
        is_octave = abs(ratio - 2.0) < 0.05 or abs(ratio - 0.5) < 0.025
        if is_octave:
            in_range = lambda b: RAP_MIN <= b <= MAX_BPM
            if in_range(b1) and in_range(b2):
                best = scored[0] if abs(scored[0]["composite"] - scored[1]["composite"]) >= 0.05 else scored[1]
            elif in_range(b1) and not in_range(b2):
                best = scored[0]
            elif not in_range(b1) and in_range(b2):
                best = scored[1]

    # ── Key detection ────────────────────────────────────────────────
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP_LENGTH)
        chroma_mean = chroma.mean(axis=1)
        notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        root = notes[int(np.argmax(chroma_mean))]
        minor_energy = chroma_mean[[1, 3, 8, 10]].sum()
        major_energy = chroma_mean[[0, 4, 7]].sum()
        mode = 'minor' if minor_energy > major_energy * 0.85 else 'major'
        key_str = f"{root} {mode.capitalize()}"
    except Exception:
        key_str = ""

    elapsed_ms = round((time.time() - t0) * 1000)
    final_bpm = best["bpm"]

    return {
        "bpm": final_bpm,
        "confidence": best["composite"],
        "duration_s": round(dur, 2),
        "beat_count": int(round((dur / 60) * final_bpm)),
        "key": key_str,
        "key_confidence": best["composite"],
        "cv": best["cv"],
        "align_score": best["align_s"],
        "onset_score": best["onset_s"],
        "onset_type": best["onset_type"],
        "elapsed_ms": elapsed_ms,
        "error": None,
    }

# ── HTTP endpoints ────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/detect", methods=["POST"])
def detect():
    if "audio" not in request.files and not request.data:
        return jsonify({"error": "no_audio"}), 400

    try:
        if "audio" in request.files:
            f = request.files["audio"]
            audio_bytes = f.read()
        else:
            audio_bytes = request.data

        if len(audio_bytes) < 1024:
            return jsonify({"error": "file_too_small"}), 400

        result = detect_bpm_v5(audio_bytes, getattr(
            request.files.get("audio"), "filename", "unknown"
        ))
        if result.get("error"):
            return jsonify(result), 422
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port, threaded=True)
