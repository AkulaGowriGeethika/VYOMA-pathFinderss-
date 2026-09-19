# VYOMA — Dataset & SIH Validation Report

## Uploaded dataset
**Dataset:** `Dataset IoV.xlsx`

This dataset is integrated as an **auxiliary IoV safety dataset**.

It contains vehicle/environment/collision-oriented fields such as:
- Number of lanes
- Driver status
- Nature of environment
- Vehicle velocity
- Distance between vehicles
- Braking capability
- Collision

It does **not** contain the IMU trajectory fields required to honestly calculate smartphone dead-reckoning drift.

## What this dataset can support
- IoV safety/collision classification
- Auxiliary AI/ML demonstration
- Vehicle/environment risk features

## What this dataset cannot prove
- IO-VNBD dead-reckoning performance
- `<10%` navigation drift
- `<5 m / 50 m`
- `<100 m / 1 km`
- pitch/roll/yaw calibration accuracy
- 10 Hz navigation accuracy
- 200 Hz FOG/edge navigation accuracy

Those require appropriate IMU/trajectory/reference-position data.

## Benchmark
{
  "task": "IoV collision classification",
  "target": "Collussion",
  "train_rows": 165420,
  "test_rows": 41355,
  "classes": [
    "0",
    "1"
  ],
  "accuracy": 1.0,
  "precision_weighted": 1.0,
  "recall_weighted": 1.0,
  "f1_weighted": 1.0,
  "warning": "This is an auxiliary IoV safety benchmark, not a dead-reckoning drift benchmark."
}

## Engineering rule
VYOMA does not fabricate SIH benchmark results from a dataset that does not contain the required measurements.
The UI therefore labels these navigation metrics as **VALIDATION REQUIRED** until the correct trajectory/IMU dataset is evaluated.
