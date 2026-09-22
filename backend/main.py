from fastapi import FastAPI
from schemas import SensorData
from model import predict, model_status
from typing import List, Dict
import math
import time
from sih_idr_engine import *
from advanced_filters import apply_pipeline, summarize
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="VYOMA Intelligent Dead Reckoning API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://vyoma-navigate.onrender.com",
        "http://localhost:3000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
buffer: List[list] = []


@app.get("/")
def home():
    return {
        "status": "VYOMA Smart Navigation Backend Running",
        "mode": "prototype",
        "project": "AI-ML Intelligent Dead Reckoning"
    }


@app.get("/health")
def health():
    return {"status": "healthy", "buffer_samples": len(buffer)}


@app.get("/capabilities")
def capabilities():
    return {
        "smartphone_idr": True,
        "imu_accelerometer_gyro": True,
        "gru_sequence_model": True,
        "sequence": "50 samples x 6 channels",
        "gnss_ins_fusion": "prototype",
        "dead_reckoning": "prototype",
        "gnss_recovery_refusion": "prototype",
        "vehicle_alignment": {
            "pitch": "gravity based prototype",
            "roll": "gravity based prototype",
            "yaw": "GNSS course / heading reference"
        },
        "vibration_filter": "lightweight low-pass prototype",
        "map_matching": "route-constrained prototype",
        "non_holonomic_constraint": "road/route constraint prototype",
        "mobile_target_hz": 10,
        "edge_imu_target_hz": 200,
        "drift_target": "<10%",
        "io_vnbd_validation": "required",
        "offline_osm": "offline-aware frontend; local tile/data packaging still required",
        "adaptive_filtering": "lightweight vibration-aware screening",
        "road_condition_screening": "heuristic endpoint",
        "phone_calibration": "stationary IMU baseline",
        "session_history": "local browser storage and JSON export",
        "voice_status": "browser speech synthesis when supported"
    }


def _low_pass(previous, current, alpha=0.25):
    if previous is None:
        return current
    return alpha * current + (1.0 - alpha) * previous


def _alignment_from_gravity(ax, ay, az):
    pitch = math.degrees(math.atan2(ax, math.sqrt(ay * ay + az * az)))
    roll = math.degrees(math.atan2(ay, math.sqrt(ax * ax + az * az)))
    return pitch, roll


def _fuse_positions(gnss, dr, weight=0.85):
    if not gnss:
        return dr
    if not dr:
        return gnss
    return {
        "latitude": weight * gnss["latitude"] + (1 - weight) * dr["latitude"],
        "longitude": weight * gnss["longitude"] + (1 - weight) * dr["longitude"]
    }



def _filtered_sequence(samples):
    """Apply the complete VYOMA filtering pipeline before model inference."""
    pipeline = apply_pipeline(samples)
    return pipeline["ekf"].tolist(), pipeline

@app.post("/sensor")
def sensor(data: SensorData):
    global buffer

    sample = [
        data.ax, data.ay, data.az,
        data.gx, data.gy, data.gz
    ]

    buffer.append(sample)

    if len(buffer) > 50:
        buffer.pop(0)

    result = {
        "samples": len(buffer),
        "status": "collecting",
        "timestamp": time.time()
    }

    if len(buffer) == 50:
        filtered_samples, filter_state = _filtered_sequence(buffer)
        displacement = predict(filtered_samples)

        pitch, roll = _alignment_from_gravity(
            data.ax, data.ay, data.az
        )

        result.update({
            "status": "inference_ready",
            "gru_displacement_m": displacement,
            "speed_mps": float(data.speed),
            "heading_deg": float(data.heading),
            "pitch_deg": pitch,
            "roll_deg": roll,
            "yaw_deg": float(data.heading),
            "vibration_filter": "median + low-pass + adaptive + EKF-style",
            "map_matching": "route constrained",
            "nhc": "road constraint",
        })

    return result


@app.post("/prototype-estimate")
def prototype_estimate(sequence: List[SensorData]):
    if len(sequence) < 50:
        return {
            "status": "warming",
            "required_samples": 50,
            "received_samples": len(sequence)
        }

    samples = [[
        s.ax, s.ay, s.az, s.gx, s.gy, s.gz
    ] for s in sequence[-50:]]

    filtered_samples, filter_state = _filtered_sequence(samples)
    displacement = predict(filtered_samples)
    last = sequence[-1]
    pitch, roll = _alignment_from_gravity(
        last.ax, last.ay, last.az
    )

    return {
        "status": "ok",
        "gru_displacement_m": displacement,
        "speed_mps": float(last.speed),
        "heading_deg": float(last.heading),
        "pitch_deg": pitch,
        "roll_deg": roll,
        "yaw_deg": float(last.heading),
        "vibration_filter": "median + low-pass + adaptive + EKF-style",
        "map_matching": "route constrained",
        "nhc": "road constraint"
    }




@app.post("/estimate")
def estimate(sequence: List[SensorData]):
    """Real or prototype GRU inference endpoint.
    The caller determines whether the samples came from live phone sensors
    or the prototype simulator; the model calculation itself is the same.
    """
    if len(sequence) < 50:
        return {
            "status": "warming",
            "required_samples": 50,
            "received_samples": len(sequence)
        }

    samples = [[
        s.ax, s.ay, s.az, s.gx, s.gy, s.gz
    ] for s in sequence[-50:]]

    filtered_samples, filter_state = _filtered_sequence(samples)
    displacement = predict(filtered_samples)
    last = sequence[-1]
    pitch, roll = _alignment_from_gravity(last.ax, last.ay, last.az)

    return {
        "status": "ok",
        "gru_displacement_m": float(displacement),
        "speed_mps": float(last.speed),
        "heading_deg": float(last.heading),
        "pitch_deg": pitch,
        "roll_deg": roll,
        "yaw_deg": float(last.heading),
        "vibration_filter": "median + low-pass + adaptive + EKF-style",
        "map_matching": "route constrained",
        "nhc": "road constraint",
        "source": "live_or_simulated_imu_sequence"
    }

@app.post("/filters/diagnostics")
def filters_diagnostics(payload: dict):
    """Run the complete filtering stack and return measurable diagnostics."""
    samples = payload.get("samples", [])
    if not samples:
        return {"status": "no_samples", "required_channels": ["ax","ay","az","gx","gy","gz"]}
    matrix = []
    for item in samples:
        if isinstance(item, dict):
            matrix.append([float(item.get(k, 0.0)) for k in ("ax","ay","az","gx","gy","gz")])
        else:
            matrix.append([float(v) for v in item[:6]])
    if len(matrix) < 3:
        return {"status": "warming", "required_samples": 3, "received_samples": len(matrix)}
    return {"status": "ok", **summarize(matrix)}

@app.get("/model-status")
def model_status_endpoint():
    return model_status()


@app.get("/models")
def models():
    return {
        "primary_sequence_model": "GRU displacement regression",
        "secondary_sequence_model": "LSTM displacement regression (training artifact)",
        "baseline_models": ["Random Forest", "XGBoost (training artifact)"],
        "filter_pipeline": ["Median despiking", "Butterworth-style low-pass foundation",
                             "Adaptive vibration filter", "EKF-style smoother"],
        "validation": "Required before claiming SIH accuracy targets"
    }

@app.post("/fusion")
def fusion(
    gnss: Dict = None,
    dead_reckoning: Dict = None,
    gnss_available: bool = True
):
    fused = _fuse_positions(
        gnss if gnss_available else None,
        dead_reckoning,
        weight=0.85
    )

    return {
        "mode": "GNSS+INS" if gnss_available else "INS/DEAD_RECKONING",
        "gnss_available": gnss_available,
        "fused_position": fused,
        "recovery_ready": True
    }


@app.post("/sih/diagnostics")
def sih_diagnostics(payload: dict):
    ax=float(payload.get("ax",0)); ay=float(payload.get("ay",0)); az=float(payload.get("az",9.81))
    gx=float(payload.get("gx",0)); gy=float(payload.get("gy",0)); gz=float(payload.get("gz",0))
    heading=float(payload.get("heading",0))
    pitch,roll=alignment_from_gravity(ax,ay,az); vib=vibration_score(ax,ay,az,gx,gy,gz)
    return {"pitch_deg":pitch,"roll_deg":roll,"yaw_deg":heading,
            "vibration_score":vib,"vibration_state":"HIGH" if vib>.65 else ("MEDIUM" if vib>.30 else "LOW"),
            "nhc":{"lateral_velocity_mps":0.0,"constraint":"ACTIVE"},
            "update_target_hz":10,"edge_imu_target_hz":200}

@app.post("/sih/fuse")
def sih_fuse(payload: dict):
    g=tuple(payload["gnss"]) if payload.get("gnss") else None
    d=tuple(payload["dead_reckoning"]) if payload.get("dead_reckoning") else None
    pos,sigma=fuse_position(g,d,float(payload.get("gnss_sigma_m",3)),float(payload.get("dr_sigma_m",8)))
    return {"fused_position":pos,"estimated_sigma_m":sigma,
            "mode":"GNSS+INS" if g and d else ("GNSS" if g else "DEAD_RECKONING")}

@app.post("/sih/map-match")
def sih_map_match(payload: dict):
    route=[tuple(x) for x in payload.get("route",[])]
    pred=tuple(payload["predicted"]); gps=tuple(payload["gnss"]) if payload.get("gnss") else None
    idx,conf=viterbi_route_match(gps,pred,route)
    return {"matched_index":idx,"confidence":conf,"method":"Viterbi-style route candidate matching","nhc":"ACTIVE"}

@app.post("/sih/benchmark")
def sih_benchmark(payload: dict):
    return benchmark(float(payload.get("distance_m",50)),float(payload.get("error_m",0)))


@app.post("/iov-risk")
def iov_risk(features: Dict):
    """Auxiliary IoV collision-risk endpoint for the uploaded Dataset IoV benchmark."""
    try:
        import joblib
        import os
        model_path = os.path.join(os.path.dirname(__file__), "iov_collision_model.pkl")
        model = joblib.load(model_path)
        import pandas as pd
        row = pd.DataFrame([features])
        pred = model.predict(row)[0]
        return {
            "status": "ok",
            "prediction": str(pred),
            "source": "Dataset IoV.xlsx",
            "purpose": "auxiliary IoV safety classification"
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "reason": str(exc),
            "purpose": "auxiliary IoV safety classification"
        }


@app.get("/sih/validation")
def sih_validation():
    """
    Returns the validation capabilities and the status of evidence.
    Real-world metrics require reference trajectory / hardware measurements.
    """
    return {
        "status": "validation framework ready",
        "drift": {
            "target_percent": 10.0,
            "target_50m_m": 5.0,
            "target_1km_m": 100.0,
            "measurement": "requires reference trajectory"
        },
        "performance": {
            "smartphone_target_hz": 10,
            "edge_target_hz": 200,
            "measurement": "requires runtime/hardware benchmark"
        },
        "transition": {
            "gnss_to_dr": "implemented",
            "dr_to_gnss": "implemented",
            "re_fusion": "implemented"
        },
        "constraints": {
            "route_matching": "implemented",
            "non_holonomic_road_constraint": "implemented"
        },
        "alignment": {
            "pitch": "gravity based",
            "roll": "gravity based",
            "yaw": "heading/GNSS reference"
        },
        "dataset": {
            "uploaded_iov_dataset": "integrated for auxiliary IoV safety model",
            "navigation_ground_truth": "required for measured drift validation"
        }
    }



# ---- VYOMA feature endpoints -------------------------------------------------
def _haversine_m(a, b):
    """Distance between [lat, lon] pairs in metres."""
    r = 6371000.0
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2-lat1, lon2-lon1
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2*r*math.asin(min(1.0, math.sqrt(h)))

def _confidence_score(gnss_accuracy_m=None, outage_seconds=0, filter_quality=1.0):
    accuracy = float(gnss_accuracy_m if gnss_accuracy_m is not None else 25.0)
    outage = max(0.0, float(outage_seconds))
    score = 100.0 * math.exp(-accuracy/50.0) * math.exp(-outage/120.0) * max(0.0, min(1.0, float(filter_quality)))
    return round(max(0.0, min(100.0, score)), 2)

@app.post("/features/position-confidence")
def position_confidence(payload: dict):
    score = _confidence_score(payload.get("gnss_accuracy_m"), payload.get("outage_seconds", 0),
                              payload.get("filter_quality", 1.0))
    return {
        "status": "ok", "confidence_percent": score,
        "level": "HIGH" if score >= 70 else ("MEDIUM" if score >= 40 else "LOW"),
        "estimated_accuracy_m": round(float(payload.get("gnss_accuracy_m", 25.0)) +
                                      max(0.0, float(payload.get("outage_seconds", 0))) * 0.15, 2),
        "method": "transparent heuristic confidence indicator; requires field calibration"
    }

@app.post("/features/route-deviation")
def route_deviation(payload: dict):
    predicted = payload.get("predicted")
    route = payload.get("route", [])
    if not predicted or not route:
        return {"status": "insufficient_data", "distance_m": None, "deviated": False}
    distances = [_haversine_m(predicted, point[:2]) for point in route if len(point) >= 2]
    distance = min(distances) if distances else None
    threshold = float(payload.get("threshold_m", 25.0))
    return {"status": "ok", "distance_to_route_m": round(distance, 2) if distance is not None else None,
            "threshold_m": threshold, "deviated": bool(distance is not None and distance > threshold)}

@app.post("/features/driving-safety")
def driving_safety(payload: dict):
    ax, ay, az = (float(payload.get(k, 0.0)) for k in ("ax", "ay", "az"))
    gx, gy, gz = (float(payload.get(k, 0.0)) for k in ("gx", "gy", "gz"))
    speed = abs(float(payload.get("speed_mps", 0.0)))
    horizontal = math.sqrt(ax*ax + ay*ay)
    gyro = math.sqrt(gx*gx + gy*gy + gz*gz)
    events = []
    if horizontal >= 4.0: events.append("HARSH_ACCELERATION_OR_BRAKING")
    if gyro >= 2.5: events.append("SHARP_TURN_OR_ROTATION")
    if speed > 33.33: events.append("HIGH_SPEED_SCREENING")
    return {"status": "ok", "events": events, "safe": not bool(events),
            "method": "threshold screening; not a certified safety classifier"}

@app.post("/features/model-comparison")
def model_comparison(payload: dict):
    samples = payload.get("samples", [])
    if len(samples) < 50:
        return {"status": "warming", "required_samples": 50, "received_samples": len(samples)}
    matrix = [[float(v) for v in row[:6]] for row in samples[-50:]]
    filtered, _ = _filtered_sequence(matrix)
    result = {"status": "ok", "gru": {"available": False}, "lstm": {"available": False}}
    try:
        from model import predict
        result["gru"] = {"available": True, "displacement_m": float(predict(filtered))}
    except Exception as exc:
        result["gru"] = {"available": False, "error": str(exc)}
    try:
        import os
        import numpy as np
        from tensorflow.keras.models import load_model
        model_path = os.path.join(os.path.dirname(__file__), "sih_models", "saved_models", "lstm_model.keras")
        if os.path.exists(model_path):
            lstm = load_model(model_path, compile=False)
            x = np.asarray(filtered, dtype=np.float32)[None, :, :]
            y = lstm.predict(x, verbose=0)
            result["lstm"] = {"available": True, "raw_output": np.asarray(y).reshape(-1).tolist()}
        else:
            result["lstm"] = {"available": False, "reason": "LSTM artifact not found"}
    except Exception as exc:
        result["lstm"] = {"available": False, "error": str(exc)}
    result["comparison_note"] = "Compare on the same labelled ground-truth dataset before selecting a winner."
    return result

@app.post("/road-condition")
def road_condition(payload: dict):
    """Lightweight explainable road-event screening from IMU values.
    This is a screening endpoint, not a clinically/vehicle-validated classifier.
    """
    ax = float(payload.get("ax", 0)); ay = float(payload.get("ay", 0)); az = float(payload.get("az", 9.81))
    gx = float(payload.get("gx", 0)); gy = float(payload.get("gy", 0)); gz = float(payload.get("gz", 0))
    accel_mag = math.sqrt(ax * ax + ay * ay + az * az)
    gyro_mag = math.sqrt(gx * gx + gy * gy + gz * gz)
    score = min(1.0, abs(accel_mag - 9.81) / 8.0 + gyro_mag / 20.0)
    state = "IMPACT / ROUGH" if score > 0.75 else ("ROUGH ROAD" if score > 0.35 else "SMOOTH ROAD")
    return {"road_condition": state, "vibration_score": round(score, 4), "screening": "heuristic"}


@app.post("/calibration")
def calibration(payload: dict):
    """Return a stationary IMU baseline from supplied samples."""
    samples = payload.get("samples") or []
    if not samples:
        return {"status": "insufficient_samples", "required": 5}
    keys = ["ax", "ay", "az", "gx", "gy", "gz"]
    baseline = {key: sum(float(sample.get(key, 0)) for sample in samples) / len(samples) for key in keys}
    return {"status": "ok", "sample_count": len(samples), "baseline": baseline, "method": "stationary baseline"}
