"""Print the beat grid and the loudest section starts ("drops") of a music file as JSON.

usage: python3 promo-video/beats.py <audio-file>
"""
import json
import subprocess
import sys
import tempfile

import numpy as np
import scipy.io.wavfile as wavfile

SAMPLE_RATE = 11025
HOP = 256
WINDOW = 1024
BPM_RANGE = (70, 180)
DROP_RISE = 1.25


def load_mono(path: str) -> np.ndarray:
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", str(SAMPLE_RATE), tmp.name], check=True)
        _, samples = wavfile.read(tmp.name)
    return samples.astype(float) / 32768


def onset_envelope(samples: np.ndarray) -> np.ndarray:
    frames = np.lib.stride_tricks.sliding_window_view(samples, WINDOW)[::HOP] * np.hanning(WINDOW)
    spectrum = np.log1p(np.abs(np.fft.rfft(frames, axis=1)) * 10)
    return np.maximum(0, np.diff(spectrum, axis=0)).sum(axis=1)


def beat_grid(flux: np.ndarray) -> tuple[float, float]:
    rate = SAMPLE_RATE / HOP
    centered = flux - flux.mean()
    autocorr = np.correlate(centered, centered, "full")[len(centered) - 1:]
    lags = np.arange(len(autocorr)) / rate
    usable = (lags > 60 / BPM_RANGE[1]) & (lags < 60 / BPM_RANGE[0])
    coarse_bpm = 60 / lags[usable][np.argmax(autocorr[usable])]
    if coarse_bpm < 100:
        coarse_bpm *= 2
    best = (0.0, coarse_bpm, 0.0)
    for bpm in np.arange(coarse_bpm - 3, coarse_bpm + 3, 0.02):
        period = 60 / bpm
        for phase in np.arange(0, period, 0.005):
            idx = (np.arange(phase, len(flux) / rate, period) * rate).astype(int)
            score = flux[idx[idx < len(flux)]].mean()
            if score > best[0]:
                best = (score, bpm, phase)
    return round(float(best[1]), 2), round(float(best[2]), 3)


def drops(samples: np.ndarray, bpm: float, phase: float) -> list[float]:
    beat = 60 / bpm
    starts = np.arange(phase, len(samples) / SAMPLE_RATE - beat, beat)
    energy = np.array([np.sqrt((samples[int(t * SAMPLE_RATE):int((t + beat) * SAMPLE_RATE)] ** 2).mean()) for t in starts])
    found = []
    for i in range(8, len(energy) - 4):
        before = energy[i - 8:i].mean()
        after = energy[i:i + 4].mean()
        if after <= before * DROP_RISE or (found and starts[i] - found[-1] < 8 * beat):
            continue
        jumps = energy[i:i + 4] - energy[i - 1:i + 3]
        found.append(round(float(starts[i + int(np.argmax(jumps))]), 2))
    return found


samples = load_mono(sys.argv[1])
bpm, phase = beat_grid(onset_envelope(samples))
print(json.dumps({"bpm": bpm, "beatSeconds": round(60 / bpm, 5), "phase": phase, "drops": drops(samples, bpm, phase), "duration": round(len(samples) / SAMPLE_RATE, 2)}, indent=2))
