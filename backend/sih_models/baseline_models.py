"""
baseline_models.py
==================
XGBoost and Random Forest baseline models for displacement prediction.

Both wrap sklearn's fit/predict interface and add:
  - Cross-validated evaluation
  - Feature importance logging
  - Model persistence (save/load with joblib)
"""

import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold
from xgboost import XGBRegressor


# ── Metrics helper ────────────────────────────────────────────────────────────

def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mae  = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2   = r2_score(y_true, y_pred)
    return {"MAE": mae, "RMSE": rmse, "R2": r2}


def _print_metrics(name: str, metrics: dict, fold: int | None = None) -> None:
    tag = f"[{name}]" + (f" fold {fold}" if fold is not None else "")
    print(f"  {tag}  MAE={metrics['MAE']:.4f}  RMSE={metrics['RMSE']:.4f}  R²={metrics['R2']:.4f}")


# ── XGBoost ──────────────────────────────────────────────────────────────────

class XGBoostModel:
    """
    XGBoost regressor for vehicle displacement prediction.

    Args:
        n_estimators:  Number of boosting rounds.
        max_depth:     Maximum tree depth.
        learning_rate: Step size shrinkage.
        subsample:     Row sub-sampling ratio per tree.
        n_jobs:        Parallelism (-1 = all cores).
        random_state:  Reproducibility seed.
    """

    def __init__(
        self,
        n_estimators: int = 300,
        max_depth: int = 6,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        n_jobs: int = -1,
        random_state: int = 42,
    ):
        self.model = XGBRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            n_jobs=n_jobs,
            random_state=random_state,
            verbosity=0,
            tree_method="hist",      # fast histogram-based method
        )
        self.feature_importances_: np.ndarray | None = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> "XGBoostModel":
        self.model.fit(X, y)
        self.feature_importances_ = self.model.feature_importances_
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X)

    def cross_validate(
        self,
        X: np.ndarray,
        y: np.ndarray,
        n_splits: int = 5,
    ) -> dict:
        """K-fold cross-validation. Returns mean metrics across folds."""
        kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)
        fold_metrics = []

        for fold_idx, (train_idx, val_idx) in enumerate(kf.split(X), start=1):
            self.model.fit(X[train_idx], y[train_idx])
            preds = self.model.predict(X[val_idx])
            m = regression_metrics(y[val_idx], preds)
            _print_metrics("XGBoost", m, fold=fold_idx)
            fold_metrics.append(m)

        mean_metrics = {
            k: float(np.mean([fm[k] for fm in fold_metrics]))
            for k in fold_metrics[0]
        }
        print(f"  [XGBoost] CV mean → MAE={mean_metrics['MAE']:.4f}  "
              f"RMSE={mean_metrics['RMSE']:.4f}  R²={mean_metrics['R2']:.4f}")
        return mean_metrics

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(self.model, path)
        print(f"  [XGBoost] Model saved → {path}")

    @classmethod
    def load(cls, path: str) -> "XGBoostModel":
        obj = cls()
        obj.model = joblib.load(path)
        return obj


# ── Random Forest ────────────────────────────────────────────────────────────

class RandomForestModel:
    """
    Random Forest regressor for vehicle displacement prediction.

    Args:
        n_estimators:  Number of trees.
        max_depth:     Maximum tree depth (None = unlimited).
        min_samples_split: Minimum samples required to split a node.
        n_jobs:        Parallelism.
        random_state:  Seed.
    """

    def __init__(
        self,
        n_estimators: int = 200,
        max_depth: int | None = None,
        min_samples_split: int = 4,
        max_features: str = "sqrt",
        n_jobs: int = -1,
        random_state: int = 42,
    ):
        self.model = RandomForestRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_split=min_samples_split,
            max_features=max_features,
            n_jobs=n_jobs,
            random_state=random_state,
        )
        self.feature_importances_: np.ndarray | None = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> "RandomForestModel":
        self.model.fit(X, y)
        self.feature_importances_ = self.model.feature_importances_
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X)

    def cross_validate(
        self,
        X: np.ndarray,
        y: np.ndarray,
        n_splits: int = 5,
    ) -> dict:
        kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)
        fold_metrics = []

        for fold_idx, (train_idx, val_idx) in enumerate(kf.split(X), start=1):
            self.model.fit(X[train_idx], y[train_idx])
            preds = self.model.predict(X[val_idx])
            m = regression_metrics(y[val_idx], preds)
            _print_metrics("RandomForest", m, fold=fold_idx)
            fold_metrics.append(m)

        mean_metrics = {
            k: float(np.mean([fm[k] for fm in fold_metrics]))
            for k in fold_metrics[0]
        }
        print(f"  [RandomForest] CV mean → MAE={mean_metrics['MAE']:.4f}  "
              f"RMSE={mean_metrics['RMSE']:.4f}  R²={mean_metrics['R2']:.4f}")
        return mean_metrics

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(self.model, path)
        print(f"  [RandomForest] Model saved → {path}")

    @classmethod
    def load(cls, path: str) -> "RandomForestModel":
        obj = cls()
        obj.model = joblib.load(path)
        return obj
