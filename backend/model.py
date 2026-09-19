import os
import joblib
import numpy as np
from tensorflow.keras.models import load_model

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

model = load_model(os.path.join(MODEL_DIR, "gru_model.keras"))
seq_scaler = joblib.load(os.path.join(MODEL_DIR, "seq_scaler.pkl"))
y_scaler = joblib.load(os.path.join(MODEL_DIR, "y_scaler.pkl"))

def predict(sequence):
    x = np.asarray(sequence, dtype=np.float32)
    x = seq_scaler.transform(x)
    x = x.reshape(1, 50, 6)

    y = model.predict(x, verbose=0)

    return float(y_scaler.inverse_transform(y.reshape(-1, 1))[0, 0])