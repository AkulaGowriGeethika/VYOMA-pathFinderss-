
"""
VYOMA SIH validation/benchmark engine.

This module provides reproducible software-side validation for:
- dead reckoning drift
- 50 m / 1 km benchmark thresholds
- 10 Hz mobile timing
- 200 Hz edge timing
- GNSS -> DR -> GNSS recovery
- route/NHC constraint checks
- alignment sanity checks

When real reference trajectories are supplied, these functions can produce
measured results. The demo runner creates synthetic controlled trajectories
for UI/integration testing only; synthetic results must not be presented as
real-world validation.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Tuple
import math, time


@dataclass
class Point:
    x_m: float
    y_m: float


def distance(a: Point, b: Point) -> float:
    return math.hypot(a.x_m - b.x_m, a.y_m - b.y_m)


def trajectory_error(reference: List[Point], estimate: List[Point]) -> Dict:
    n = min(len(reference), len(estimate))
    if n == 0:
        return {"samples": 0, "mean_error_m": None, "max_error_m": None, "final_error_m": None}

    errors = [distance(reference[i], estimate[i]) for i in range(n)]
    traveled = sum(distance(reference[i-1], reference[i]) for i in range(1, n))
    final_error = errors[-1]
    drift_pct = (final_error / traveled * 100.0) if traveled > 0 else None

    return {
        "samples": n,
        "distance_m": traveled,
        "mean_error_m": sum(errors) / n,
        "max_error_m": max(errors),
        "final_error_m": final_error,
        "drift_percent": drift_pct,
        "under_10_percent": drift_pct is not None and drift_pct < 10.0,
        "under_5m_at_50m": final_error < 5.0 if traveled >= 50.0 else None,
        "under_100m_at_1km": final_error < 100.0 if traveled >= 1000.0 else None,
    }


def benchmark_latency(samples: int, elapsed_seconds: float) -> Dict:
    hz = samples / elapsed_seconds if elapsed_seconds > 0 else 0.0
    return {
        "samples": samples,
        "elapsed_seconds": elapsed_seconds,
        "effective_hz": hz,
        "meets_10hz": hz >= 10.0,
        "meets_200hz": hz >= 200.0,
    }


def route_constraint_check(route: List[Point], estimates: List[Point], max_cross_track_m: float = 15.0) -> Dict:
    if not route or not estimates:
        return {"checked": 0, "within_constraint": None}

    def seg_dist(p, a, b):
        dx, dy = b.x_m-a.x_m, b.y_m-a.y_m
        denom = dx*dx + dy*dy
        if denom == 0:
            return distance(p, a)
        t = max(0.0, min(1.0, ((p.x_m-a.x_m)*dx + (p.y_m-a.y_m)*dy)/denom))
        q = Point(a.x_m+t*dx, a.y_m+t*dy)
        return distance(p, q)

    max_cross = 0.0
    for p in estimates:
        d = min(seg_dist(p, route[i], route[i+1]) for i in range(len(route)-1))
        max_cross = max(max_cross, d)

    return {
        "checked": len(estimates),
        "max_cross_track_m": max_cross,
        "within_constraint": max_cross <= max_cross_track_m
    }


def recovery_check(pre_loss_gnss, dr_estimate, post_recovery_gnss, tolerance_m=20.0):
    if not pre_loss_gnss or not dr_estimate or not post_recovery_gnss:
        return {"ready": False}
    return {
        "ready": True,
        "recovery_error_m": distance(dr_estimate, post_recovery_gnss),
        "within_tolerance": distance(dr_estimate, post_recovery_gnss) <= tolerance_m
    }
