"""
features.py
===========
Feature engineering for the IO-VNBD pipeline.

Two parallel feature representations are produced:

  1. Tabular features   – hand-crafted statistical features per sliding window.
                          Used by XGBoost and Random Forest baselines.

  2. Sequence windows   – raw (or filtered) IMU time-series windows.
                          Used as direct input to LSTM / GRU models.

Target:
  The prediction target is the vehicle's *displacement magnitude* over each
  window, i.e.  sqrt(Δlat² + Δlon²)  (scaled to metres).
  If GPS columns are absent, speed integration is used instead.
"""

import numpy as np
import pandas as pd
from typing import Tuple


# ── Constants ────────────────────────────────────────────────────────────────

IMU_COLS   = ["ax", "ay", "az", "gx", "gy", "gz"]
GPS_COLS   = ["lat", "lon"]
SPEED_COL  = "speed"

# Approx metres per degree at mid-latitude (~51° N for UK data)
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = 111_320.0 * np.cos(np.radians(51.5))


# ── Target computation ───────────────────────────────────────────────────────

def compute_displacement(df: pd.DataFrame, fs_hz: float = 10.0) -> np.ndarray:
    """
    Compute per-sample displacement (in metres) relative to start of window.

    Priority:
      1. GPS lat/lon difference
      2. speed * dt integration
      3. ax double-integration (fallback)
    """
    dt = 1.0 / fs_hz

    if "lat" in df.columns and "lon" in df.columns:
        dlat = df["lat"].diff().fillna(0.0).values * M_PER_DEG_LAT
        dlon = df["lon"].diff().fillna(0.0).values * M_PER_DEG_LON
        return np.sqrt(dlat ** 2 + dlon ** 2)

    if SPEED_COL in df.columns:
        return df[SPEED_COL].values * dt

    # Last resort: integrate ax
    return np.abs(np.cumsum(df["ax"].values * dt))


# ── Sliding window helpers ───────────────────────────────────────────────────

def sliding_windows(
    array: np.ndarray,
    window_size: int,
    step: int,
) -> np.ndarray:
    """
    Extract overlapping windows from a 2-D array.

    Args:
        array:       (N, C)
        window_size: Number of time steps per window.
        step:        Stride between windows.

    Returns:
        (num_windows, window_size, C)
    """
    N, C = array.shape
    indices = range(0, N - window_size + 1, step)
    windows = np.stack([array[i: i + window_size] for i in indices], axis=0)
    return windows  # (W, window_size, C)


def window_targets(
    displacement: np.ndarray,
    window_size: int,
    step: int,
) -> np.ndarray:
    """
    Compute the total displacement (sum) for each window.

    Returns:
        (num_windows,) float array
    """
    indices = range(0, len(displacement) - window_size + 1, step)
    targets = np.array([displacement[i: i + window_size].sum() for i in indices])
    return targets


# ── Tabular feature extraction ───────────────────────────────────────────────

_STAT_NAMES = [
    "mean", "std", "min", "max", "rms",
    "peak_to_peak", "skewness", "kurtosis",
    "energy", "zero_crossings",
]


def _window_stats(window: np.ndarray) -> np.ndarray:
    """
    Compute statistical features for a single window of shape (T, C).
    Returns a 1-D feature vector of length C * len(_STAT_NAMES).
    """
    T, C = window.shape
    feats = []

    for c in range(C):
        x = window[:, c]
        mean   = x.mean()
        std    = x.std() + 1e-9
        mn     = x.min()
        mx     = x.max()
        rms    = np.sqrt(np.mean(x ** 2))
        p2p    = mx - mn
        # Skewness (Fisher)
        skew   = ((x - mean) ** 3).mean() / (std ** 3)
        # Excess kurtosis
        kurt   = ((x - mean) ** 4).mean() / (std ** 4) - 3.0
        energy = np.sum(x ** 2)
        zc     = np.sum(np.diff(np.sign(x)) != 0)

        feats.extend([mean, std, mn, mx, rms, p2p, skew, kurt, energy, zc])

    return np.array(feats, dtype=np.float32)


def extract_tabular_features(
    windows: np.ndarray,
) -> np.ndarray:
    """
    Extract hand-crafted statistical features from a set of windows.

    Args:
        windows: (W, T, C) array

    Returns:
        (W, C * len(_STAT_NAMES)) feature matrix
    """
    W = windows.shape[0]
    feats = np.stack([_window_stats(windows[w]) for w in range(W)], axis=0)
    return feats.astype(np.float32)


def tabular_feature_names(n_channels: int) -> list[str]:
    """Return column names for the tabular feature matrix."""
    cols = []
    for c in range(n_channels):
        for stat in _STAT_NAMES:
            cols.append(f"ch{c}_{stat}")
    return cols


# ── Main pipeline entry point ─────────────────────────────────────────────────

def build_features(
    df: pd.DataFrame,
    filtered_imu: np.ndarray,
    window_size: int = 50,
    step: int = 25,
    fs_hz: float = 10.0,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Build both tabular and sequence features from a session DataFrame.

    Args:
        df:           Full DataFrame for the session (needed for GPS/speed target).
        filtered_imu: (N, C) filtered IMU array – output of the filter pipeline.
        window_size:  Samples per window. Default 50 = 5 s at 10 Hz.
        step:         Window stride. Default 25 = 50 % overlap.
        fs_hz:        Sampling rate.

    Returns:
        X_tab:   (W, n_tab_features)  tabular features for baselines
        X_seq:   (W, window_size, C)  sequence windows for LSTM/GRU
        y:       (W,)                 displacement target per window
    """
    displacement = compute_displacement(df, fs_hz=fs_hz)

    # Align displacement length with filtered_imu length
    min_len = min(len(displacement), filtered_imu.shape[0])
    displacement  = displacement[:min_len]
    filtered_imu  = filtered_imu[:min_len]

    # Extract windows
    X_seq  = sliding_windows(filtered_imu, window_size, step)         # (W, T, C)
    y      = window_targets(displacement, window_size, step)           # (W,)

    # Tabular features
    X_tab  = extract_tabular_features(X_seq)                          # (W, F)

    return X_tab, X_seq, y
