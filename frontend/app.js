/* VYOMA FIREBASE LOGIN GATE */
(function initVyomaFirebaseLogin(){
  const loginScreen=document.getElementById("loginScreen");
  const loginForm=document.getElementById("loginForm");
  const loginEmail=document.getElementById("loginEmail");
  const loginPassword=document.getElementById("loginPassword");
  const loginError=document.getElementById("loginError");
  const googleLoginBtn=document.getElementById("googleLoginBtn");

  if(!loginScreen||!loginForm) return;

  if(
    typeof firebase === "undefined" ||
    !window.VYOMA_FIREBASE_CONFIG ||
    !window.VYOMA_FIREBASE_CONFIG.apiKey ||
    window.VYOMA_FIREBASE_CONFIG.apiKey.includes("YOUR_")
  ){
    loginError.textContent=
      "Firebase is not configured. Add your Firebase Web App config in firebase-config.js.";
    return;
  }

  if(!firebase.apps.length){
    firebase.initializeApp(window.VYOMA_FIREBASE_CONFIG);
  }

  const auth=firebase.auth();

  auth.onAuthStateChanged(user=>{
    if(user){
      loginScreen.classList.add("hidden");
    }else{
      loginScreen.classList.remove("hidden");
    }
  });

  if(googleLoginBtn){
    googleLoginBtn.addEventListener("click",async ()=>{
      loginError.textContent="";
      googleLoginBtn.disabled=true;
      googleLoginBtn.classList.add("loading");

      googleLoginBtn.querySelector(
        "span:last-child"
      ).textContent="Connecting to Google...";

      try{
        const provider=new firebase.auth.GoogleAuthProvider();

        provider.setCustomParameters({
          prompt:"select_account"
        });

        await auth.signInWithPopup(provider);

      }catch(error){

        // On mobile browsers, a popup may be blocked.
        // Fall back to Firebase redirect sign-in.
        if(
          error.code==="auth/popup-blocked" ||
          error.code==="auth/popup-cancelled-by-user"
        ){
          try{
            const provider=
              new firebase.auth.GoogleAuthProvider();

            provider.setCustomParameters({
              prompt:"select_account"
            });

            await auth.signInWithRedirect(provider);
            return;

          }catch(redirectError){
            error=redirectError;
          }
        }

        const messages={
          "auth/account-exists-with-different-credential":
            "An account already exists with a different sign-in method.",

          "auth/unauthorized-domain":
            "This website domain is not authorized in Firebase Authentication.",

          "auth/network-request-failed":
            "Network error. Check your internet connection.",

          "auth/popup-closed-by-user":
            "Google sign-in was closed before completion."
        };

        loginError.textContent=
          messages[error.code] ||
          (error.message || "Google sign-in failed.");

      }finally{

        googleLoginBtn.disabled=false;
        googleLoginBtn.classList.remove("loading");

        googleLoginBtn.querySelector(
          "span:last-child"
        ).textContent="Continue with Google";

      }
    });
  }

  loginForm.addEventListener("submit",async event=>{
    event.preventDefault();

    loginError.textContent="";

    const email=loginEmail.value.trim();
    const password=loginPassword.value;

    if(!email || !email.includes("@")){
      loginError.textContent=
        "Please enter a valid email address.";
      return;
    }

    if(password.length<6){
      loginError.textContent=
        "Password must be at least 6 characters.";
      return;
    }

    const button=
      loginForm.querySelector("button[type=submit]");

    if(button){
      button.disabled=true;
      button.textContent="Signing in...";
    }

    try{
      await auth.signInWithEmailAndPassword(
        email,
        password
      );

    }catch(error){

      const messages={
        "auth/invalid-credential":
          "Invalid email or password.",

        "auth/user-not-found":
          "No Firebase account was found for this email.",

        "auth/wrong-password":
          "Invalid email or password.",

        "auth/invalid-email":
          "Please enter a valid email address.",

        "auth/too-many-requests":
          "Too many attempts. Please try again later.",

        "auth/network-request-failed":
          "Network error. Check your internet connection."
      };

      loginError.textContent=
        messages[error.code] ||
        (error.message || "Login failed.");

    }finally{

      if(button){
        button.disabled=false;
        button.textContent="Login";
      }

    }
  });
})();


/* =========================================================
   VYOMA SMART NAVIGATION
   FULL NAVIGATION + PROTOTYPE + GNSS LOSS
========================================================= */


/* =========================================================
   BACKEND
========================================================= */

// Replace this with your CURRENT backend Cloudflare URL.
const BACKEND_URL=
  "https://vyoma-navigate.onrender.com";


/* =========================================================
   GLOBAL STATE
========================================================= */

let map=null;

let routeCoordinates=[];
let routeSteps=[];

let routeLine=null;

let vehicleMarker=null;
let destinationMarker=null;
let startMarker=null;

let routeIndex=0;

let navigationRunning=false;
let navigationStarted=false;

let prototypeMode=false;
let selectedMode="real";

let gnssLost=false;

let prototypeTimer=null;
let deadReckoningTimer=null;

let gpsWatchId=null;

let currentPosition=null;
let lastRealPosition=null;
let lastDeadReckoningPosition=null;

let currentSpeed=0;
let currentHeading=0;

let prototypeSpeedKmh=30;
let prototypeDistanceMeters=0;

let driftMeters=0;
let mlEstimate=0;
let filterCorrection=0;

let imuBuffer=[];

let realSensorsStarted=false;
let orientationSensorsStarted=false;

let mlRequestRunning=false;
let realMotionLastTimestamp=0;

let drVelocityMps=0;
let drDistanceMeters=0;
let drStartPosition=null;

let recoveryErrorMeters=null;
let pendingGnssRecoveryReference=false;

let lastGnssTimestamp=0;
let gnssWatchdogTimer=null;

let lastIMUTimestamp=0;

let followVehicleEnabled=true;
let automaticZoomEnabled=true;

let activePanel="navigate";


/* =========================================================
   DOM
========================================================= */

const speedValue=
  document.getElementById("speedValue");

const headingValue=
  document.getElementById("headingValue");

const navStatus=
  document.getElementById("navStatus");

const modeTitle=
  document.getElementById("modeTitle");

const modeSubtitle=
  document.getElementById("modeSubtitle");

const modeIndicator=
  document.getElementById("modeIndicator");

const guidanceInstruction=
  document.getElementById("guidanceInstruction");

const guidanceDistance=
  document.getElementById("guidanceDistance");

const guidanceRoad=
  document.getElementById("guidanceRoad");

const headerStatus=
  document.getElementById("headerStatus");

const systemStatus=
  document.getElementById("systemStatus");

const routeStatus=
  document.getElementById("routeStatus");

const routeInfo=
  document.getElementById("routeInfo");

const distanceValue=
  document.getElementById("distanceValue");

const durationValue=
  document.getElementById("durationValue");

const remainingValue=
  document.getElementById("remainingValue");

const aiStatus=
  document.getElementById("aiStatus");

const driftValue=
  document.getElementById("driftValue");

const mlValue=
  document.getElementById("mlValue");

const correctionValue=
  document.getElementById("correctionValue");

const sampleValue=
  document.getElementById("sampleValue");

const processingFill=
  document.getElementById("processingFill");

const realImuStatus=
  document.getElementById("realImuStatus");

const axValue=
  document.getElementById("axValue");

const ayValue=
  document.getElementById("ayValue");

const azValue=
  document.getElementById("azValue");

const gxValue=
  document.getElementById("gxValue");

const gyValue=
  document.getElementById("gyValue");

const gzValue=
  document.getElementById("gzValue");

const fromInput=
  document.getElementById("fromInput");

const toInput=
  document.getElementById("toInput");

const bottomSheet=
  document.getElementById("bottomSheet");
/* =========================================================
   INITIALIZE MAP
========================================================= */

function initializeMap() {

  map = L.map("map", {
    zoomControl: false,
    attributionControl: true
  }).setView(
    [16.5062, 80.6480],
    13
  );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);

  // Tap/click anywhere on the map to set the destination.
  map.on("click", (event) => {
    setDestinationFromMap(event.latlng.lat, event.latlng.lng);
  });

}


/* =========================================================
   SVG VEHICLE
========================================================= */

function vehicleIcon(isLoss = false) {

  const color =
    isLoss
      ? "#ef4444"
      : "#2563eb";


  return L.divIcon({

    className: "vyoma-vehicle",

    iconSize: [42, 42],

    iconAnchor: [21, 21],

    html: `
      <div
        class="vehicle-marker ${isLoss ? "loss" : ""}"
        style="background:${color}"
      >

        <svg
          width="25"
          height="25"
          viewBox="0 0 24 24"
          fill="white"
        >
          <path d="
            M12 2
            L18 20
            L12 17
            L6 20
            Z
          "></path>
        </svg>

      </div>
    `
  });
}


function setVehicleIcon(isLoss) {

  if (!vehicleMarker) return;

  vehicleMarker.setIcon(
    vehicleIcon(isLoss)
  );

}


/* =========================================================
   DESTINATION ICON
========================================================= */

function destinationIcon() {

  return L.divIcon({

    className: "vyoma-vehicle",

    iconSize: [36, 36],

    iconAnchor: [18, 34],

    html: `
      <div style="
        width:30px;
        height:30px;
        border-radius:50% 50% 50% 0;
        background:#111827;
        border:3px solid white;
        transform:rotate(-45deg);
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 3px 12px rgba(0,0,0,.25);
      ">
        <div style="
          width:8px;
          height:8px;
          border-radius:50%;
          background:white;
        "></div>
      </div>
    `
  });

}


/* =========================================================
   MAP DESTINATION SELECTION
========================================================= */

function setDestinationFromMap(lat, lon) {

  const latitude = Number(lat);
  const longitude = Number(lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return;
  }

  const destination = [
    latitude,
    longitude
  ];

  // Keep the selected coordinates in the destination field.
  if (toInput) {

    toInput.value =
      `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  }

  // Replace the previous destination marker.
  if (destinationMarker) {

    destinationMarker.setLatLng(
      destination
    );

  } else {

    destinationMarker = L.marker(
      destination,
      {
        icon: destinationIcon(),
        title: "Selected destination"
      }
    ).addTo(map);

  }

  destinationMarker
    .bindPopup("Selected destination")
    .openPopup();

  // Show the destination clearly without automatically
  // starting navigation.
  if (systemStatus) {

    systemStatus.textContent =
      "Destination selected. Tap Calculate Route to continue.";

  }

  if (routeStatus) {

    routeStatus.textContent =
      `Destination: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  }

  if (
    window.innerWidth < 900 &&
    bottomSheet
  ) {

    bottomSheet.classList.remove(
      "hidden-sheet"
    );

  }

}


/* =========================================================
   CURRENT LOCATION
========================================================= */

function getCurrentLocation() {

  return new Promise((resolve, reject) => {

    if (!navigator.geolocation) {

      reject(
        new Error(
          "Geolocation is not supported."
        )
      );

      return;

    }

    navigator.geolocation.getCurrentPosition(

      position => {

        const {
          latitude,
          longitude,
          accuracy,
          speed,
          heading
        } = position.coords;

        const location = {
          lat: latitude,
          lon: longitude,
          accuracy: accuracy,
          speed: speed,
          heading: heading,
          timestamp: position.timestamp
        };

        resolve(location);

      },

      error => {

        let message =
          "Unable to get your current location.";

        if (
          error.code ===
          error.PERMISSION_DENIED
        ) {

          message =
            "Location permission was denied.";

        } else if (
          error.code ===
          error.POSITION_UNAVAILABLE
        ) {

          message =
            "Current location is unavailable.";

        } else if (
          error.code ===
          error.TIMEOUT
        ) {

          message =
            "Location request timed out.";

        }

        reject(
          new Error(message)
        );

      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }

    );

  });

}


/* =========================================================
   GEOLOCATION HELPERS
========================================================= */

function toRadians(degrees) {

  return degrees * Math.PI / 180;

}


function toDegrees(radians) {

  return radians * 180 / Math.PI;

}


function calculateDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const earthRadius = 6371000;

  const differenceLat =
    toRadians(lat2 - lat1);

  const differenceLon =
    toRadians(lon2 - lon1);

  const latitude1 =
    toRadians(lat1);

  const latitude2 =
    toRadians(lat2);

  const a =
    Math.sin(differenceLat / 2) *
    Math.sin(differenceLat / 2) +

    Math.cos(latitude1) *
    Math.cos(latitude2) *

    Math.sin(differenceLon / 2) *
    Math.sin(differenceLon / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;

}


function calculateBearing(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const latitude1 =
    toRadians(lat1);

  const latitude2 =
    toRadians(lat2);

  const differenceLon =
    toRadians(lon2 - lon1);

  const y =
    Math.sin(differenceLon) *
    Math.cos(latitude2);

  const x =
    Math.cos(latitude1) *
    Math.sin(latitude2) -

    Math.sin(latitude1) *
    Math.cos(latitude2) *
    Math.cos(differenceLon);

  const bearing =
    toDegrees(
      Math.atan2(y, x)
    );

  return (
    bearing + 360
  ) % 360;

}


/* =========================================================
   FORMAT HELPERS
========================================================= */

function formatDistance(distanceMeters) {

  if (
    !Number.isFinite(distanceMeters)
  ) {

    return "--";

  }

  if (
    distanceMeters < 1000
  ) {

    return `${Math.round(distanceMeters)} m`;

  }

  return `${(
    distanceMeters / 1000
  ).toFixed(1)} km`;

}


function formatDuration(seconds) {

  if (
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {

    return "--";

  }

  const minutes =
    Math.round(seconds / 60);

  if (
    minutes < 60
  ) {

    return `${minutes} min`;

  }

  const hours =
    Math.floor(minutes / 60);

  const remainingMinutes =
    minutes % 60;

  return `${hours} hr ${remainingMinutes} min`;

}


function formatSpeed(speedMps) {

  if (
    !Number.isFinite(speedMps)
  ) {

    return "0 km/h";

  }

  return `${(
    Math.max(0, speedMps) * 3.6
  ).toFixed(1)} km/h`;

}


/* =========================================================
   VEHICLE MARKER
========================================================= */

function updateVehicleMarker(
  latitude,
  longitude,
  isLoss = false
) {

  if (
    !map ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {

    return;

  }

  const position = [
    latitude,
    longitude
  ];

  if (vehicleMarker) {

    vehicleMarker.setLatLng(
      position
    );

    setVehicleIcon(
      isLoss
    );

  } else {

    vehicleMarker = L.marker(
      position,
      {
        icon: vehicleIcon(isLoss),
        title: "Current vehicle position"
      }
    ).addTo(map);

  }

  if (
    followVehicleEnabled
  ) {

    if (
      automaticZoomEnabled
    ) {

      map.setView(
        position,
        Math.max(
          map.getZoom(),
          15
        )
      );

    } else {

      map.panTo(
        position
      );

    }

  }

}


/* =========================================================
   LOCATION WATCH
========================================================= */

function startLocationWatch() {

  if (
    !navigator.geolocation
  ) {

    return;

  }

  if (
    gpsWatchId !== null
  ) {

    navigator.geolocation.clearWatch(
      gpsWatchId
    );

  }

  gpsWatchId =
    navigator.geolocation.watchPosition(

      position => {

        const {
          latitude,
          longitude,
          accuracy,
          speed,
          heading
        } = position.coords;

        currentPosition = {
          lat: latitude,
          lon: longitude,
          accuracy: accuracy,
          speed: speed,
          heading: heading,
          timestamp: position.timestamp
        };

        lastRealPosition =
          currentPosition;

        lastGnssTimestamp =
          Date.now();

        currentSpeed =
          Number.isFinite(speed)
            ? speed
            : 0;

        currentHeading =
          Number.isFinite(heading)
            ? heading
            : currentHeading;

        updateVehicleMarker(
          latitude,
          longitude,
          false
        );

        updateLocationUI();

        if (
          gnssLost
        ) {

          recoverFromGnssLoss();

        }

      },

      error => {

        handleLocationError(
          error
        );

      },

      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }

    );

}


/* =========================================================
   LOCATION UI
========================================================= */

function updateLocationUI() {

  if (
    speedValue
  ) {

    speedValue.textContent =
      formatSpeed(
        currentSpeed
      );

  }

  if (
    headingValue
  ) {

    headingValue.textContent =
      `${Math.round(
        currentHeading
      )}°`;

  }

  if (
    systemStatus &&
    !gnssLost
  ) {

    systemStatus.textContent =
      "GPS signal active.";

  }

  if (
    realImuStatus
  ) {

    realImuStatus.textContent =
      "Location updates active";

  }

}


function handleLocationError(
  error
) {

  if (
    !error
  ) {

    return;

  }

  if (
    error.code ===
    error.PERMISSION_DENIED
  ) {

    if (
      systemStatus
    ) {

      systemStatus.textContent =
        "Location permission denied.";

    }

    return;

  }

  if (
    error.code ===
    error.POSITION_UNAVAILABLE ||
    error.code ===
    error.TIMEOUT
  ) {

    enterGnssLossMode();

  }

}
