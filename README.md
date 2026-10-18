# SIMPLE MV — Downtime Navigation

## Run locally
1. Install Node.js (current LTS recommended).
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm run dev` and open the local URL printed by Vite.

## Recent fixes
- Logging out clears the production counters and downtime log, then shows a dedicated screen with only **Login**.
- Selecting **Login** reloads the application into a clean session.
- Production Dashboard stays mounted when switching to Downtime Analysis, so the camera video element and its `srcObject` are not discarded during navigation.

The browser still requires permission to access the webcam. After logging in, start the live camera again if needed.
