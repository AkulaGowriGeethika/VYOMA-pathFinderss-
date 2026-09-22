"""VYOMA advanced IMU filtering pipeline.
Pure NumPy, designed for server-side preprocessing.
Includes median despiking, low-pass smoothing, adaptive vibration weighting,
and a lightweight EKF-style state smoother.
"""
from __future__ import annotations
import numpy as np

IMU_DIM = 6

def _as_matrix(data):
    x = np.asarray(data, dtype=np.float64)
    if x.ndim != 2 or x.shape[1] != IMU_DIM:
        raise ValueError(f"Expected (N,6) IMU matrix, got {x.shape}")
    return x

def median_filter(data, kernel=5):
    x = _as_matrix(data)
    k = max(3, int(kernel) | 1)
    p = k // 2
    out = np.empty_like(x)
    for c in range(x.shape[1]):
        padded = np.pad(x[:, c], p, mode="edge")
        windows = np.lib.stride_tricks.sliding_window_view(padded, k)
        out[:, c] = np.median(windows, axis=-1)
    return out

def low_pass_filter(data, alpha=0.22):
    x = _as_matrix(data)
    alpha = float(np.clip(alpha, 0.01, 1.0))
    out = np.empty_like(x)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1.0 - alpha) * out[i-1]
    return out

def adaptive_vibration_filter(data, base_alpha=0.22):
    """Reduce trust in high-vibration samples while preserving shape."""
    x = _as_matrix(data)
    if len(x) == 0:
        return x.copy(), np.zeros(0)
    out = np.empty_like(x)
    scores = np.zeros(len(x))
    out[0] = x[0]
    for i in range(1, len(x)):
        acc_norm = np.linalg.norm(x[i, :3])
        gyro_norm = np.linalg.norm(x[i, 3:])
        vibration = min(1.0, 0.65 * min(1.0, abs(acc_norm - 9.81) / 9.81)
                        + 0.35 * min(1.0, gyro_norm / 8.0))
        scores[i] = vibration
        alpha = np.clip(base_alpha * (1.0 - 0.70 * vibration), 0.04, 0.35)
        out[i] = alpha * x[i] + (1.0 - alpha) * out[i-1]
    return out, scores

def ekf_style_smoother(data, process_noise=0.015, measurement_noise=0.08):
    """Lightweight diagonal Kalman-style smoother for six IMU channels."""
    z = _as_matrix(data)
    if len(z) == 0:
        return z.copy()
    x = z[0].copy()
    p = np.ones(IMU_DIM) * 0.5
    q = float(max(process_noise, 1e-6))
    r = float(max(measurement_noise, 1e-6))
    out = np.empty_like(z)
    out[0] = x
    for i in range(1, len(z)):
        p = p + q
        gain = p / (p + r)
        x = x + gain * (z[i] - x)
        p = (1.0 - gain) * p
        out[i] = x
    return out

def apply_pipeline(data):
    raw = _as_matrix(data)
    median = median_filter(raw)
    lowpass = low_pass_filter(median)
    adaptive, vibration = adaptive_vibration_filter(lowpass)
    ekf = ekf_style_smoother(adaptive)
    return {
        "raw": raw.astype(np.float32),
        "median": median.astype(np.float32),
        "lowpass": lowpass.astype(np.float32),
        "adaptive": adaptive.astype(np.float32),
        "ekf": ekf.astype(np.float32),
        "vibration_scores": vibration.astype(np.float32),
    }

def summarize(data):
    result = apply_pipeline(data)
    scores = result["vibration_scores"]
    return {
        "samples": int(len(scores)),
        "pipeline": ["median", "lowpass", "adaptive_vibration", "ekf_style"],
        "mean_vibration_score": float(np.mean(scores)) if len(scores) else 0.0,
        "max_vibration_score": float(np.max(scores)) if len(scores) else 0.0,
        "high_vibration_samples": int(np.sum(scores >= 0.65)),
    }
