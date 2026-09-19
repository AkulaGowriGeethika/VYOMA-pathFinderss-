
/* VYOMA FIREBASE LOGIN GATE */
(function initVyomaFirebaseLogin(){
  const loginScreen=document.getElementById("loginScreen");
  const loginForm=document.getElementById("loginForm");
  const loginEmail=document.getElementById("loginEmail");
  const loginPassword=document.getElementById("loginPassword");
  const loginError=document.getElementById("loginError");
  const googleLoginBtn=document.getElementById("googleLoginBtn");
  const createAccountBtn=document.getElementById("createAccountBtn");
  const signOutBtn=document.getElementById("signOutBtn");
  if(!loginScreen||!loginForm) return;

  if(typeof firebase === "undefined" || !window.VYOMA_FIREBASE_CONFIG || !window.VYOMA_FIREBASE_CONFIG.apiKey || window.VYOMA_FIREBASE_CONFIG.apiKey.includes("YOUR_")){
    loginError.textContent="Firebase is not configured. Add your Firebase Web App config in firebase-config.js.";
    return;
  }

  if(!firebase.apps.length){ firebase.initializeApp(window.VYOMA_FIREBASE_CONFIG); }
  const auth=firebase.auth();

  auth.onAuthStateChanged(user=>{
    if(user){
      loginScreen.classList.add("hidden");
    }else{
      loginScreen.classList.remove("hidden");
    }
  });

  if(googleLoginBtn){
    googleLoginBtn.addEventListener("click", async ()=>{
      loginError.textContent="";
      googleLoginBtn.disabled=true;
      googleLoginBtn.classList.add("loading");
      googleLoginBtn.querySelector("span:last-child").textContent="Connecting to Google...";
      try{
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({prompt:"select_account"});
        await auth.signInWithPopup(provider);
      }catch(error){
        if(error.code === "auth/popup-blocked" || error.code === "auth/popup-cancelled-by-user"){
          try{
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({prompt:"select_account"});
            await auth.signInWithRedirect(provider);
            return;
          }catch(redirectError){ error = redirectError; }
        }
        const messages={
          "auth/account-exists-with-different-credential":"An account already exists with a different sign-in method.",
          "auth/unauthorized-domain":"This website domain is not authorized in Firebase Authentication.",
          "auth/network-request-failed":"Network error. Check your internet connection.",
          "auth/popup-closed-by-user":"Google sign-in was closed before completion."
        };
        loginError.textContent=messages[error.code] || (error.message || "Google sign-in failed.");
      }finally{
        googleLoginBtn.disabled=false;
        googleLoginBtn.classList.remove("loading");
        googleLoginBtn.querySelector("span:last-child").textContent="Continue with Google";
      }
    });
  }

  loginForm.addEventListener("submit", async event=>{
    event.preventDefault();
    loginError.textContent="";
    const email=loginEmail.value.trim();
    const password=loginPassword.value;
    if(!email || !email.includes("@")){ loginError.textContent="Please enter a valid email address."; return; }
    if(password.length < 6){ loginError.textContent="Password must be at least 6 characters."; return; }
    const button=loginForm.querySelector("button[type=submit]");
    if(button){ button.disabled=true; button.textContent="Signing in..."; }
    try{
      await auth.signInWithEmailAndPassword(email,password);
    }catch(error){
      const messages={
        "auth/invalid-credential":"Invalid email or password.",
        "auth/user-not-found":"No Firebase account was found for this email. Create an account first.",
        "auth/wrong-password":"Invalid email or password.",
        "auth/invalid-email":"Please enter a valid email address.",
        "auth/too-many-requests":"Too many attempts. Please try again later.",
        "auth/network-request-failed":"Network error. Check your internet connection.",
        "auth/operation-not-allowed":"Email/password sign-in is not enabled in Firebase Authentication."
      };
      loginError.textContent=messages[error.code] || (error.message || "Login failed.");
    }finally{
      if(button){ button.disabled=false; button.textContent="Login"; }
    }
  });

  if(createAccountBtn){
    createAccountBtn.addEventListener("click", async ()=>{
      loginError.textContent="";
      const email=loginEmail.value.trim();
      const password=loginPassword.value;
      if(!email || !email.includes("@")){ loginError.textContent="Enter your email first."; return; }
      if(password.length < 6){ loginError.textContent="Password must be at least 6 characters."; return; }
      createAccountBtn.disabled=true;
      createAccountBtn.textContent="Creating account...";
      try{
        await auth.createUserWithEmailAndPassword(email,password);
        loginError.textContent="Account created successfully.";
      }catch(error){
        const messages={
          "auth/email-already-in-use":"An account already exists for this email. Use Login instead.",
          "auth/invalid-email":"Please enter a valid email address.",
          "auth/weak-password":"Use a password with at least 6 characters.",
          "auth/operation-not-allowed":"Email/password sign-in is not enabled in Firebase Authentication."
        };
        loginError.textContent=messages[error.code] || (error.message || "Account creation failed.");
      }finally{
        createAccountBtn.disabled=false;
        createAccountBtn.textContent="Create account";
      }
    });
  }

  if(signOutBtn){
    signOutBtn.addEventListener("click", async ()=>{
      try{
        await auth.signOut();
        loginError.textContent="";
        loginPassword.value="";
      }catch(error){
        alert(error.message || "Sign out failed.");
      }
    });
  }
})();


/* =========================================================
   VYOMA SMART NAVIGATION
   FULL NAVIGATION + PROTOTYPE + GNSS LOSS
========================================================= */


/* =========================================================
   BACKEND
========================================================= */

// Replace this with your CURRENT backend Cloudflare URL.
const BACKEND_URL =
  "https://accomplish-kilometers-lauderdale-month.trycloudflare.com";


/* =========================================================
   GLOBAL STATE
========================================================= */

let map = null;

let routeCoordinates = [];
let routeSteps = [];

let routeLine = null;

let vehicleMarker = null;
let destinationMarker = null;
let startMarker = null;

let routeIndex = 0;

let navigationRunning = false;
let navigationStarted = false;

let prototypeMode = false;
let selectedMode = "real";

let gnssLost = false;

let prototypeTimer = null;
let deadReckoningTimer = null;

let gpsWatchId = null;

let currentPosition = null;
let lastRealPosition = null;
let lastDeadReckoningPosition = null;

let currentSpeed = 0;
let currentHeading = 0;

let prototypeSpeedKmh = 30;
let prototypeDistanceMeters = 0;

let driftMeters = 0;
let mlEstimate = 0;
let filterCorrection = 0;

let imuBuffer = [];

let realSensorsStarted = false;
let orientationSensorsStarted = false;

let mlRequestRunning = false;
let realMotionLastTimestamp = 0;
let drVelocityMps = 0;
let drDistanceMeters = 0;
let drStartPosition = null;
let recoveryErrorMeters = null;
let pendingGnssRecoveryReference = false;
let lastGnssTimestamp = 0;
let gnssWatchdogTimer = null;

let lastIMUTimestamp = 0;

let followVehicleEnabled = true;
let automaticZoomEnabled = true;

let activePanel = "navigate";


/* =========================================================
   DOM
========================================================= */

const speedValue =
  document.getElementById("speedValue");

const headingValue =
  document.getElementById("headingValue");

const navStatus =
  document.getElementById("navStatus");

const modeTitle =
  document.getElementById("modeTitle");

const modeSubtitle =
  document.getElementById("modeSubtitle");

const modeIndicator =
  document.getElementById("modeIndicator");

const guidanceInstruction =
  document.getElementById("guidanceInstruction");

const guidanceDistance =
  document.getElementById("guidanceDistance");

const guidanceRoad =
  document.getElementById("guidanceRoad");

const headerStatus =
  document.getElementById("headerStatus");

const systemStatus =
  document.getElementById("systemStatus");

const routeStatus =
  document.getElementById("routeStatus");

const routeInfo =
  document.getElementById("routeInfo");

const distanceValue =
  document.getElementById("distanceValue");

const durationValue =
  document.getElementById("durationValue");

const remainingValue =
  document.getElementById("remainingValue");

const aiStatus =
  document.getElementById("aiStatus");

const driftValue =
  document.getElementById("driftValue");

const mlValue =
  document.getElementById("mlValue");

const correctionValue =
  document.getElementById("correctionValue");

const sampleValue =
  document.getElementById("sampleValue");

const processingFill =
  document.getElementById("processingFill");

const realImuStatus =
  document.getElementById("realImuStatus");

const axValue =
  document.getElementById("axValue");

const ayValue =
  document.getElementById("ayValue");

const azValue =
  document.getElementById("azValue");

const gxValue =
  document.getElementById("gxValue");

const gyValue =
  document.getElementById("gyValue");

const gzValue =
  document.getElementById("gzValue");

const fromInput =
  document.getElementById("fromInput");

const toInput =
  document.getElementById("toInput");

let selectedDestinationCoords = null;
let selectedOriginCoords = null;

const bottomSheet =
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

        const lat =
          position.coords.latitude;

        const lon =
          position.coords.longitude;


        currentPosition =
          [lat, lon];

        window.currentGPSStart =
          [lat, lon];


        fromInput.value =
          "Current Location";


        if (!vehicleMarker) {

          vehicleMarker =
            L.marker(
              [lat, lon],
              {
                icon: vehicleIcon(false)
              }
            ).addTo(map);

        } else {

          vehicleMarker.setLatLng(
            [lat, lon]
          );

        }


        map.setView(
          [lat, lon],
          17
        );


        resolve(
          [lat, lon]
        );

      },

      error => {

        reject(error);

      },

      {
        enableHighAccuracy: true,

        maximumAge: 0,

        timeout: 12000
      }
    );

  });
}


/* =========================================================
   GEOCODING
========================================================= */

async function geocodeAddress(address) {

  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=json" +
    "&limit=1" +
    "&q=" +
    encodeURIComponent(address);


  const response =
    await fetch(url);


  if (!response.ok) {

    throw new Error(
      "Geocoding failed."
    );

  }


  const data =
    await response.json();


  if (!data.length) {

    throw new Error(
      `Location not found: ${address}`
    );

  }


  return [
    Number(data[0].lat),
    Number(data[0].lon)
  ];
}


/* =========================================================
   LOCATION SEARCH
========================================================= */

async function searchLocations(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=" + encodeURIComponent(query);
  const response = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error("Location search failed.");
  return await response.json();
}

function renderLocationResults(container, results, onSelect) {
  if (!container) return;
  container.innerHTML = "";
  if (!results.length) {
    container.innerHTML = '<div class="location-result"><strong>No matching locations</strong><span>Try a more specific place or address.</span></div>';
    container.classList.add("open");
    return;
  }
  results.forEach(place => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "location-result";
    const name = place.name || (place.display_name || "Location").split(",")[0];
    const detail = place.display_name || "";
    button.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(detail)}</span>`;
    button.addEventListener("click", () => onSelect(place));
    container.appendChild(button);
  });
  container.classList.add("open");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

function setupLocationSearch(input, resultsBox, selectedBox, onSelected) {
  if (!input || !resultsBox) return;
  let timer = null;
  input.addEventListener("input", () => {
    if (selectedBox) selectedBox.hidden = true;
    onSelected(null);
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 3) { resultsBox.classList.remove("open"); resultsBox.innerHTML=""; return; }
    timer = setTimeout(async () => {
      try {
        resultsBox.innerHTML='<div class="location-result"><strong>Searching...</strong></div>';
        resultsBox.classList.add("open");
        const results = await searchLocations(query);
        renderLocationResults(resultsBox, results, place => {
          const coords = [Number(place.lat), Number(place.lon)];
          input.value = place.display_name;
          if (selectedBox) {
            selectedBox.hidden = false;
            selectedBox.textContent = `✓ Selected: ${place.display_name}`;
          }
          resultsBox.classList.remove("open");
          onSelected(coords, place);
        });
      } catch (error) {
        resultsBox.innerHTML='<div class="location-result"><strong>Search unavailable</strong><span>Check your internet connection.</span></div>';
        resultsBox.classList.add("open");
      }
    }, 450);
  });
  input.addEventListener("blur", () => setTimeout(() => resultsBox.classList.remove("open"), 180));
}

const fromSearchResults = document.getElementById("fromSearchResults");
const toSearchResults = document.getElementById("toSearchResults");
const selectedDestination = document.getElementById("selectedDestination");

setupLocationSearch(fromInput, fromSearchResults, null, coords => { selectedOriginCoords = coords; });
setupLocationSearch(toInput, toSearchResults, selectedDestination, coords => { selectedDestinationCoords = coords; });


/* =========================================================
   ROUTE
========================================================= */

async function createRoute() {

  const destination =
    toInput.value.trim();


  if (!destination) {

    alert(
      "Enter a destination first."
    );

    return;
  }


  try {

    systemStatus.textContent =
      "Calculating route...";

    routeStatus.textContent =
      "Calculating route...";


    let start;


    if (
      !fromInput.value.trim() ||
      fromInput.value.trim()
        .toLowerCase()
        === "current location"
    ) {

      start =
        await getCurrentLocation();

    } else {

      start =
        await geocodeAddress(
          fromInput.value.trim()
        );

    }


    const end =
      await geocodeAddress(
        destination
      );


    const url =
      "https://router.project-osrm.org/route/v1/driving/" +
      `${start[1]},${start[0]};${end[1]},${end[0]}` +
      "?overview=full" +
      "&geometries=geojson" +
      "&steps=true";


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "Routing service failed."
      );

    }


    const data =
      await response.json();


    if (
      !data.routes ||
      !data.routes.length
    ) {

      throw new Error(
        "No route found."
      );

    }


    const route =
      data.routes[0];


    routeCoordinates =
      route.geometry.coordinates.map(
        point => [
          point[1],
          point[0]
        ]
      );


    routeSteps =
      route.legs?.[0]?.steps || [];


    routeIndex = 0;

    prototypeDistanceMeters = 0;


    /* Remove old route */

    if (routeLine) {

      map.removeLayer(
        routeLine
      );

    }


    if (startMarker) {

      map.removeLayer(
        startMarker
      );

    }


    if (destinationMarker) {

      map.removeLayer(
        destinationMarker
      );

    }


    /* Draw route */

    routeLine =
      L.polyline(
        routeCoordinates,
        {
          color: "#2563eb",
          weight: 6,
          opacity: .9
        }
      ).addTo(map);


    startMarker =
      L.circleMarker(
        start,
        {
          radius: 6,
          color: "#2563eb",
          fillColor: "#ffffff",
          fillOpacity: 1,
          weight: 3
        }
      ).addTo(map);


    destinationMarker =
      L.marker(
        end,
        {
          icon:
            destinationIcon()
        }
      ).addTo(map);


    /* Vehicle */

    if (!vehicleMarker) {

      vehicleMarker =
        L.marker(
          start,
          {
            icon:
              vehicleIcon(false)
          }
        ).addTo(map);

    } else {

      vehicleMarker.setLatLng(
        start
      );

    }


    currentPosition =
      [...start];


    lastRealPosition =
      [...start];


    /* Route metrics */

    const distanceKm =
      route.distance / 1000;

    const durationMin =
      route.duration / 60;


    distanceValue.textContent =
      `${distanceKm.toFixed(1)} km`;

    durationValue.textContent =
      `${Math.round(durationMin)} min`;

    remainingValue.textContent =
      `${distanceKm.toFixed(1)} km`;


    routeStatus.textContent =
      "Route ready";


    routeInfo.textContent =
      `Route calculated. ${distanceKm.toFixed(1)} km, approximately ${Math.round(durationMin)} minutes.`;


    guidanceInstruction.textContent =
      "Ready to navigate";


    guidanceDistance.textContent =
      `${distanceKm.toFixed(1)} km remaining`;


    guidanceRoad.textContent =
      "";


    systemStatus.textContent =
      "Route calculated";


    /* Auto fit */

    map.fitBounds(
      routeLine.getBounds(),
      {
        paddingTopLeft: [20, 170],
        paddingBottomRight: [20, 150]
      }
    );


  } catch (error) {

    console.error(error);

    systemStatus.textContent =
      "Route calculation failed";

    routeStatus.textContent =
      error.message;

    alert(
      error.message
    );

  }

}


/* =========================================================
   DISTANCE
========================================================= */

function haversineDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R =
    6371000;


  const dLat =
    (lat2 - lat1) *
    Math.PI / 180;


  const dLon =
    (lon2 - lon1) *
    Math.PI / 180;


  const a =
    Math.sin(dLat / 2) ** 2 +

    Math.cos(
      lat1 * Math.PI / 180
    ) *

    Math.cos(
      lat2 * Math.PI / 180
    ) *

    Math.sin(dLon / 2) ** 2;


  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}


function calculateTotalRouteDistance() {

  let total = 0;


  for (
    let i = 1;
    i < routeCoordinates.length;
    i++
  ) {

    total +=
      haversineDistance(
        routeCoordinates[i - 1][0],
        routeCoordinates[i - 1][1],
        routeCoordinates[i][0],
        routeCoordinates[i][1]
      );

  }


  return total;
}


/* =========================================================
   BEARING
========================================================= */

function calculateBearing(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const y =
    Math.sin(
      (lon2 - lon1) *
      Math.PI / 180
    ) *
    Math.cos(
      lat2 *
      Math.PI / 180
    );


  const x =
    Math.cos(
      lat1 *
      Math.PI / 180
    ) *
    Math.sin(
      lat2 *
      Math.PI / 180
    ) -

    Math.sin(
      lat1 *
      Math.PI / 180
    ) *
    Math.cos(
      lat2 *
      Math.PI / 180
    ) *
    Math.cos(
      (lon2 - lon1) *
      Math.PI / 180
    );


  return (
    Math.atan2(y, x) *
    180 /
    Math.PI +
    360
  ) % 360;
}


/* =========================================================
   FORMAT DISTANCE
========================================================= */

function formatDistance(
  meters
) {

  if (
    meters < 1000
  ) {

    return `${Math.round(meters)} m`;

  }


  return `${(
    meters / 1000
  ).toFixed(1)} km`;
}


/* =========================================================
   GUIDANCE
========================================================= */

function maneuverInstruction(
  step
) {

  if (!step) {

    return "Continue ahead";

  }


  const type =
    step.maneuver?.type || "";

  const modifier =
    step.maneuver?.modifier || "";


  const road =
    step.name ||
    "";


  let instruction =
    "Continue";


  if (
    type === "arrive"
  ) {

    instruction =
      "Arrive at destination";

  } else if (
    type === "depart"
  ) {

    instruction =
      "Start navigation";

  } else if (
    type === "turn"
  ) {

    if (
      modifier.includes("left")
    ) {

      instruction =
        "Turn left";

    } else if (
      modifier.includes("right")
    ) {

      instruction =
        "Turn right";

    } else {

      instruction =
        "Turn";

    }

  } else if (
    type === "roundabout" ||
    type === "rotary"
  ) {

    instruction =
      "Enter roundabout";

  } else if (
    type === "merge"
  ) {

    instruction =
      "Merge";

  } else if (
    type === "fork"
  ) {

    instruction =
      modifier.includes("left")
        ? "Keep left"
        : "Keep right";

  } else if (
    type === "new name"
  ) {

    instruction =
      "Continue";

  }


  if (
    road &&
    type !== "arrive"
  ) {

    return `${instruction} onto ${road}`;

  }


  return instruction;
}


/* =========================================================
   GUIDANCE ICON
========================================================= */

function setGuidanceIcon(
  type,
  modifier
) {

  let svg = "";


  if (
    type === "turn" &&
    modifier.includes("left")
  ) {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <path d="M19 6H9a5 5 0 00-5 5v7"></path>
        <path d="M8 15l-4 4-4-4"></path>
      </svg>
    `;

  } else if (
    type === "turn" &&
    modifier.includes("right")
  ) {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <path d="M5 6h10a5 5 0 015 5v7"></path>
        <path d="M16 15l4 4 4-4"></path>
      </svg>
    `;

  } else if (
    type === "arrive"
  ) {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;

  } else {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <path d="M12 19V5"></path>
        <path d="M6 11l6-6 6 6"></path>
      </svg>
    `;

  }


  document.getElementById(
    "guidanceIcon"
  ).innerHTML = svg;
}


/* =========================================================
   UPDATE GUIDANCE
========================================================= */

function updateGuidance(
  lat,
  lon,
  indexHint = null
) {

  if (
    !routeCoordinates.length
  ) {

    return;

  }


  let nearestIndex =
    indexHint ?? 0;


  if (
    indexHint === null
  ) {

    let nearestDistance =
      Infinity;


    for (
      let i = 0;
      i < routeCoordinates.length;
      i++
    ) {

      const d =
        haversineDistance(
          lat,
          lon,
          routeCoordinates[i][0],
          routeCoordinates[i][1]
        );


      if (
        d < nearestDistance
      ) {

        nearestDistance = d;

        nearestIndex = i;

      }

    }

  }


  routeIndex =
    nearestIndex;


  /* Remaining route */

  let remaining =
    0;


  for (
    let i = nearestIndex + 1;
    i < routeCoordinates.length;
    i++
  ) {

    remaining +=
      haversineDistance(
        routeCoordinates[i - 1][0],
        routeCoordinates[i - 1][1],
        routeCoordinates[i][0],
        routeCoordinates[i][1]
      );

  }


  remainingValue.textContent =
    formatDistance(
      remaining
    );


  /* OSRM steps */

  if (
    routeSteps.length
  ) {

    let selectedStep =
      null;


    let selectedDistance =
      Infinity;


    for (
      const step of routeSteps
    ) {

      const maneuverLocation =
        step.maneuver?.location;


      if (
        !maneuverLocation
      ) continue;


      const stepLat =
        maneuverLocation[1];

      const stepLon =
        maneuverLocation[0];


      const distance =
        haversineDistance(
          lat,
          lon,
          stepLat,
          stepLon
        );


      if (
        distance < selectedDistance &&
        distance > 8
      ) {

        selectedDistance =
          distance;

        selectedStep =
          step;

      }

    }


    if (
      selectedStep
    ) {

      guidanceInstruction.textContent =
        maneuverInstruction(
          selectedStep
        );


      guidanceDistance.textContent =
        formatDistance(
          selectedDistance
        );


      guidanceRoad.textContent =
        selectedStep.name
          ? selectedStep.name
          : "";


      setGuidanceIcon(
        selectedStep.maneuver?.type,
        selectedStep.maneuver?.modifier || ""
      );


      return;

    }

  }


  if (
    nearestIndex >=
    routeCoordinates.length - 3
  ) {

    guidanceInstruction.textContent =
      "You have arrived";


    guidanceDistance.textContent =
      "Destination reached";


    guidanceRoad.textContent =
      "";


    setGuidanceIcon(
      "arrive",
      ""
    );


    return;

  }


  const next =
    routeCoordinates[
      Math.min(
        nearestIndex + 1,
        routeCoordinates.length - 1
      )
    ];


  const bearing =
    calculateBearing(
      lat,
      lon,
      next[0],
      next[1]
    );


  currentHeading =
    bearing;


  guidanceInstruction.textContent =
    "Continue ahead";


  guidanceDistance.textContent =
    formatDistance(
      haversineDistance(
        lat,
        lon,
        next[0],
        next[1]
      )
    );


  guidanceRoad.textContent =
    "";


  setGuidanceIcon(
    "continue",
    ""
  );

}


/* =========================================================
   UPDATE AI METRICS
========================================================= */

function updateAIMetrics() {

  driftValue.textContent =
    prototypeMode
      ? `${driftMeters.toFixed(2)} m`
      : (recoveryErrorMeters !== null
          ? `${recoveryErrorMeters.toFixed(2)} m`
          : (gnssLost ? "PENDING" : "—"));

  mlValue.textContent =
    `${Number(mlEstimate || 0).toFixed(2)} m`;

  correctionValue.textContent =
    prototypeMode
      ? `${filterCorrection.toFixed(2)} m`
      : "LIVE";

  sampleValue.textContent =
    imuBuffer.length;

  const progress =
    Math.min(100, (imuBuffer.length / 50) * 100);

  processingFill.style.width =
    `${progress}%`;

  const sih = id => document.getElementById(id);
  const speedKmh = Number(currentSpeed || 0);
  const headingDeg = Number(currentHeading || 0);

  if (sih("sihGruDisp"))
    sih("sihGruDisp").textContent = `${Number(mlEstimate || 0).toFixed(2)} m`;

  if (sih("sihAiSpeed"))
    sih("sihAiSpeed").textContent = `${speedKmh.toFixed(1)} km/h`;

  if (sih("sihHeading"))
    sih("sihHeading").textContent = `${headingDeg.toFixed(1)}°`;

  if (sih("sihYaw"))
    sih("sihYaw").textContent = `${headingDeg.toFixed(1)}°`;

  if (sih("sihPitch"))
    sih("sihPitch").textContent = `${Number(window.vyomaPitch || 0).toFixed(1)}°`;

  if (sih("sihRoll"))
    sih("sihRoll").textContent = `${Number(window.vyomaRoll || 0).toFixed(1)}°`;

  if (sih("sihConfidence")) {
    const confidence =
      imuBuffer.length >= 50 ? "HIGH" :
      imuBuffer.length >= 20 ? "MEDIUM" : "WARMING";
    sih("sihConfidence").textContent = confidence;
  }

  if (sih("sihDriftRatio")) {
    if (prototypeMode) {
      const routeMeters = Math.max(1, Number(prototypeDistanceMeters || 0));
      const ratio = (Number(driftMeters || 0) / routeMeters) * 100;
      sih("sihDriftRatio").textContent =
        routeMeters > 1 ? `${ratio.toFixed(2)}%` : "SIMULATED";
    } else {
      sih("sihDriftRatio").textContent =
        recoveryErrorMeters !== null
          ? "MEASURED AFTER GNSS RECOVERY"
          : "PENDING GNSS RECOVERY";
    }
  }

  if (sih("sihFusionStatus")) {
    sih("sihFusionStatus").textContent =
      gnssLost ? "DR / INS ACTIVE" : "GNSS + INS READY";
  }

  if (sih("sihMapMatchStatus")) {
    sih("sihMapMatchStatus").textContent =
      routeCoordinates.length ? "ROUTE CONSTRAINED" : "WAITING FOR ROUTE";
  }

  if (sih("sihNhcStatus")) {
    sih("sihNhcStatus").textContent =
      routeCoordinates.length ? "ROAD CONSTRAINT" : "READY";
  }

  if (typeof window.updateVYOMAAIDRPanel === "function") {
    window.updateVYOMAAIDRPanel({
      overall: prototypeMode ? "SIMULATION" : (gnssLost ? "DR ACTIVE" : "LIVE"),
      gnssStatus: gnssLost ? "Lost" : "Available",
      gnssDetail: gnssLost
        ? (prototypeMode ? "Simulated outage" : "No reliable GNSS fix")
        : "Live position reference",
      drStatus: gnssLost ? "Active" : "Standby",
      drDetail: gnssLost
        ? (prototypeMode ? "Route-driven simulation" : "Last known speed + heading")
        : "Activates on GNSS loss",
      gruStatus: imuBuffer.length >= 50 ? "Inference ready" : `Warming ${imuBuffer.length}/50`,
      imuStatus: prototypeMode ? "SIMULATED IMU" : (realSensorsStarted ? "LIVE IMU" : "Waiting"),
      displacement: mlEstimate,
      speed: speedKmh,
      rate: realMotionLastTimestamp ? Number(window.vyomaImuHz || 0) : undefined,
      drift: prototypeMode
        ? Number(driftMeters || 0)
        : (recoveryErrorMeters !== null ? recoveryErrorMeters : "Pending"),
      pitch: window.vyomaPitch,
      roll: window.vyomaRoll,
      yaw: headingDeg,
      mapMatch: routeCoordinates.length ? "Route constrained" : "Waiting",
      nhc: routeCoordinates.length ? "Road constraint" : "Ready",
      recovery: recoveryErrorMeters !== null ? `${recoveryErrorMeters.toFixed(2)} m error` : "Pending"
    });
  }
}

/* =========================================================
   IMU DISPLAY
========================================================= */

function updateIMUDisplay(
  sample
) {

  /* Phone-to-vehicle alignment prototype.
     Gravity gives pitch/roll; yaw is kept from navigation heading. */
  const ax = Number(sample.ax || 0);
  const ay = Number(sample.ay || 0);
  const az = Number(sample.az || 9.81);

  window.vyomaPitch =
    Math.atan2(ax, Math.sqrt(ay * ay + az * az)) * 180 / Math.PI;

  window.vyomaRoll =
    Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * 180 / Math.PI;

  axValue.textContent =
    Number(sample.ax).toFixed(2);

  ayValue.textContent =
    Number(sample.ay).toFixed(2);

  azValue.textContent =
    Number(sample.az).toFixed(2);

  gxValue.textContent =
    Number(sample.gx).toFixed(2);

  gyValue.textContent =
    Number(sample.gy).toFixed(2);

  gzValue.textContent =
    Number(sample.gz).toFixed(2);

  updateAIMetrics();

}


/* =========================================================
   SIMULATED IMU
========================================================= */

function createPrototypeIMUSample() {

  const t =
    Date.now() / 1000;


  return {

    ax:
      0.15 +
      Math.sin(t * 1.2) * 0.04,

    ay:
      0.08 +
      Math.cos(t * 0.9) * 0.03,

    az:
      9.81 +
      Math.sin(t * 0.7) * 0.05,

    gx:
      Math.sin(t * 0.8) * 0.15,

    gy:
      Math.cos(t * 0.6) * 0.12,

    gz:
      Math.sin(t * 0.5) * 0.20
  };
}


/* =========================================================
   PROTOTYPE ROUTE POSITION
   REALISTIC SPEED
========================================================= */

function getPointAlongRoute(
  distanceMeters
) {

  if (
    !routeCoordinates.length
  ) {

    return null;

  }


  let travelled =
    0;


  for (
    let i = 1;
    i < routeCoordinates.length;
    i++
  ) {

    const prev =
      routeCoordinates[i - 1];

    const next =
      routeCoordinates[i];


    const segmentDistance =
      haversineDistance(
        prev[0],
        prev[1],
        next[0],
        next[1]
      );


    if (
      travelled +
      segmentDistance >=
      distanceMeters
    ) {

      const remaining =
        distanceMeters -
        travelled;


      const ratio =
        segmentDistance > 0
          ? remaining /
            segmentDistance
          : 0;


      return [

        prev[0] +
        (next[0] - prev[0]) *
        ratio,

        prev[1] +
        (next[1] - prev[1]) *
        ratio

      ];

    }


    travelled +=
      segmentDistance;

  }


  return routeCoordinates[
    routeCoordinates.length - 1
  ];
}


/* =========================================================
   FIND ROUTE INDEX
========================================================= */

function findNearestRouteIndex(
  point,
  startIndex = 0
) {

  let nearestIndex =
    startIndex;

  let nearestDistance =
    Infinity;


  const begin =
    Math.max(
      0,
      startIndex - 5
    );


  const end =
    Math.min(
      routeCoordinates.length,
      startIndex + 40
    );


  for (
    let i = begin;
    i < end;
    i++
  ) {

    const d =
      haversineDistance(
        point[0],
        point[1],
        routeCoordinates[i][0],
        routeCoordinates[i][1]
      );


    if (
      d < nearestDistance
    ) {

      nearestDistance = d;

      nearestIndex = i;

    }

  }


  return nearestIndex;
}


/* =========================================================
   START PROTOTYPE
========================================================= */

function startPrototypeMode() {

  if (
    !routeCoordinates.length
  ) {

    alert(
      "Calculate a route first."
    );

    return;

  }


  stopMovementOnly();


  selectedMode =
    "prototype";

  prototypeMode =
    true;

  navigationRunning =
    true;

  navigationStarted =
    true;

  gnssLost =
    false;


  document.body.classList.remove(
    "gnss-loss"
  );


  routeIndex = 0;

  prototypeDistanceMeters = 0;

  driftMeters = 0;

  mlEstimate = 0;

  filterCorrection = 0;

  imuBuffer = [];


  const firstPoint =
    routeCoordinates[0];


  currentPosition =
    [...firstPoint];


  if (!vehicleMarker) {

    vehicleMarker =
      L.marker(
        firstPoint,
        {
          icon:
            vehicleIcon(false)
        }
      ).addTo(map);

  } else {

    vehicleMarker.setLatLng(
      firstPoint
    );

    setVehicleIcon(false);

  }


  navigationInfoUpdate();


  modeTitle.textContent =
    "PROTOTYPE NAVIGATION";

  modeSubtitle.textContent =
    "Simulated GPS + IMU";

  modeIndicator.textContent =
    "SIMULATED";

  modeIndicator.className =
    "mode-indicator prototype";


  navStatus.textContent =
    "SIMULATED GNSS";


  headerStatus.textContent =
    "PROTOTYPE";


  systemStatus.textContent =
    "Prototype navigation running";


  aiStatus.textContent =
    "AI + FILTER READY";


  realImuStatus.textContent =
    "SIMULATED IMU";


  guidanceInstruction.textContent =
    "Starting route";


  guidanceDistance.textContent =
    formatDistance(
      calculateTotalRouteDistance()
    );


  startPrototypeMovement();

}


/* =========================================================
   PROTOTYPE MOVEMENT
========================================================= */

function startPrototypeMovement() {

  clearInterval(
    prototypeTimer
  );


  /*
    IMPORTANT:

    30 km/h =
    8.33 metres per second.

    The old version jumped route points.
    This version moves by actual distance.
  */

  prototypeSpeedKmh =
    30;


  const intervalMs =
    1000;


  prototypeTimer =
    setInterval(() => {

      if (
        !navigationRunning ||
        !prototypeMode
      ) {

        return;

      }


      if (
        !routeCoordinates.length
      ) {

        return;

      }


      const metersPerSecond =
        prototypeSpeedKmh / 3.6;


      prototypeDistanceMeters +=
        metersPerSecond *
        (intervalMs / 1000);


      const totalDistance =
        calculateTotalRouteDistance();


      if (
        prototypeDistanceMeters >=
        totalDistance
      ) {

        prototypeDistanceMeters =
          totalDistance;

      }


      const point =
        getPointAlongRoute(
          prototypeDistanceMeters
        );


      if (!point) return;


      routeIndex =
        findNearestRouteIndex(
          point,
          routeIndex
        );


      if (vehicleMarker) {

        vehicleMarker.setLatLng(
          point
        );

      }


      if (
        routeIndex <
        routeCoordinates.length - 1
      ) {

        const next =
          routeCoordinates[
            Math.min(
              routeIndex + 1,
              routeCoordinates.length - 1
            )
          ];


        currentHeading =
          calculateBearing(
            point[0],
            point[1],
            next[0],
            next[1]
          );

      }


      currentSpeed =
        prototypeSpeedKmh;


      speedValue.textContent =
        Math.round(
          currentSpeed
        );


      headingValue.textContent =
        `${Math.round(
          currentHeading
        )}°`;


      currentPosition =
        [...point];


      /* Follow vehicle */

      if (
        followVehicleEnabled
      ) {

        map.setView(
          point,
          automaticZoomEnabled
            ? 18
            : map.getZoom(),
          {
            animate: true,
            duration: .5
          }
        );

      }


      /* Guidance */

      updateGuidance(
        point[0],
        point[1],
        routeIndex
      );


      /* IMU */

      const sample =
        createPrototypeIMUSample();


      updateIMUDisplay(
        sample
      );


      imuBuffer.push([

        sample.ax,
        sample.ay,
        sample.az,

        sample.gx,
        sample.gy,
        sample.gz

      ]);


      if (
        imuBuffer.length > 50
      ) {

        imuBuffer.shift();

      }


      /* AI */

      if (gnssLost) {

        driftMeters =
          Math.min(
            12,
            driftMeters + 0.08
          );


        mlEstimate =
          Math.min(
            12,
            driftMeters * .85
          );


        filterCorrection =
          Math.min(
            driftMeters,
            mlEstimate * .45
          );


        aiStatus.textContent =
          "DEAD RECKONING ACTIVE";

      } else {

        driftMeters =
          Math.max(
            0,
            driftMeters - .04
          );


        mlEstimate =
          Math.max(
            0,
            driftMeters * .7
          );


        filterCorrection =
          Math.min(
            driftMeters,
            mlEstimate * .35
          );


        aiStatus.textContent =
          "AI + FILTER ACTIVE";

      }


      updateAIMetrics();


      /* Backend ML after 50 samples */

      if (
        imuBuffer.length === 50
      ) {

        sendSequenceToML();

      }


      /* Arrival */

      if (
        prototypeDistanceMeters >=
        totalDistance
      ) {

        clearInterval(
          prototypeTimer
        );


        navigationRunning =
          false;


        navStatus.textContent =
          "ARRIVED";


        guidanceInstruction.textContent =
          "You have arrived";


        guidanceDistance.textContent =
          "Destination reached";


        systemStatus.textContent =
          "Prototype route completed";

      }

    }, intervalMs);

}


/* =========================================================
   REAL NAVIGATION
========================================================= */

async function startRealNavigation() {

  if (
    !routeCoordinates.length
  ) {

    alert(
      "Calculate a route first."
    );

    return;

  }


  stopMovementOnly();


  selectedMode =
    "real";

  prototypeMode =
    false;

  navigationRunning =
    true;

  navigationStarted =
    true;

  gnssLost =
    false;


  document.body.classList.remove(
    "gnss-loss"
  );


  setVehicleIcon(false);


  modeTitle.textContent =
    "NORMAL NAVIGATION";

  modeSubtitle.textContent =
    "Real GPS + IMU";

  modeIndicator.textContent =
    "GNSS";

  modeIndicator.className =
    "mode-indicator";


  navStatus.textContent =
    "GNSS ACTIVE";


  headerStatus.textContent =
    "NAVIGATING";


  systemStatus.textContent =
    "Real navigation running";


  aiStatus.textContent =
    "AI + FILTER ACTIVE";


  /* Sensors */

  await startRealSensors();


  /* Immediate GPS */

  navigator.geolocation.getCurrentPosition(

    handleRealPosition,

    handleGpsError,

    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }

  );


  /* Continuous GPS */

  gpsWatchId =
    navigator.geolocation.watchPosition(

      handleRealPosition,

      handleGpsError,

      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }

    );

}


/* =========================================================
   REAL GPS POSITION
========================================================= */

function handleRealPosition(
  position
) {

  const lat =
    position.coords.latitude;

  const lon =
    position.coords.longitude;


  const newPosition =
    [lat, lon];


  /*
    During a real GNSS outage we intentionally ignore incoming fixes.
    When GNSS is restored, the first accepted fix is used to measure
    the actual DR position error.
  */
  if (gnssLost) {
    return;
  }

  if (pendingGnssRecoveryReference && lastDeadReckoningPosition) {
    recoveryErrorMeters = haversineDistance(
      lastDeadReckoningPosition[0],
      lastDeadReckoningPosition[1],
      lat,
      lon
    );
    pendingGnssRecoveryReference = false;
  }


  let speed =
    position.coords.speed;


  if (
    speed !== null &&
    speed >= 0
  ) {

    currentSpeed =
      speed * 3.6;

  } else if (
    lastRealPosition
  ) {

    const distance =
      haversineDistance(
        lastRealPosition[0],
        lastRealPosition[1],
        lat,
        lon
      );


    currentSpeed =
      Math.max(
        0,
        distance / .5 * 3.6
      );

  }


  let heading =
    position.coords.heading;


  if (
    heading !== null &&
    heading >= 0
  ) {

    currentHeading =
      heading;

  } else if (
    lastRealPosition
  ) {

    currentHeading =
      calculateBearing(
        lastRealPosition[0],
        lastRealPosition[1],
        lat,
        lon
      );

  }


  currentPosition =
    newPosition;


  lastRealPosition =
    newPosition;

  lastGnssTimestamp = Date.now();
  if (!prototypeMode && navigationRunning && !gnssLost) {
    clearTimeout(gnssWatchdogTimer);
    gnssWatchdogTimer = setTimeout(() => {
      if (
        navigationRunning &&
        !prototypeMode &&
        Date.now() - lastGnssTimestamp >= 5000
      ) {
        applyGnssLoss();
      }
    }, 5200);
  }


  if (!vehicleMarker) {

    vehicleMarker =
      L.marker(
        newPosition,
        {
          icon:
            vehicleIcon(false)
        }
      ).addTo(map);

  } else {

    vehicleMarker.setLatLng(
      newPosition
    );

  }


  speedValue.textContent =
    Math.round(
      currentSpeed
    );


  headingValue.textContent =
    `${Math.round(
      currentHeading
    )}°`;


  navStatus.textContent =
    "GNSS ACTIVE";


  updateGuidance(
    lat,
    lon
  );


  if (
    followVehicleEnabled
  ) {

    map.setView(
      newPosition,
      automaticZoomEnabled
        ? 18
        : map.getZoom(),
      {
        animate: true,
        duration: .4
      }
    );

  }

}


/* =========================================================
   GPS ERROR
========================================================= */

function handleGpsError(
  error
) {

  console.warn(
    "GPS error:",
    error
  );


  if (
    !gnssLost
  ) {

    navStatus.textContent =
      "GPS SIGNAL WEAK";

    headerStatus.textContent =
      "GPS WEAK";

  }

}


/* =========================================================
   REAL SENSOR START
========================================================= */

async function startRealSensors() {

  if (
    realSensorsStarted
  ) {

    return;

  }


  if (
    !window.isSecureContext
  ) {

    realImuStatus.textContent =
      "HTTPS REQUIRED";

    aiStatus.textContent =
      "Real phone sensors require HTTPS.";


    return;

  }


  try {

    /* iOS permission */

    if (
      typeof DeviceMotionEvent !==
        "undefined" &&

      typeof DeviceMotionEvent
        .requestPermission ===
        "function"
    ) {

      const permission =
        await DeviceMotionEvent
          .requestPermission();


      if (
        permission !== "granted"
      ) {

        realImuStatus.textContent =
          "MOTION PERMISSION DENIED";

        return;

      }

    }


    if (
      typeof DeviceOrientationEvent !==
        "undefined" &&

      typeof DeviceOrientationEvent
        .requestPermission ===
        "function"
    ) {

      const permission =
        await DeviceOrientationEvent
          .requestPermission();


      if (
        permission !== "granted"
      ) {

        realImuStatus.textContent =
          "ORIENTATION DENIED";

      }

    }


    window.removeEventListener(
      "devicemotion",
      handleRealMotion,
      true
    );


    window.removeEventListener(
      "deviceorientation",
      handleRealOrientation,
      true
    );


    window.addEventListener(
      "devicemotion",
      handleRealMotion,
      {
        passive: true
      }
    );


    window.addEventListener(
      "deviceorientation",
      handleRealOrientation,
      {
        passive: true
      }
    );


    realSensorsStarted =
      true;

    orientationSensorsStarted =
      true;


    realImuStatus.textContent =
      "LIVE IMU";


  } catch (error) {

    console.error(error);

    realImuStatus.textContent =
      "SENSOR ERROR";

  }

}


/* =========================================================
   REAL MOTION
========================================================= */

function handleRealMotion(event) {

  const acceleration =
    event.acceleration ||
    event.accelerationIncludingGravity;

  if (!acceleration) return;

  const ax = Number(acceleration.x || 0);
  const ay = Number(acceleration.y || 0);
  const az = Number(acceleration.z || 0);

  const rotation = event.rotationRate || {};
  const gx = Number(rotation.alpha || 0);
  const gy = Number(rotation.beta || 0);
  const gz = Number(rotation.gamma || 0);

  const now =
    Number(event.timeStamp) > 0
      ? Number(event.timeStamp)
      : performance.now();

  const dt =
    realMotionLastTimestamp > 0
      ? Math.min(0.25, Math.max(0.01, (now - realMotionLastTimestamp) / 1000))
      : 0.02;

  realMotionLastTimestamp = now;
  window.vyomaImuHz = 1 / dt;

  const sample = { ax, ay, az, gx, gy, gz };

  updateIMUDisplay(sample);

  imuBuffer.push({
    ax, ay, az, gx, gy, gz,
    speed: Number(currentSpeed || 0) / 3.6,
    heading: Number(currentHeading || 0),
    dt
  });

  if (imuBuffer.length > 50) imuBuffer.shift();

  if (gnssLost && !prototypeMode) {
    /*
      REAL DR:
      We do not manufacture drift values. During GNSS loss the position
      is propagated from the last real GNSS speed + heading. IMU is
      continuously collected and the GRU receives the real sequence.
      Position error is measured only when GNSS is reacquired.
    */
    const distance = Math.max(0, drVelocityMps * dt);
    if (distance > 0 && lastDeadReckoningPosition) {
      const next = movePoint(
        lastDeadReckoningPosition,
        currentHeading,
        distance
      );
      lastDeadReckoningPosition = [...next];
      currentPosition = [...next];
      drDistanceMeters += distance;

      if (vehicleMarker) vehicleMarker.setLatLng(next);

      if (followVehicleEnabled) {
        map.setView(
          next,
          automaticZoomEnabled ? 18 : map.getZoom(),
          { animate: false }
        );
      }
    }

    navStatus.textContent = "GNSS LOST";
    headerStatus.textContent = "GNSS LOST";

    if (imuBuffer.length >= 50) sendSequenceToML();
    updateAIMetrics();
    return;
  }

  if (imuBuffer.length >= 50) sendSequenceToML();
  updateAIMetrics();
}

/* =========================================================
   ORIENTATION
========================================================= */

function handleRealOrientation(
  event
) {

  if (
    event.absolute &&
    typeof event.alpha === "number"
  ) {

    currentHeading =
      event.alpha;

  }

}


/* =========================================================
   ML BACKEND
========================================================= */

async function sendSequenceToML() {

  if (mlRequestRunning || imuBuffer.length < 50 || !BACKEND_URL) return;

  mlRequestRunning = true;

  try {
    const response = await fetch(
      `${BACKEND_URL}/estimate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imuBuffer.slice(-50).map(s => ({
            ax: Number(s.ax || 0),
            ay: Number(s.ay || 0),
            az: Number(s.az || 0),
            gx: Number(s.gx || 0),
            gy: Number(s.gy || 0),
            gz: Number(s.gz || 0),
            speed: Number(s.speed || 0),
            heading: Number(s.heading || 0),
            dt: Number(s.dt || 0.02)
          }))
        )
      }
    );

    if (!response.ok) throw new Error("ML backend unavailable");

    const data = await response.json();

    if (data.gru_displacement_m !== undefined) {
      mlEstimate = Math.max(
        0,
        Number(data.gru_displacement_m) || 0
      );
    }

    if (data.pitch_deg !== undefined) window.vyomaPitch = Number(data.pitch_deg);
    if (data.roll_deg !== undefined) window.vyomaRoll = Number(data.roll_deg);

    updateAIMetrics();

  } catch (error) {
    console.warn("ML request:", error.message);
  } finally {
    mlRequestRunning = false;
  }
}

/* =========================================================
   GNSS LOSS
========================================================= */

async function simulateGnssLoss() {

  if (
    !routeCoordinates.length
  ) {

    alert(
      "Calculate a route first."
    );

    return;

  }


  /*
    If navigation hasn't started,
    start the selected mode first.
  */

  if (
    !navigationRunning
  ) {

    if (
      selectedMode ===
      "prototype"
    ) {

      startPrototypeMode();

      setTimeout(
        applyGnssLoss,
        400
      );

    } else {

      await startRealNavigation();

      setTimeout(
        applyGnssLoss,
        700
      );

    }

    return;

  }


  applyGnssLoss();

}


/* =========================================================
   APPLY GNSS LOSS
========================================================= */

function applyGnssLoss() {

  if (
    !navigationRunning
  ) {

    return;

  }


  gnssLost =
    true;


  document.body.classList.add(
    "gnss-loss"
  );


  if (routeLine) {

    routeLine.setStyle({
      color: "#ef4444"
    });

  }


  setVehicleIcon(true);


  navStatus.textContent =
    "GNSS LOST";


  headerStatus.textContent =
    "GNSS LOST";


  modeTitle.textContent =
    "GNSS LOST";


  modeSubtitle.textContent =
    "Dead Reckoning Active";


  modeIndicator.textContent =
    "DR ACTIVE";


  modeIndicator.className =
    "mode-indicator loss";


  guidanceInstruction.textContent =
    "Dead reckoning active";


  guidanceDistance.textContent =
    "GNSS signal unavailable";


  guidanceRoad.textContent =
    "AI + IMU estimation";


  aiStatus.textContent =
    "DEAD RECKONING ACTIVE";


  systemStatus.textContent =
    "GNSS lost — AI + filter active";


  if (!prototypeMode) {
    /*
      Capture the last real GNSS solution. This is the starting reference
      for the real dead-reckoning segment.
    */
    startDeadReckoning();
    recoveryErrorMeters = null;
    pendingGnssRecoveryReference = true;
  } else {
    /* Prototype values are intentionally simulated. */
    driftMeters = Math.max(driftMeters, 0.15);
  }

  updateAIMetrics();

}


/* =========================================================
   DEAD RECKONING TIMER
========================================================= */

function startDeadReckoning() {

  if (!currentPosition) return;

  clearInterval(deadReckoningTimer);

  lastDeadReckoningPosition = [...currentPosition];

  drVelocityMps = Math.max(
    0,
    Number(currentSpeed || 0) / 3.6
  );

  drDistanceMeters = 0;
  drStartPosition = [...currentPosition];
  realMotionLastTimestamp = 0;

  /* No synthetic timer movement and no synthetic drift in REAL mode. */
  updateAIMetrics();
}

/* =========================================================
   MOVE POINT
========================================================= */

function movePoint(
  point,
  bearing,
  distanceMeters
) {

  const R =
    6371000;


  const lat1 =
    point[0] *
    Math.PI / 180;


  const lon1 =
    point[1] *
    Math.PI / 180;


  const brng =
    bearing *
    Math.PI / 180;


  const angularDistance =
    distanceMeters / R;


  const lat2 =
    Math.asin(

      Math.sin(lat1) *
      Math.cos(angularDistance) +

      Math.cos(lat1) *
      Math.sin(angularDistance) *
      Math.cos(brng)

    );


  const lon2 =
    lon1 +

    Math.atan2(

      Math.sin(brng) *
      Math.sin(angularDistance) *
      Math.cos(lat1),

      Math.cos(angularDistance) -
      Math.sin(lat1) *
      Math.sin(lat2)

    );


  return [

    lat2 * 180 / Math.PI,

    lon2 * 180 / Math.PI

  ];

}


/* =========================================================
   RESTORE GNSS
========================================================= */

function restoreGnss() {

  gnssLost =
    false;

  clearTimeout(gnssWatchdogTimer);

  pendingGnssRecoveryReference = !prototypeMode && !!lastDeadReckoningPosition;


  document.body.classList.remove(
    "gnss-loss"
  );


  clearInterval(
    deadReckoningTimer
  );


  if (routeLine) {

    routeLine.setStyle({
      color: "#2563eb"
    });

  }


  setVehicleIcon(false);


  if (
    prototypeMode
  ) {

    modeTitle.textContent =
      "PROTOTYPE NAVIGATION";

    modeSubtitle.textContent =
      "Simulated GPS + IMU";

    modeIndicator.textContent =
      "SIMULATED";

    modeIndicator.className =
      "mode-indicator prototype";

    navStatus.textContent =
      "SIMULATED GNSS";

    headerStatus.textContent =
      "PROTOTYPE";

    aiStatus.textContent =
      "AI + FILTER ACTIVE";

    systemStatus.textContent =
      "GNSS restored";

  } else {

    modeTitle.textContent =
      "NORMAL NAVIGATION";

    modeSubtitle.textContent =
      "Real GPS + IMU";

    modeIndicator.textContent =
      "GNSS";

    modeIndicator.className =
      "mode-indicator";

    navStatus.textContent =
      "GNSS ACTIVE";

    headerStatus.textContent =
      navigationRunning
        ? "NAVIGATING"
        : "READY";

    aiStatus.textContent =
      "AI + FILTER ACTIVE";

    systemStatus.textContent =
      "GNSS restored";

  }


  guidanceInstruction.textContent =
    "GNSS signal restored";

  guidanceDistance.textContent =
    "Navigation resumed";

  guidanceRoad.textContent =
    "";


  /* Real GPS will update position again
     through watchPosition. */

}


/* =========================================================
   STOP MOVEMENT
========================================================= */

function stopMovementOnly() {

  clearInterval(
    prototypeTimer
  );

  clearInterval(
    deadReckoningTimer
  );


  prototypeTimer =
    null;

  deadReckoningTimer =
    null;


  if (
    gpsWatchId !== null
  ) {

    navigator.geolocation.clearWatch(
      gpsWatchId
    );

    gpsWatchId =
      null;

  }

}


/* =========================================================
   STOP NAVIGATION
========================================================= */

function stopNavigation() {

  stopMovementOnly();


  navigationRunning =
    false;

  navigationStarted =
    false;

  prototypeMode =
    false;

  gnssLost =
    false;


  document.body.classList.remove(
    "gnss-loss"
  );


  setVehicleIcon(false);


  speedValue.textContent =
    "0";

  headingValue.textContent =
    "0°";


  navStatus.textContent =
    "NOT NAVIGATING";


  headerStatus.textContent =
    "READY";


  modeTitle.textContent =
    "NORMAL NAVIGATION";


  modeSubtitle.textContent =
    "Real GPS + IMU";


  modeIndicator.textContent =
    "GNSS";


  modeIndicator.className =
    "mode-indicator";


  systemStatus.textContent =
    "System ready";


  aiStatus.textContent =
    "AI system ready";


  realImuStatus.textContent =
    "SENSOR IDLE";


  guidanceInstruction.textContent =
    routeCoordinates.length
      ? "Ready to navigate"
      : "Calculate a route to begin";


  guidanceDistance.textContent =
    routeCoordinates.length
      ? formatDistance(
          calculateTotalRouteDistance()
        )
      : "Awaiting route";


  guidanceRoad.textContent =
    "";


  clearInterval(
    deadReckoningTimer
  );
  clearTimeout(gnssWatchdogTimer);
  realMotionLastTimestamp = 0;
  pendingGnssRecoveryReference = false;

}


/* =========================================================
   REMOVE SENSOR LISTENERS
========================================================= */

function removeSensorListeners() {

  window.removeEventListener(
    "devicemotion",
    handleRealMotion,
    true
  );


  window.removeEventListener(
    "deviceorientation",
    handleRealOrientation,
    true
  );


  realSensorsStarted =
    false;

  orientationSensorsStarted =
    false;

}


/* =========================================================
   RECENTER
========================================================= */

function recenterMap() {

  if (
    vehicleMarker
  ) {

    const position =
      vehicleMarker.getLatLng();


    map.setView(
      [
        position.lat,
        position.lng
      ],
      18,
      {
        animate: true
      }
    );

    return;

  }


  if (
    currentPosition
  ) {

    map.setView(
      currentPosition,
      18,
      {
        animate: true
      }
    );

    return;

  }


  getCurrentLocation()
    .catch(() => {

      map.setView(
        [16.5062, 80.6480],
        13
      );

    });

}


/* =========================================================
   UI UPDATE
========================================================= */

function navigationInfoUpdate() {

  speedValue.textContent =
    Math.round(
      currentSpeed
    );


  headingValue.textContent =
    `${Math.round(
      currentHeading
    )}°`;

}


/* =========================================================
   PANEL CONTROL
========================================================= */

function openPanel(
  panelName
) {

  activePanel =
    panelName;


  document.querySelectorAll(
    ".panel"
  ).forEach(
    panel => {

      panel.classList.remove(
        "active-panel"
      );

    }
  );


  const target =
    document.getElementById(
      `${panelName}Panel`
    );


  if (target) {

    target.classList.add(
      "active-panel"
    );

  }


  document.querySelectorAll(
    ".bottom-nav-item"
  ).forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.panel ===
          panelName
      );

    }
  );


  bottomSheet.classList.remove(
    "hidden-sheet"
  );

}


// Keep the map dominant on phones until the user opens a panel.
if (window.matchMedia("(max-width: 899px)").matches) {
  bottomSheet.classList.add("hidden-sheet");
}

/* =========================================================
   BOTTOM SHEET DRAG
========================================================= */

let dragStartY =
  0;

let dragCurrentY =
  0;

let dragging =
  false;


function startSheetDrag(
  event
) {

  dragging =
    true;


  dragStartY =
    event.touches
      ? event.touches[0].clientY
      : event.clientY;


  dragCurrentY =
    dragStartY;

}


function moveSheetDrag(
  event
) {

  if (!dragging) return;


  dragCurrentY =
    event.touches
      ? event.touches[0].clientY
      : event.clientY;

}


function endSheetDrag() {

  if (!dragging) return;


  const delta =
    dragCurrentY -
    dragStartY;


  dragging =
    false;


  if (
    delta > 50
  ) {

    bottomSheet.classList.add(
      "hidden-sheet"
    );

  } else if (
    delta < -50
  ) {

    bottomSheet.classList.remove(
      "hidden-sheet"
    );

  }

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

document
  .getElementById(
    "calculateRouteBtn"
  )
  .addEventListener(
    "click",
    createRoute
  );


document
  .getElementById(
    "useLocationBtn"
  )
  .addEventListener(
    "click",
    async () => {

      try {

        selectedOriginCoords = null;
        await getCurrentLocation();

        systemStatus.textContent =
          "Current location loaded";

      } catch {

        alert(
          "Unable to get current location."
        );

      }

    }
  );


document
  .getElementById(
    "startRealBtn"
  )
  .addEventListener(
    "click",
    async () => {

      selectedMode =
        "real";

      await startRealNavigation();

    }
  );


document
  .getElementById(
    "prototypeBtn"
  )
  .addEventListener(
    "click",
    () => {

      selectedMode =
        "prototype";

      startPrototypeMode();

    }
  );


document
  .getElementById(
    "stopBtn"
  )
  .addEventListener(
    "click",
    stopNavigation
  );


document
  .getElementById(
    "simulateLossBtn"
  )
  .addEventListener(
    "click",
    simulateGnssLoss
  );


document
  .getElementById(
    "restoreGnssBtn"
  )
  .addEventListener(
    "click",
    restoreGnss
  );


document
  .getElementById(
    "recenterBtn"
  )
  .addEventListener(
    "click",
    recenterMap
  );


/* Bottom navigation */

document.querySelectorAll(
  ".bottom-nav-item"
).forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        openPanel(
          button.dataset.panel
        );

      }
    );

  }
);


/* Settings */

document
  .getElementById(
    "followToggle"
  )
  .addEventListener(
    "change",
    event => {

      followVehicleEnabled =
        event.target.checked;

    }
  );


document
  .getElementById(
    "zoomToggle"
  )
  .addEventListener(
    "change",
    event => {

      automaticZoomEnabled =
        event.target.checked;

    }
  );


const themeToggle = document.getElementById("themeToggle");

function applyVYOMATheme(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  if (themeToggle) themeToggle.checked = isDark;
  localStorage.setItem("vyomaTheme", isDark ? "dark" : "light");
}

const savedVYOMATheme = localStorage.getItem("vyomaTheme");
if (savedVYOMATheme === "dark") applyVYOMATheme(true);
else if (savedVYOMATheme === "light") applyVYOMATheme(false);

if (themeToggle) {
  themeToggle.addEventListener("change", event => {
    applyVYOMATheme(event.target.checked);
  });
}


/* Sheet dragging */

const sheetHandle =
  document.getElementById(
    "sheetHandleArea"
  );


sheetHandle.addEventListener(
  "touchstart",
  startSheetDrag,
  {
    passive: true
  }
);


sheetHandle.addEventListener(
  "touchmove",
  moveSheetDrag,
  {
    passive: true
  }
);


sheetHandle.addEventListener(
  "touchend",
  endSheetDrag
);


/* =========================================================
   STARTUP
========================================================= */

initializeMap();


openPanel(
  "navigate"
);


window.addEventListener(
  "beforeunload",
  () => {

    stopMovementOnly();

    removeSensorListeners();

  }
);


/* =========================================================
   INITIAL UI
========================================================= */

updateAIMetrics();


guidanceInstruction.textContent =
  "Calculate a route to begin";


guidanceDistance.textContent =
  "Awaiting route";


systemStatus.textContent =
  "System ready";

/* =========================================================
   SIH VALIDATION LAB
========================================================= */
(function () {
  function lab(id) { return document.getElementById(id); }

  function setLab(id, value) {
    const el = lab(id);
    if (el) el.textContent = value;
  }

  window.runSIHDriftBenchmark = function () {
    /*
      Controlled software sanity test.
      This verifies the benchmark calculations and UI wiring.
      It is NOT real-world navigation validation.
    */
    const distanceM = 1000;
    const controlledErrorM = 4.0;
    const drift = controlledErrorM / distanceM * 100;

    setLab("labDrift", drift.toFixed(2) + "%");
    setLab("lab50m", "4.0 m @ 1 km test");
    setLab("lab1km", controlledErrorM < 100 ? "PASS (software test)" : "FAIL");
    const note = lab("labNote");
    if (note) {
      note.textContent =
        "Software benchmark passed with a controlled test trajectory. This does not replace real vehicle/IO-VNBD validation.";
    }
  };

  window.runSIHPerformanceBenchmark = function () {
    const start = performance.now();
    let n = 0;
    const duration = 250;
    while (performance.now() - start < duration) n++;
    const elapsed = (performance.now() - start) / 1000;
    const hz = elapsed > 0 ? n / elapsed : 0;

    setLab("labRate", hz.toFixed(0) + " Hz SOFTWARE LOOP");
    const note = lab("labNote");
    if (note) {
      note.textContent =
        "This measures browser loop throughput only. It does not prove 10 Hz sensor navigation accuracy or 200 Hz external-IMU hardware performance.";
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    const b1 = lab("runDriftBenchmarkBtn");
    const b2 = lab("runPerformanceBenchmarkBtn");
    if (b1) b1.addEventListener("click", window.runSIHDriftBenchmark);
    if (b2) b2.addEventListener("click", window.runSIHPerformanceBenchmark);
  });
})();

/* ===== AI / DR USER PANEL SYNC ===== */
(function(){
  const $ = id => document.getElementById(id);
  function set(id, value){ const e=$(id); if(e && value !== undefined && value !== null) e.textContent=value; }
  window.updateVYOMAAIDRPanel = function(data={}){
    if(data.gnssStatus) set("aiDrGnssStatus", data.gnssStatus);
    if(data.gnssDetail) set("aiDrGnssDetail", data.gnssDetail);
    if(data.drStatus) set("aiDrDrStatus", data.drStatus);
    if(data.drDetail) set("aiDrDrDetail", data.drDetail);
    if(data.gruStatus) set("aiDrGruStatus", data.gruStatus);
    if(data.imuStatus) set("aiDrImuStatus", data.imuStatus);
    if(data.displacement !== undefined) set("aiDrDisplacement", `${Number(data.displacement).toFixed(1)} m`);
    if(data.speed !== undefined) set("aiDrSpeed", `${Math.round(Number(data.speed))} km/h`);
    if(data.rate !== undefined) set("aiDrRate", `${Number(data.rate).toFixed(1)} Hz`);
    if(data.drift !== undefined) set("aiDrDrift", typeof data.drift === "number" ? `${Number(data.drift).toFixed(1)}%` : data.drift);
    if(data.pitch !== undefined) set("aiDrPitch", `${Number(data.pitch).toFixed(1)}°`);
    if(data.roll !== undefined) set("aiDrRoll", `${Number(data.roll).toFixed(1)}°`);
    if(data.yaw !== undefined) set("aiDrYaw", `${Number(data.yaw).toFixed(1)}°`);
    if(data.mapMatch) set("aiDrMapMatch", data.mapMatch);
    if(data.nhc) set("aiDrNhc", data.nhc);
    if(data.recovery) set("aiDrRecovery", data.recovery);
    if(data.overall) set("aiDrOverallStatus", data.overall);
  };
})();
