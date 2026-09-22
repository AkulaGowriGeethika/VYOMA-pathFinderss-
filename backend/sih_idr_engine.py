"""VYOMA SIH software-side IDR engine (prototype)."""
import math
from dataclasses import dataclass
EARTH_R=6378137.0
def vibration_score(ax,ay,az,gx,gy,gz,g=9.81):
    a=math.sqrt(ax*ax+ay*ay+az*az); gyro=math.sqrt(gx*gx+gy*gy+gz*gz)
    return min(1.0,0.7*min(1,abs(a-g)/g)+0.3*min(1,gyro/8))
def alignment_from_gravity(ax,ay,az):
    return (math.degrees(math.atan2(ax,math.sqrt(ay*ay+az*az))),
            math.degrees(math.atan2(ay,math.sqrt(ax*ax+az*az))))
def haversine_m(a,b):
    la1,lo1=map(math.radians,a); la2,lo2=map(math.radians,b)
    dl=la2-la1; dn=lo2-lo1
    h=math.sin(dl/2)**2+math.cos(la1)*math.cos(la2)*math.sin(dn/2)**2
    return 2*EARTH_R*math.asin(min(1,math.sqrt(h)))
def fuse_position(gnss,dr,gnss_sigma_m=3,dr_sigma_m=8):
    if gnss is None:return dr,dr_sigma_m
    if dr is None:return gnss,gnss_sigma_m
    wg=1/gnss_sigma_m**2; wd=1/dr_sigma_m**2; w=wg+wd
    return ((wg*gnss[0]+wd*dr[0])/w,(wg*gnss[1]+wd*dr[1])/w),math.sqrt(1/w)
def nearest_route_index(point,route):
    if not route:return None,float("inf")
    ds=[haversine_m(point,p) for p in route]; i=min(range(len(ds)),key=ds.__getitem__)
    return i,ds[i]
def viterbi_route_match(gps_point,predicted_point,route,window=10):
    if not route:return None,0.0
    ni,_=nearest_route_index(predicted_point,route); lo=max(0,ni-window); hi=min(len(route),ni+window+1)
    best_i=None;best=float("inf")
    for i in range(lo,hi):
        cost=haversine_m(predicted_point,route[i])
        if gps_point: cost+=0.35*haversine_m(gps_point,route[i])
        if cost<best:best=cost;best_i=i
    return best_i,math.exp(-min(best,100)/20)
def benchmark(distance_m,error_m):
    pct=100*error_m/max(distance_m,1)
    return {"distance_m":distance_m,"error_m":error_m,"drift_percent":pct,"within_10_percent_target":pct<10}
