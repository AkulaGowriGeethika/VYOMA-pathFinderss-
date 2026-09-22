import numpy as np

def preprocess(data):
    acc = np.array([data.ax, data.ay, data.az])
    gyro = np.array([data.gx, data.gy, data.gz])

    return {
        "acceleration": acc.tolist(),
        "gyroscope": gyro.tolist()
    }