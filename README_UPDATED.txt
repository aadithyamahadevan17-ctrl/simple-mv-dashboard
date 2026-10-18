SIMPLE MV — Downtime Navigation Update

Changes in this version:
- Preserved the existing production dashboard UI and layout.
- Added top navigation for Production Dashboard and Downtime Analysis.
- Moved the downtime-by-reason chart and history to a separate page to avoid scrolling on the dashboard.
- Added a Logout button at the top right. It confirms before clearing the current session counters and downtime records.
- Logout now displays a dedicated screen with only a Login button; Login reloads into a clean session.
- The production dashboard remains mounted while Downtime Analysis is shown, keeping the video element and webcam stream attached during navigation.
- Existing R-key downtime popup and localStorage session persistence are retained.

Run in VS Code:
1. Extract this ZIP.
2. Open this folder in VS Code.
3. Run: npm install
4. Run: npm run dev

Note: node_modules and dist are not included; npm install restores dependencies.


PHONE CONTROL AND GITHUB PAGES
- When a fault stops the machine, use the on-screen "Open Downtime Record (R)" button on a phone/tablet. It triggers the same downtime dialog as pressing R on a keyboard.
- To publish: push this project to a GitHub repository on the main branch, then open Settings > Pages and choose GitHub Actions as the deployment source. The included .github/workflows/deploy.yml builds and deploys on each push.
- After the workflow succeeds, open the Pages URL shown in the GitHub Actions deployment.
- Important: GitHub Pages hosts only the frontend. A camera connected to the factory computer is not automatically streamed to a remote phone by publishing the site. The camera stays attached to the computer running the app; remote viewing/control requires a separately secured camera-streaming or local-network solution. Do not expose an industrial camera or control endpoint publicly without authentication and network security.
