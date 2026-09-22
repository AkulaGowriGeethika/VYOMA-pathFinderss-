from model import predict
from fusion import fuse
from preprocessing import preprocess

def navigate(data):
    sensor = preprocess(data)
    speed = predict(data)
    position = fuse(data, speed)

    return {
        "latitude": position["latitude"],
        "longitude": position["longitude"],
        "speed": speed,
        "mode": position["mode"],
        "sensor": sensor
    }