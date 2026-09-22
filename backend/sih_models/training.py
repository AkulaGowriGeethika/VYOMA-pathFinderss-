"""
training.py
===========
Full end-to-end training pipeline for the IO-VNBD dataset.

Pipeline stages
───────────────
 1. Load dataset   (data_loader.py)
 2. Filter signals  (filters.py)       Median → Butterworth → EKF
 3. Feature engineering (features.py)  Tabular + Sequence windows
 4. Train/Val/Test split
 5. Normalise features
 6. Baseline models  (baseline_models.py)  XGBoost  +  Random Forest
 7. Deep models      (deep_models.py)      LSTM     +  GRU
 8. Evaluate & compare all models
 9. Save trained models to  ./saved_models/

Usage
─────
    python training.py                          # use defaults
    python training.py --dataset_root <path>    # override dataset path
    python training.py --epochs 50              # override epochs
    python training.py --quick                  # fast smoke-test (small data)
"""

import os
import argparse
import time
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

# ── Local modules ─────────────────────────────────────────────────────────────
from data_loader  import load_dataset, IMU_COLS
from filters      import apply_filter_pipeline
from features     import build_features, tabular_feature_names
from baseline_models import XGBoostModel, RandomForestModel, regression_metrics
from deep_models  import LSTMModel, GRUModel


# ── Config ────────────────────────────────────────────────────────────────────

DATASET_ROOT  = r"C:\Users\aruna\OneDrive\Desktop\sih\IO-VNBD-master"
SAVE_DIR      = os.path.join(os.path.dirname(__file__), "saved_models")
CHECKPOINT_DIR = os.path.join(os.path.dirname(__file__), "checkpoints")

# Signal processing
FS_HZ           = 10.0     # IO-VNBD smartphone sampling rate
MEDIAN_KERNEL   = 5
BUTTER_CUTOFF   = 4.0      # Hz
BUTTER_ORDER    = 4
EKF_Q           = 1e-3
EKF_R           = 1e-2

# Windowing
WINDOW_SIZE     = 50       # 5 s at 10 Hz
STEP            = 25       # 50 % overlap

# Training
TEST_SIZE       = 0.15
VAL_SIZE        = 0.15
RANDOM_STATE    = 42
EPOCHS          = 80
BATCH_SIZE      = 64
CV_FOLDS        = 5


# ── Helpers ───────────────────────────────────────────────────────────────────

def _section(title: str) -> None:
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def _elapsed(start: float) -> str:
    s = time.time() - start
    return f"{s:.1f}s"


# ── Stage 1 : Data loading ────────────────────────────────────────────────────

def stage_load(dataset_root: str, quick: bool) -> pd.DataFrame:
    _section("STAGE 1 — Load Dataset")
    max_files = 2 if quick else 0
    df = load_dataset(dataset_root, max_files=max_files)
    print(f"  Dataset shape : {df.shape}")
    print(f"  Columns       : {list(df.columns)}")
    return df


# ── Stage 2 : Filtering ───────────────────────────────────────────────────────

def stage_filter(df: pd.DataFrame) -> np.ndarray:
    _section("STAGE 2 — Signal Filtering  (Median → Butterworth → EKF)")

    # Extract only the IMU channels that actually exist
    imu_cols_present = [c for c in IMU_COLS if c in df.columns]
    if not imu_cols_present:
        raise ValueError(
            f"No IMU columns found in DataFrame. Expected one of: {IMU_COLS}"
        )

    raw_imu = df[imu_cols_present].values.astype(np.float32)
    print(f"  Raw IMU shape  : {raw_imu.shape}  (channels: {imu_cols_present})")

    t0 = time.time()
    filter_results = apply_filter_pipeline(
        raw_imu,
        fs_hz=FS_HZ,
        median_kernel=MEDIAN_KERNEL,
        butter_cutoff=BUTTER_CUTOFF,
        ekf_q=EKF_Q,
        ekf_r=EKF_R,
    )
    print(f"  Filtering done in {_elapsed(t0)}")

    for name, arr in filter_results.items():
        print(f"    {name:12s} → shape {arr.shape}")

    # Use EKF output as the final filtered signal
    return filter_results["ekf"].astype(np.float32)


# ── Stage 3 : Feature engineering ────────────────────────────────────────────

def stage_features(
    df: pd.DataFrame,
    filtered_imu: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    _section("STAGE 3 — Feature Engineering")

    t0 = time.time()
    X_tab, X_seq, y = build_features(
        df,
        filtered_imu,
        window_size=WINDOW_SIZE,
        step=STEP,
        fs_hz=FS_HZ,
    )
    print(f"  Feature extraction done in {_elapsed(t0)}")
    print(f"  Tabular features : {X_tab.shape}  ({X_tab.shape[1]} features/window)")
    print(f"  Sequence windows : {X_seq.shape}  (windows × steps × channels)")
    print(f"  Targets          : {y.shape}  — displacement (m)")
    print(f"  Target stats     : min={y.min():.3f}  max={y.max():.3f}  "
          f"mean={y.mean():.3f}  std={y.std():.3f}")

    return X_tab, X_seq, y


# ── Stage 4 : Split & normalise ───────────────────────────────────────────────

def stage_split_normalise(
    X_tab: np.ndarray,
    X_seq: np.ndarray,
    y: np.ndarray,
) -> tuple:
    _section("STAGE 4 — Train / Val / Test Split & Normalisation")

    # First split off test set
    X_tab_tv, X_tab_test, X_seq_tv, X_seq_test, y_tv, y_test = train_test_split(
        X_tab, X_seq, y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
    )
    # Then split train/val
    val_ratio = VAL_SIZE / (1.0 - TEST_SIZE)
    X_tab_tr, X_tab_val, X_seq_tr, X_seq_val, y_tr, y_val = train_test_split(
        X_tab_tv, X_seq_tv, y_tv,
        test_size=val_ratio,
        random_state=RANDOM_STATE,
    )

    print(f"  Train : {X_tab_tr.shape[0]} windows")
    print(f"  Val   : {X_tab_val.shape[0]} windows")
    print(f"  Test  : {X_tab_test.shape[0]} windows")

    # ── Tabular feature scaler ─────────────────────────────────────────────
    tab_scaler = StandardScaler()
    X_tab_tr   = tab_scaler.fit_transform(X_tab_tr)
    X_tab_val  = tab_scaler.transform(X_tab_val)
    X_tab_test = tab_scaler.transform(X_tab_test)

    # ── Sequence scaler (fit per channel across train windows) ────────────
    W_tr, T, C = X_seq_tr.shape
    seq_scaler = StandardScaler()
    X_seq_tr_2d   = X_seq_tr.reshape(-1, C)
    seq_scaler.fit(X_seq_tr_2d)

    X_seq_tr   = seq_scaler.transform(X_seq_tr.reshape(-1, C)).reshape(W_tr, T, C)
    X_seq_val  = seq_scaler.transform(X_seq_val.reshape(-1, C)).reshape(-1, T, C)
    X_seq_test = seq_scaler.transform(X_seq_test.reshape(-1, C)).reshape(-1, T, C)

    # ── Target scaler ──────────────────────────────────────────────────────
    y_scaler   = StandardScaler()
    y_tr_s     = y_scaler.fit_transform(y_tr.reshape(-1, 1)).flatten()
    y_val_s    = y_scaler.transform(y_val.reshape(-1, 1)).flatten()

    os.makedirs(SAVE_DIR, exist_ok=True)
    joblib.dump(tab_scaler, os.path.join(SAVE_DIR, "tab_scaler.pkl"))
    joblib.dump(seq_scaler, os.path.join(SAVE_DIR, "seq_scaler.pkl"))
    joblib.dump(y_scaler,   os.path.join(SAVE_DIR, "y_scaler.pkl"))
    print("  Scalers saved to saved_models/")

    return (
        X_tab_tr, X_tab_val, X_tab_test,
        X_seq_tr, X_seq_val, X_seq_test,
        y_tr, y_val, y_test,
        y_tr_s, y_val_s,
        y_scaler,
    )


# ── Stage 5 : Baseline models ─────────────────────────────────────────────────

def stage_baselines(
    X_tab_tr:   np.ndarray,
    X_tab_val:  np.ndarray,
    X_tab_test: np.ndarray,
    y_tr:       np.ndarray,
    y_val:      np.ndarray,
    y_test:     np.ndarray,
) -> dict:
    _section("STAGE 5 — Baseline Models (XGBoost + Random Forest)")

    results = {}

    # Combine train+val for baselines (CV handles the split internally)
    X_all = np.vstack([X_tab_tr, X_tab_val])
    y_all = np.concatenate([y_tr, y_val])

    # ── XGBoost ──────────────────────────────────────────────────────────
    print("\n  >> XGBoost cross-validation")
    xgb = XGBoostModel()
    xgb_cv = xgb.cross_validate(X_all, y_all, n_splits=CV_FOLDS)

    # Final fit on full train+val, evaluate on test
    xgb.fit(X_all, y_all)
    xgb_test = regression_metrics(y_test, xgb.predict(X_tab_test))
    print(f"  [XGBoost] TEST  MAE={xgb_test['MAE']:.4f}  "
          f"RMSE={xgb_test['RMSE']:.4f}  R²={xgb_test['R2']:.4f}")
    xgb.save(os.path.join(SAVE_DIR, "xgboost_model.pkl"))
    results["xgboost"] = {"cv": xgb_cv, "test": xgb_test}

    # ── Random Forest ─────────────────────────────────────────────────────
    print("\n  >> Random Forest cross-validation")
    rf = RandomForestModel()
    rf_cv = rf.cross_validate(X_all, y_all, n_splits=CV_FOLDS)

    rf.fit(X_all, y_all)
    rf_test = regression_metrics(y_test, rf.predict(X_tab_test))
    print(f"  [RandomForest] TEST  MAE={rf_test['MAE']:.4f}  "
          f"RMSE={rf_test['RMSE']:.4f}  R²={rf_test['R2']:.4f}")
    rf.save(os.path.join(SAVE_DIR, "rf_model.pkl"))
    results["random_forest"] = {"cv": rf_cv, "test": rf_test}

    return results


# ── Stage 6 : Deep models ─────────────────────────────────────────────────────

def stage_deep(
    X_seq_tr:   np.ndarray,
    X_seq_val:  np.ndarray,
    X_seq_test: np.ndarray,
    y_tr_s:     np.ndarray,
    y_val_s:    np.ndarray,
    y_test:     np.ndarray,
    y_scaler,
    epochs:     int,
) -> dict:
    _section("STAGE 6 — Deep Models (LSTM + GRU)")

    _, T, C = X_seq_tr.shape
    input_shape = (T, C)
    results = {}

    def descale(y_scaled):
        return y_scaler.inverse_transform(y_scaled.reshape(-1, 1)).flatten()

    # ── LSTM ──────────────────────────────────────────────────────────────
    print("\n  >> LSTM")
    lstm = LSTMModel(input_shape=input_shape, units=[128, 64], dropout=0.3)
    lstm.summary()
    lstm.fit(
        X_seq_tr, y_tr_s,
        X_seq_val, y_val_s,
        epochs=epochs,
        batch_size=BATCH_SIZE,
        checkpoint_dir=CHECKPOINT_DIR,
    )
    lstm_preds = descale(lstm.predict(X_seq_test))
    lstm_test  = regression_metrics(y_test, lstm_preds)
    print(f"  [LSTM] TEST  MAE={lstm_test['MAE']:.4f}  "
          f"RMSE={lstm_test['RMSE']:.4f}  R²={lstm_test['R2']:.4f}")
    lstm.save(os.path.join(SAVE_DIR, "lstm_model.keras"))
    results["lstm"] = {"test": lstm_test}

    # ── GRU ───────────────────────────────────────────────────────────────
    print("\n  >> GRU")
    gru = GRUModel(input_shape=input_shape, units=[128, 64], dropout=0.3)
    gru.summary()
    gru.fit(
        X_seq_tr, y_tr_s,
        X_seq_val, y_val_s,
        epochs=epochs,
        batch_size=BATCH_SIZE,
        checkpoint_dir=CHECKPOINT_DIR,
    )
    gru_preds = descale(gru.predict(X_seq_test))
    gru_test  = regression_metrics(y_test, gru_preds)
    print(f"  [GRU]  TEST  MAE={gru_test['MAE']:.4f}  "
          f"RMSE={gru_test['RMSE']:.4f}  R²={gru_test['R2']:.4f}")
    gru.save(os.path.join(SAVE_DIR, "gru_model.keras"))
    results["gru"] = {"test": gru_test}

    return results


# ── Stage 7 : Summary ────────────────────────────────────────────────────────

def stage_summary(baseline_results: dict, deep_results: dict) -> None:
    _section("STAGE 7 — Results Summary")

    all_results = {**baseline_results, **deep_results}

    header = f"  {'Model':<18} {'MAE':>10} {'RMSE':>10} {'R²':>10}"
    print(header)
    print("  " + "-" * (len(header) - 2))

    for name, res in all_results.items():
        m = res.get("test", res)
        print(f"  {name:<18} {m['MAE']:>10.4f} {m['RMSE']:>10.4f} {m['R2']:>10.4f}")

    print(f"\n  Models saved in: {SAVE_DIR}")


# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="IO-VNBD Training Pipeline")
    p.add_argument(
        "--dataset_root", type=str, default=DATASET_ROOT,
        help="Path to IO-VNBD-master folder",
    )
    p.add_argument(
        "--epochs", type=int, default=EPOCHS,
        help="Max training epochs for LSTM/GRU",
    )
    p.add_argument(
        "--quick", action="store_true",
        help="Smoke-test mode: loads at most 2 files, runs 5 epochs",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    pipeline_start = time.time()
    epochs = 5 if args.quick else args.epochs

    print("\n" + "#" * 70)
    print("  IO-VNBD FULL TRAINING PIPELINE")
    print("  Filters : Median -> Butterworth -> EKF")
    print("  Models  : XGBoost | Random Forest | LSTM | GRU")
    print("#" * 70)

    # ── 1. Load ───────────────────────────────────────────────────────────
    df = stage_load(args.dataset_root, quick=args.quick)

    # ── 2. Filter ─────────────────────────────────────────────────────────
    filtered_imu = stage_filter(df)

    # ── 3. Features ───────────────────────────────────────────────────────
    X_tab, X_seq, y = stage_features(df, filtered_imu)

    # Guard: need enough windows to split meaningfully
    min_windows = CV_FOLDS * 10
    if len(y) < min_windows:
        print(f"\n  [WARN] Only {len(y)} windows available "
              f"(need ≥ {min_windows}). Generating more synthetic data.")
        from data_loader import generate_synthetic_data
        df_extra = generate_synthetic_data(n_sessions=20, samples_per_session=3000)
        imu_cols = [c for c in ["ax", "ay", "az", "gx", "gy", "gz"] if c in df_extra.columns]
        raw_extra = df_extra[imu_cols].values.astype(np.float32)
        from filters import apply_filter_pipeline
        filt_extra = apply_filter_pipeline(raw_extra, fs_hz=FS_HZ)["ekf"].astype(np.float32)
        X_tab2, X_seq2, y2 = stage_features(df_extra, filt_extra)
        X_tab = np.vstack([X_tab, X_tab2])
        X_seq = np.vstack([X_seq, X_seq2])
        y     = np.concatenate([y, y2])
        print(f"  Extended dataset: {len(y)} windows total.")

    # ── 4. Split & normalise ──────────────────────────────────────────────
    (
        X_tab_tr, X_tab_val, X_tab_test,
        X_seq_tr, X_seq_val, X_seq_test,
        y_tr, y_val, y_test,
        y_tr_s, y_val_s,
        y_scaler,
    ) = stage_split_normalise(X_tab, X_seq, y)

    # ── 5. Baselines ──────────────────────────────────────────────────────
    baseline_results = stage_baselines(
        X_tab_tr, X_tab_val, X_tab_test,
        y_tr, y_val, y_test,
    )

    # ── 6. Deep models ────────────────────────────────────────────────────
    deep_results = stage_deep(
        X_seq_tr, X_seq_val, X_seq_test,
        y_tr_s, y_val_s, y_test,
        y_scaler,
        epochs=epochs,
    )

    # ── 7. Summary ────────────────────────────────────────────────────────
    stage_summary(baseline_results, deep_results)

    print(f"\n  Total pipeline time: {_elapsed(pipeline_start)}")
    print("\n  Done.\n")


if __name__ == "__main__":
    main()
