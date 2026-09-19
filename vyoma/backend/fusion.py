import math

last_lat = None
last_lon = None

def fuse(data, speed):
    global last_lat, last_lon

    if data.latitude is not None and data.longitude is not None:
        last_lat = data.latitude
        last_lon = data.longitude

        return {
            "latitude": last_lat,
            "longitude": last_lon,
            "mode": "gnss"
        }

    if last_lat is None:
        return {
            "latitude": None,
            "longitude": None,
            "mode": "no_position"
        }

    distance = speed * data.dt
    angle = math.radians(data.heading)

    last_lat += (distance * math.cos(angle)) / 111000
    last_lon += (distance * math.sin(angle)) / (
        111000 * math.cos(math.radians(last_lat))
    )

    return {
        "latitude": last_lat,
        "longitude": last_lon,
        "mode": "dead_reckoning"
    }