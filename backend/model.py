import os
import joblib
import numpy as np
import tensorflow as tf
from tensorflow import keras

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

MODEL_PATH = os.path.join(MODEL_DIR, "gru_model.keras")
SEQ_SCALER_PATH = os.path.join(MODEL_DIR, "seq_scaler.pkl")
Y_SCALER_PATH = os.path.join(MODEL_DIR, "y_scaler.pkl")


# Recreate the exact GRU architecture used by the trained model.
def build_model():
    inputs = keras.Input(
        shape=(50, 6),
        name="imu_sequence"
    )

    x = keras.layers.GRU(
        128,
        return_sequences=True,
        activation="tanh",
        recurrent_activation="sigmoid",
        kernel_regularizer=keras.regularizers.l2(0.0001),
        name="gru_0"
    )(inputs)

    x = keras.layers.Dropout(
        0.3,
        name="drop_0"
    )(x)

    x = keras.layers.GRU(
        64,
        return_sequences=False,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="gru_1"
    )(x)

    x = keras.layers.Dropout(
        0.3,
        name="drop_1"
    )(x)

    x = keras.layers.Dense(
        64,
        activation="relu",
        name="dense_1"
    )(x)

    x = keras.layers.Dropout(
        0.15,
        name="dropout_1"
    )(x)

    outputs = keras.layers.Dense(
        1,
        activation="linear",
        name="output"
    )(x)

    return keras.Model(
        inputs=inputs,
        outputs=outputs,
        name="GRU_Displacement"
    )


# Try the normal Keras model first.
# If the serialized .keras architecture cannot be deserialized,
# reconstruct the architecture and load its weights.
try:
    model = keras.models.load_model(
        MODEL_PATH,
        compile=False
    )

except Exception as exc:
    print(
        "Standard Keras model loading failed. "
        "Reconstructing GRU architecture and loading weights."
    )
    print(f"Original model-loading error: {exc}")

    model = build_model()

    # Extract weights from the .keras archive.
    try:
        import zipfile
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            with zipfile.ZipFile(MODEL_PATH, "r") as archive:
                archive.extractall(temp_dir)

            weights_file = None

            for root, _, files in os.walk(temp_dir):
                for filename in files:
                    if filename.endswith(".weights.h5"):
                        weights_file = os.path.join(root, filename)
                        break
                if weights_file:
                    break

            if weights_file is None:
                raise FileNotFoundError(
                    "No .weights.h5 file was found inside gru_model.keras"
                )

            model.load_weights(weights_file)

    except Exception as weight_error:
        raise RuntimeError(
            "Unable to load GRU model weights from gru_model.keras. "
            f"Weight loading error: {weight_error}"
        ) from weight_error


seq_scaler = joblib.load(SEQ_SCALER_PATH)

y_scaler = joblib.load(Y_SCALER_PATH)


def predict(sequence):
    x = np.asarray(sequence, dtype=np.float32)

    if x.shape != (50, 6):
        raise ValueError(
            f"Expected IMU sequence shape (50, 6), got {x.shape}"
        )

    x = seq_scaler.transform(x)
    x = x.reshape(1, 50, 6)

    y = model.predict(x, verbose=0)

    return float(
        y_scaler.inverse_transform(
            y.reshape(-1, 1)
        )[0, 0]
    )
