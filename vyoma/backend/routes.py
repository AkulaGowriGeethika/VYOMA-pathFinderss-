from fastapi import APIRouter
from schemas import SensorData
from navigation import navigate

router = APIRouter()

@router.post("/sensor")
def sensor_data(data: SensorData):
    return navigate(data)