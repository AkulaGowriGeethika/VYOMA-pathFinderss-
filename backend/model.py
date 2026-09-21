"""Safe GRU inference wrapper for VYOMA.

The model is loaded once at import time and every request is validated to the
expected 50x6 shape. Errors are surfaced as clear application errors rather
than obscure scaler/model tracebacks.
"""
import os
import joblib
import numpy as np
from tensorflow.keras.models import load_model

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "gru_model.keras")
SEQ_SCALER_PATH = os.path.join(MODEL_DIR, "seq_scaler.pkl")
Y_SCALER_PATH = os.path.join(MODEL_DIR, "y_scaler.pkl")

model = load_model(MODEL_PATH)
seq_scaler = joblib.load(SEQ_SCALER_PATH)
y_scaler = joblib.load(Y_SCALER_PATH)


def validate_sequence(sequence):
    x = np.asarray(sequence, dtype=np.float32)
    if x.shape != (50, 6):
        raise ValueError(f"Expected exactly 50 IMU samples with 6 channels; received {x.shape}")
    if not np.isfinite(x).all():
        raise ValueError("IMU sequence contains NaN or infinite values")
    return x


def predict(sequence):
    x = validate_sequence(sequence)
    x = seq_scaler.transform(x).reshape(1, 50, 6)
    y = model.predict(x, verbose=0)
    return float(y_scaler.inverse_transform(np.asarray(y).reshape(-1, 1))[0, 0])


def model_status():
    return {
        "loaded": True,
        "model": os.path.basename(MODEL_PATH),
        "input_shape": [50, 6],
        "output": "displacement_m",
        "finite_input_validation": True,
    }
