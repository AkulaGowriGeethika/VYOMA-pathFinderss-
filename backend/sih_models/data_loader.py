"""
data_loader.py
==============
Loads IO-VNBD CSV files (V = vehicle sensors, S = smartphone sensors).
Handles Git-LFS pointer files gracefully by falling back to synthetic data.

Expected CSV columns (IO-VNBD vehicle file):
  Time, ax, ay, az, gx, gy, gz, lat, lon, speed, heading, ...

Expected CSV columns (IO-VNBD smartphone file):
  Time, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z, lat, lon, speed, ...
"""

import os
import glob
import numpy as np
import pandas as pd
from tqdm import tqdm

# ── Column name aliases ──────────────────────────────────────────────────────
# Map whatever column names appear in the real CSVs to a canonical set.
# Extend this dict if the dataset uses different headers.
VEHICLE_COL_MAP = {
    # accelerometer
    "AccX": "ax", "AccY": "ay", "AccZ": "az",
    "Ax": "ax",   "Ay": "ay",   "Az": "az",
    "accel_x": "ax", "accel_y": "ay", "accel_z": "az",
    # gyroscope
    "GyroX": "gx", "GyroY": "gy", "GyroZ": "gz",
    "Gx": "gx",    "Gy": "gy",    "Gz": "gz",
    "gyro_x": "gx", "gyro_y": "gy", "gyro_z": "gz",
    # position / velocity
    "Latitude": "lat",  "Longitude": "lon",
    "Speed": "speed",   "Heading": "heading",
    "Timestamp": "time", "timestamp": "time",
}

SMARTPHONE_COL_MAP = {
    "acc_x": "ax", "acc_y": "ay", "acc_z": "az",
    "AccX": "ax",  "AccY": "ay",  "AccZ": "az",
    "gyro_x": "gx", "gyro_y": "gy", "gyro_z": "gz",
    "GyroX": "gx",  "GyroY": "gy",  "GyroZ": "gz",
    "Latitude": "lat", "Longitude": "lon",
    "Speed": "speed",  "Heading": "heading",
    "Timestamp": "time", "timestamp": "time",
}

# Canonical IMU columns we need at minimum
IMU_COLS = ["ax", "ay", "az", "gx", "gy", "gz"]
GPS_COLS = ["lat", "lon"]
ALL_FEATURE_COLS = IMU_COLS + GPS_COLS + ["speed"]


# ── LFS detection ────────────────────────────────────────────────────────────

def _is_lfs_pointer(filepath: str) -> bool:
    """Return True if the file is a Git-LFS pointer (not real data)."""
    try:
        with open(filepath, "r", errors="ignore") as f:
            first_line = f.readline()
        return first_line.strip().startswith("version https://git-lfs")
    except Exception:
        return False


# ── Single-file loader ───────────────────────────────────────────────────────

def load_csv(filepath: str, col_map: dict | None = None) -> pd.DataFrame | None:
    """
    Read one CSV and rename columns to canonical names.
    Returns None if the file is a Git-LFS pointer or unreadable.
    """
    if _is_lfs_pointer(filepath):
        return None

    try:
        df = pd.read_csv(filepath, low_memory=False)
    except Exception as e:
        print(f"  [WARN] Cannot read {filepath}: {e}")
        return None

    if col_map:
        df = df.rename(columns=col_map)

    # Lowercase all remaining column names for consistency
    df.columns = [c.lower().strip() for c in df.columns]

    # Keep only recognised feature columns that actually exist
    keep = [c for c in ALL_FEATURE_COLS + ["time"] if c in df.columns]
    if not keep:
        print(f"  [WARN] No usable columns in {filepath}")
        return None

    df = df[keep].copy()

    # Drop rows that are entirely NaN in IMU columns
    imu_present = [c for c in IMU_COLS if c in df.columns]
    if imu_present:
        df.dropna(subset=imu_present, how="all", inplace=True)

    # Fill remaining NaNs with forward-fill then zero
    df.ffill(inplace=True)
    df.fillna(0.0, inplace=True)

    return df if len(df) > 10 else None


# ── Dataset-wide loader ──────────────────────────────────────────────────────

def load_dataset(dataset_root: str, max_files: int = 0) -> pd.DataFrame:
    """
    Walk the IO-VNBD folder tree, load every V-*.csv and S-*.csv,
    tag each row with its source scenario/session, and return one
    concatenated DataFrame.

    Args:
        dataset_root: Path to IO-VNBD-master folder.
        max_files:    If > 0, stop after loading this many real files
                      (useful for quick smoke-tests).

    Returns:
        Combined DataFrame with columns:
            ax, ay, az, gx, gy, gz, lat, lon, speed,
            source_type ('V' or 'S'), session_label
    """
    csv_files = glob.glob(
        os.path.join(dataset_root, "**", "*.csv"), recursive=True
    )
    print(f"Found {len(csv_files)} CSV entries in dataset tree.")

    frames = []
    real_count = 0
    lfs_count = 0

    for fp in tqdm(csv_files, desc="Loading CSVs"):
        fname = os.path.basename(fp)
        if fname.startswith("V-"):
            col_map = VEHICLE_COL_MAP
            src = "V"
        elif fname.startswith("S-"):
            col_map = SMARTPHONE_COL_MAP
            src = "S"
        else:
            continue  # skip unrelated files

        df = load_csv(fp, col_map)
        if df is None:
            lfs_count += 1
            continue

        # Derive a clean session label from path, e.g. "S1", "M", "Vf"
        parts = fp.replace("\\", "/").split("/")
        session_label = parts[-2] if len(parts) >= 2 else "unknown"

        df["source_type"] = src
        df["session_label"] = session_label
        frames.append(df)
        real_count += 1

        if max_files > 0 and real_count >= max_files:
            break

    if lfs_count > 0:
        print(
            f"  [INFO] {lfs_count} files are Git-LFS pointers (not downloaded). "
            "Run `git lfs pull` inside the dataset repo to get real data."
        )

    if frames:
        combined = pd.concat(frames, ignore_index=True)
        print(f"Loaded {real_count} real files → {len(combined):,} rows total.")
        return combined

    # ── Fallback: generate synthetic data so the pipeline can still run ──────
    print("\n[FALLBACK] No real CSV data found. Generating synthetic IO-VNBD-like data.")
    return generate_synthetic_data(n_sessions=8, samples_per_session=2000)


# ── Synthetic data generator ─────────────────────────────────────────────────

def generate_synthetic_data(
    n_sessions: int = 8,
    samples_per_session: int = 2000,
    fs: float = 10.0,           # sampling rate Hz (matches IO-VNBD smartphone rate)
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate synthetic IMU + GPS data that mimics the statistical properties
    of vehicle inertial navigation data.

    Position is derived by integrating synthetic velocity; heading follows
    a smooth random walk so trajectories look realistic.
    """
    rng = np.random.default_rng(seed)
    dt = 1.0 / fs

    scenarios = ["S", "M", "Y", "Vf", "Vta", "Vtb", "Vw", "roundabout"]
    frames = []

    for i in range(n_sessions):
        label = scenarios[i % len(scenarios)]
        n = samples_per_session

        # ── IMU: sinusoidal base + Gaussian noise ──────────────────────────
        t = np.linspace(0, n * dt, n)
        freq_base = rng.uniform(0.5, 2.0)

        ax = 0.3 * np.sin(2 * np.pi * freq_base * t) + rng.normal(0, 0.05, n)
        ay = 0.2 * np.cos(2 * np.pi * freq_base * t) + rng.normal(0, 0.05, n)
        az = 9.81 + 0.1 * np.sin(2 * np.pi * 0.3 * t) + rng.normal(0, 0.02, n)  # gravity-dominant

        gx = 0.05 * np.sin(2 * np.pi * 0.8 * t) + rng.normal(0, 0.01, n)
        gy = 0.05 * np.cos(2 * np.pi * 0.8 * t) + rng.normal(0, 0.01, n)
        gz = 0.02 * np.sin(2 * np.pi * 0.3 * t) + rng.normal(0, 0.005, n)

        # Add occasional spike noise (sensor glitches)
        spike_idx = rng.integers(0, n, size=int(n * 0.01))
        ax[spike_idx] += rng.normal(0, 2.0, len(spike_idx))

        # ── GPS: integrate velocity from accelerometer ─────────────────────
        speed = np.cumsum(ax * dt)
        speed = np.clip(speed, 0, 30)  # cap at 30 m/s ≈ 108 km/h
        heading = np.cumsum(gz * dt)   # yaw integration

        # Convert to approx lat/lon (start near London for realism)
        start_lat, start_lon = 51.5 + rng.uniform(-0.5, 0.5), -0.1 + rng.uniform(-0.5, 0.5)
        lat = start_lat + np.cumsum(speed * np.cos(heading) * dt) / 111320
        lon = start_lon + np.cumsum(speed * np.sin(heading) * dt) / (111320 * np.cos(np.radians(start_lat)))

        df = pd.DataFrame({
            "time":          t,
            "ax":            ax,
            "ay":            ay,
            "az":            az,
            "gx":            gx,
            "gy":            gy,
            "gz":            gz,
            "lat":           lat,
            "lon":           lon,
            "speed":         speed,
            "source_type":   "V" if i % 2 == 0 else "S",
            "session_label": label,
        })
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    print(f"  Generated {len(combined):,} synthetic rows across {n_sessions} sessions.")
    return combined
