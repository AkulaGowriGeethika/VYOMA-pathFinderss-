"""
filters.py
==========
Three signal-processing filters for IMU / odometry data.
Implemented in pure NumPy — no scipy dependency.

  1. MedianFilter      – removes impulse/spike noise (sliding-window median)
  2. ButterworthFilter – 2nd-order low-pass IIR filter (zero-phase via
                         forward + backward pass) implemented from first
                         principles using the bilinear transform.
  3. EKF               – Extended Kalman Filter for nonlinear state estimation
                         State: [ax, ay, az, gx, gy, gz]
"""

import numpy as np


# ── 1. Median Filter ─────────────────────────────────────────────────────────

class MedianFilter:
    """
    Sliding-window median filter applied channel-by-channel.

    Args:
        kernel_size: Window length (must be odd). Default 5.
    """

    def __init__(self, kernel_size: int = 5):
        if kernel_size % 2 == 0:
            kernel_size += 1
        self.kernel_size = kernel_size

    def _median1d(self, x: np.ndarray) -> np.ndarray:
        """Pure-NumPy sliding median via stride tricks."""
        n = len(x)
        k = self.kernel_size
        pad = k // 2
        # Reflect-pad edges so output length == input length
        x_pad = np.pad(x, pad, mode="reflect")
        # Build view of shape (n, k) without copying
        shape   = (n, k)
        strides = (x_pad.strides[0], x_pad.strides[0])
        windows = np.lib.stride_tricks.as_strided(x_pad, shape=shape, strides=strides)
        return np.median(windows, axis=1)

    def apply(self, data: np.ndarray) -> np.ndarray:
        """
        Args:
            data: (N, C)
        Returns:
            Filtered array of same shape.
        """
        out = np.empty_like(data)
        for c in range(data.shape[1]):
            out[:, c] = self._median1d(data[:, c])
        return out


# ── 2. Butterworth Low-Pass Filter (pure NumPy) ───────────────────────────────

class ButterworthFilter:
    """
    2nd-order Butterworth low-pass filter, zero-phase (forward + backward).

    Coefficients derived analytically via the bilinear transform:
      - Analog prototype: H(s) = 1 / (s^2 + sqrt(2)*s + 1)
      - Digital: H(z) = B(z) / A(z)  via  s = 2*fs*(1-z^-1)/(1+z^-1)

    Args:
        cutoff_hz: Cut-off frequency in Hz. Default 4 Hz.
        fs_hz:     Sampling frequency in Hz. Default 10 Hz.
    """

    def __init__(self, cutoff_hz: float = 4.0, fs_hz: float = 10.0):
        # Pre-warp the analogue cutoff frequency
        wc = 2.0 * np.pi * cutoff_hz          # rad/s analogue
        wd = 2.0 * fs_hz * np.tan(wc / (2.0 * fs_hz))   # pre-warped

        # Bilinear transform for 2nd-order Butterworth
        k  = wd
        k2 = k * k
        T  = 1.0 / fs_hz
        T2 = T * T

        # Denominator coefficients a0, a1, a2  (a0 will be used to normalise)
        sqrt2 = np.sqrt(2.0)
        a0 = 4.0 + 2.0 * sqrt2 * k * T + k2 * T2
        a1 = 2.0 * k2 * T2 - 8.0
        a2 = 4.0 - 2.0 * sqrt2 * k * T + k2 * T2

        # Numerator: gain factor for low-pass is k^2 * T^2
        b0 = k2 * T2
        b1 = 2.0 * k2 * T2
        b2 = k2 * T2

        # Normalise so a[0] = 1
        self.b = np.array([b0, b1, b2]) / a0
        self.a = np.array([1.0, a1 / a0, a2 / a0])

    def _filter1d(self, x: np.ndarray) -> np.ndarray:
        """Direct-form II transposed IIR filter (causal)."""
        b, a = self.b, self.a
        n = len(x)
        y = np.zeros(n)
        w = np.zeros(3)   # delay line

        for i in range(n):
            w[0] = x[i] - a[1] * w[1] - a[2] * w[2]
            y[i] = b[0] * w[0] + b[1] * w[1] + b[2] * w[2]
            w[2] = w[1]
            w[1] = w[0]
        return y

    def _filtfilt1d(self, x: np.ndarray) -> np.ndarray:
        """Zero-phase filtering: forward pass then reverse backward pass."""
        if len(x) < 6:
            return x.copy()
        y_fwd = self._filter1d(x)
        y_bwd = self._filter1d(y_fwd[::-1])
        return y_bwd[::-1]

    def apply(self, data: np.ndarray) -> np.ndarray:
        """
        Args:
            data: (N, C)
        Returns:
            Filtered array of same shape.
        """
        out = np.empty_like(data)
        for c in range(data.shape[1]):
            out[:, c] = self._filtfilt1d(data[:, c].astype(np.float64))
        return out.astype(data.dtype)


# ── 3. Extended Kalman Filter ─────────────────────────────────────────────────

class EKF:
    """
    Extended Kalman Filter for 6-DOF IMU state estimation.

    State vector x = [ax, ay, az, gx, gy, gz]  (6 × 1)

    Model:
      x_{k+1} = F * x_k  (nearly-constant acceleration)
      z_k     = H * x_k + v   (direct IMU observation)

    The "extended" nonlinearity is a small gravity-coupling term on az.

    Args:
        dt:       Time step in seconds. Default 0.1 s (10 Hz).
        q_scale:  Process noise scale (larger = trust measurements more).
        r_scale:  Measurement noise scale (larger = trust model more).
        n_states: State dimension. Default 6.
    """

    def __init__(
        self,
        dt: float = 0.1,
        q_scale: float = 1e-3,
        r_scale: float = 1e-2,
        n_states: int = 6,
    ):
        self.dt = dt
        self.n  = n_states
        self.F  = np.eye(n_states)
        self.H  = np.eye(n_states)
        self.Q  = q_scale * np.eye(n_states)
        self.R  = r_scale * np.eye(n_states)

    def _jacobian(self, x: np.ndarray) -> np.ndarray:
        J = self.F.copy()
        # Small nonlinear gravity coupling on az (index 2)
        J[2, 2] = 1.0 - self.dt * 0.01 * x[2]
        return J

    def apply(self, data: np.ndarray) -> np.ndarray:
        """
        Run EKF over a full sequence.

        Args:
            data: (N, 6)  — [ax, ay, az, gx, gy, gz]
        Returns:
            Smoothed estimates (N, 6).
        """
        N   = data.shape[0]
        out = np.zeros_like(data, dtype=np.float64)
        x   = data[0].astype(np.float64)
        P   = np.eye(self.n)

        for k in range(N):
            z     = data[k].astype(np.float64)
            Fj    = self._jacobian(x)

            # Predict
            x_p = self.F @ x
            P_p = Fj @ P @ Fj.T + self.Q

            # Update
            S   = self.H @ P_p @ self.H.T + self.R
            K   = P_p @ self.H.T @ np.linalg.inv(S)
            x   = x_p + K @ (z - self.H @ x_p)
            P   = (np.eye(self.n) - K @ self.H) @ P_p

            out[k] = x

        return out.astype(data.dtype)


# ── Convenience pipeline ──────────────────────────────────────────────────────

def apply_filter_pipeline(
    data: np.ndarray,
    fs_hz: float = 10.0,
    median_kernel: int = 5,
    butter_cutoff: float = 4.0,
    ekf_q: float = 1e-3,
    ekf_r: float = 1e-2,
) -> dict:
    """
    Apply Median → Butterworth → EKF sequentially.

    Args:
        data:          (N, C) raw IMU array (at least 6 channels for EKF).
        fs_hz:         Sampling frequency in Hz.
        median_kernel: Median filter window.
        butter_cutoff: Butterworth low-pass cut-off in Hz.
        ekf_q:         EKF process noise scale.
        ekf_r:         EKF measurement noise scale.

    Returns:
        dict with keys 'raw', 'median', 'butterworth', 'ekf'.
    """
    results = {"raw": data}

    # Step 1 — Median
    mf = MedianFilter(kernel_size=median_kernel)
    after_median = mf.apply(data)
    results["median"] = after_median

    # Step 2 — Butterworth
    bf = ButterworthFilter(cutoff_hz=butter_cutoff, fs_hz=fs_hz)
    after_butter = bf.apply(after_median)
    results["butterworth"] = after_butter

    # Step 3 — EKF (only on the first 6 IMU channels)
    if data.shape[1] >= 6:
        ekf = EKF(dt=1.0 / fs_hz, q_scale=ekf_q, r_scale=ekf_r, n_states=6)
        ekf_out = ekf.apply(after_butter[:, :6])
        if data.shape[1] > 6:
            ekf_out = np.hstack([ekf_out, after_butter[:, 6:]])
        results["ekf"] = ekf_out
    else:
        results["ekf"] = after_butter

    return results
