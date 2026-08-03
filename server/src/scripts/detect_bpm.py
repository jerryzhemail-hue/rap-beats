#!/usr/bin/env python3
"""
BPM (Beats Per Minute) detector using librosa.
Usage: python3 detect_bpm.py <audio_file_path> [--json]
"""

import sys
import argparse
import numpy as np


def detect_bpm_and_key(audio_path: str, sr: int = 22050) -> dict:
    """
    Detect BPM and key from an audio file using librosa.
    Loads audio ONCE at sr=22050 for speed while maintaining accuracy.

    Returns:
        dict with keys: bpm, confidence, beat_count, onset_strength_mean,
                        duration_seconds, key, key_root, key_mode, key_confidence
    """
    try:
        import librosa
    except ImportError:
        print("ERROR: librosa not installed. Run: pip3 install librosa", file=sys.stderr)
        sys.exit(1)

    # Load audio once at 22050 Hz (3x faster than 44100, accurate enough for BPM)
    y, sr = librosa.load(audio_path, sr=sr, mono=True)

    # Estimate tempo and beat frames
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
    bpm = float(np.asarray(tempo).item())

    # Normalize BPM to 60-200 range (beat tracker can return half/double)
    while bpm < 60:
        bpm *= 2
    while bpm > 200:
        bpm /= 2

    # Confidence from beat density
    duration = librosa.get_duration(y=y, sr=sr)
    beat_density = len(beats) / duration if duration > 0 else 0

    # Onset strength mean
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_mean = float(np.mean(onset_env))

    # Key detection (reuse loaded audio)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)

    NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    major_profile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    minor_profile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

    best_corr = -999
    best_key = ''
    best_root = ''
    best_mode = ''

    for shift in range(12):
        rotated = list(chroma_mean[shift:]) + list(chroma_mean[:shift])
        major_corr = sum(r * m for r, m in zip(rotated, major_profile))
        minor_corr = sum(r * m for r, m in zip(rotated, minor_profile))
        if major_corr > best_corr:
            best_corr = major_corr
            best_key = f"{NOTES[shift]} major"
            best_root = NOTES[shift]
            best_mode = 'major'
        if minor_corr > best_corr:
            best_corr = minor_corr
            best_key = f"{NOTES[shift]} minor"
            best_root = NOTES[shift]
            best_mode = 'minor'

    chroma_sum = float(chroma_mean.sum())
    key_conf = max(0.0, min(1.0, float(best_corr / chroma_sum) / 10.0)) if chroma_sum > 0 else 0

    return {
        "bpm": round(bpm, 1),
        "confidence": round(beat_density / 10, 3),
        "beat_count": len(beats),
        "onset_strength_mean": round(onset_mean, 4),
        "duration_seconds": round(duration, 2),
        "sample_rate": sr,
        "key": best_key,
        "key_root": best_root,
        "key_mode": best_mode,
        "key_confidence": round(float(key_conf), 3),
    }


def main():
    parser = argparse.ArgumentParser(description="Detect BPM and key from audio file")
    parser.add_argument("audio_path", help="Path to audio file (mp3/wav/flac/ogg)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    try:
        result = detect_bpm_and_key(args.audio_path)

        if args.json:
            import json
            print(json.dumps(result, indent=2))
        else:
            print(f"  File:      {args.audio_path}")
            print(f"  BPM:       {result['bpm']}")
            print(f"  Key:       {result['key']}  (confidence {result['key_confidence']})")
            print(f"  Duration:  {result['duration_seconds']}s")
            print(f"  Beats:     {result['beat_count']}")
            print(f"  Confidence: {result['confidence']}")
    except FileNotFoundError:
        print(f"ERROR: File not found: {args.audio_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
