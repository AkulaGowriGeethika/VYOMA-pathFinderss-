# VYOMA Cloud Deployment

## Backend
Recommended first deployment: Render Web Service using the `backend/` Dockerfile.

Render settings:
- Service type: Web Service
- Runtime: Docker
- Root Directory: `backend`
- Health Check Path: `/health`
- The Dockerfile reads Render's `PORT` automatically.

After deployment, Render gives a permanent HTTPS `onrender.com` URL.

## Frontend
Deploy `frontend/` as a Static Site on Render (or another static host).

Before deploying the frontend, edit:
`frontend/backend-config.js`

Replace:
`https://REPLACE-WITH-YOUR-VYOMA-API.onrender.com`

with the actual backend URL.

## Firebase
Add the final frontend hostname to Firebase Authentication -> Authorized domains.

## Important
The free Render web service can spin down after inactivity, so the first request after idle time may be delayed. For truly always-on production use, select a paid service or another always-on host.

## Android
Once the backend is permanent, the same frontend can be packaged into the Android app. The app should point to the same permanent backend URL.
