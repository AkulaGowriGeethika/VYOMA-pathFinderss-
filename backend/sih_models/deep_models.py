"""
deep_models.py
==============
LSTM and GRU models for sequential vehicle displacement prediction.

Architecture:
  Input → [LSTM/GRU layers] → Dropout → Dense(64) → Dense(1)

Both models share the same training interface:
  model.fit(X_train, y_train, X_val, y_val)
  model.predict(X)
  model.save(path) / model.load(path)
"""

import os
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, callbacks


# Suppress TF info/warning noise
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")


# ── Metrics helper ────────────────────────────────────────────────────────────

def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    mae  = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2   = r2_score(y_true, y_pred)
    return {"MAE": mae, "RMSE": rmse, "R2": r2}


# ── Shared training callbacks ────────────────────────────────────────────────

def _build_callbacks(checkpoint_path: str, patience: int = 10) -> list:
    return [
        callbacks.EarlyStopping(
            monitor="val_loss",
            patience=patience,
            restore_best_weights=True,
            verbose=1,
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=5,
            min_lr=1e-6,
            verbose=1,
        ),
        callbacks.ModelCheckpoint(
            filepath=checkpoint_path,
            monitor="val_loss",
            save_best_only=True,
            verbose=0,
        ),
    ]


# ── LSTM Model ───────────────────────────────────────────────────────────────

class LSTMModel:
    """
    Stacked LSTM for time-series displacement prediction.

    Args:
        input_shape:   (timesteps, features) tuple.
        units:         List of LSTM units per layer, e.g. [128, 64].
        dropout:       Dropout rate between layers.
        learning_rate: Adam optimizer learning rate.
    """

    def __init__(
        self,
        input_shape: tuple = (50, 6),
        units: list[int] = [128, 64],
        dropout: float = 0.3,
        learning_rate: float = 1e-3,
    ):
        self.input_shape   = input_shape
        self.units         = units
        self.dropout       = dropout
        self.learning_rate = learning_rate
        self.model         = self._build()
        self.history       = None

    def _build(self) -> keras.Model:
        inp = keras.Input(shape=self.input_shape, name="imu_sequence")
        x = inp

        for i, u in enumerate(self.units):
            return_sequences = (i < len(self.units) - 1)
            x = layers.LSTM(
                u,
                return_sequences=return_sequences,
                kernel_regularizer=keras.regularizers.l2(1e-4),
                name=f"lstm_{i}",
            )(x)
            x = layers.Dropout(self.dropout, name=f"drop_{i}")(x)

        x = layers.Dense(64, activation="relu", name="dense_1")(x)
        x = layers.Dropout(self.dropout / 2)(x)
        out = layers.Dense(1, name="output")(x)

        model = keras.Model(inputs=inp, outputs=out, name="LSTM_Displacement")
        model.compile(
            optimizer=keras.optimizers.Adam(self.learning_rate),
            loss="huber",            # robust to outliers
            metrics=["mae"],
        )
        return model

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        epochs: int = 100,
        batch_size: int = 64,
        checkpoint_dir: str = "checkpoints",
    ) -> keras.callbacks.History:
        os.makedirs(checkpoint_dir, exist_ok=True)
        ckpt_path = os.path.join(checkpoint_dir, "lstm_best.keras")

        self.history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=_build_callbacks(ckpt_path),
            verbose=1,
        )
        return self.history

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X, verbose=0).flatten()

    def evaluate(self, X: np.ndarray, y: np.ndarray) -> dict:
        preds = self.predict(X)
        m = regression_metrics(y, preds)
        print(f"  [LSTM] MAE={m['MAE']:.4f}  RMSE={m['RMSE']:.4f}  R²={m['R2']:.4f}")
        return m

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.model.save(path)
        print(f"  [LSTM] Model saved → {path}")

    @classmethod
    def load(cls, path: str) -> "LSTMModel":
        obj = cls.__new__(cls)
        obj.model = keras.models.load_model(path)
        obj.history = None
        return obj

    def summary(self) -> None:
        self.model.summary()


# ── GRU Model ────────────────────────────────────────────────────────────────

class GRUModel:
    """
    Stacked GRU for time-series displacement prediction.
    Lighter than LSTM (fewer parameters) – often faster convergence.

    Args:
        input_shape:   (timesteps, features) tuple.
        units:         List of GRU units per layer.
        dropout:       Dropout rate.
        learning_rate: Adam optimizer learning rate.
    """

    def __init__(
        self,
        input_shape: tuple = (50, 6),
        units: list[int] = [128, 64],
        dropout: float = 0.3,
        learning_rate: float = 1e-3,
    ):
        self.input_shape   = input_shape
        self.units         = units
        self.dropout       = dropout
        self.learning_rate = learning_rate
        self.model         = self._build()
        self.history       = None

    def _build(self) -> keras.Model:
        inp = keras.Input(shape=self.input_shape, name="imu_sequence")
        x = inp

        for i, u in enumerate(self.units):
            return_sequences = (i < len(self.units) - 1)
            x = layers.GRU(
                u,
                return_sequences=return_sequences,
                kernel_regularizer=keras.regularizers.l2(1e-4),
                name=f"gru_{i}",
            )(x)
            x = layers.Dropout(self.dropout, name=f"drop_{i}")(x)

        x = layers.Dense(64, activation="relu", name="dense_1")(x)
        x = layers.Dropout(self.dropout / 2)(x)
        out = layers.Dense(1, name="output")(x)

        model = keras.Model(inputs=inp, outputs=out, name="GRU_Displacement")
        model.compile(
            optimizer=keras.optimizers.Adam(self.learning_rate),
            loss="huber",
            metrics=["mae"],
        )
        return model

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        epochs: int = 100,
        batch_size: int = 64,
        checkpoint_dir: str = "checkpoints",
    ) -> keras.callbacks.History:
        os.makedirs(checkpoint_dir, exist_ok=True)
        ckpt_path = os.path.join(checkpoint_dir, "gru_best.keras")

        self.history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=_build_callbacks(ckpt_path),
            verbose=1,
        )
        return self.history

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X, verbose=0).flatten()

    def evaluate(self, X: np.ndarray, y: np.ndarray) -> dict:
        preds = self.predict(X)
        m = regression_metrics(y, preds)
        print(f"  [GRU]  MAE={m['MAE']:.4f}  RMSE={m['RMSE']:.4f}  R²={m['R2']:.4f}")
        return m

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.model.save(path)
        print(f"  [GRU] Model saved → {path}")

    @classmethod
    def load(cls, path: str) -> "GRUModel":
        obj = cls.__new__(cls)
        obj.model = keras.models.load_model(path)
        obj.history = None
        return obj

    def summary(self) -> None:
        self.model.summary()
