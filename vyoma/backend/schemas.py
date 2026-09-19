from pydantic import BaseModel
from typing import Optional

class SensorData(BaseModel):
    ax: float
    ay: float
    az: float
    gx: float
    gy: float
    gz: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed: float = 0
    heading: float = 0
    dt: float = 0.1