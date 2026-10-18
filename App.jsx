import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

/**
 * Colour Sorting Monitoring System
 * Simplified, white-themed single-page React application.
 */
export default function App() {
  // --------------------------------------------------------------------------
  // Core State
  // --------------------------------------------------------------------------
  const [isStopped, setIsStopped] = useState(() => localStorage.getItem('mv_isStopped') === 'true');
  const [machineStatus, setMachineStatus] = useState(() => localStorage.getItem('mv_isStopped') === 'true' ? 'STOPPED' : 'RUNNING'); // 'RUNNING' | 'STOPPED'
  const [downtimeOpen, setDowntimeOpen] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [selectedDowntimeReason, setSelectedDowntimeReason] = useState('');
  const [downtimeLog, setDowntimeLog] = useState(() => { try { return JSON.parse(localStorage.getItem('mv_downtimeLog') || '[]'); } catch { return []; } });
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Number(localStorage.getItem('mv_sessionStartedAt')) || Date.now());
  
  // Production Counters
  const [redCount, setRedCount] = useState(() => Number(localStorage.getItem('mv_redCount')) || 0);
  const [greenCount, setGreenCount] = useState(() => Number(localStorage.getItem('mv_greenCount')) || 0);
  const [blueCount, setBlueCount] = useState(() => Number(localStorage.getItem('mv_blueCount')) || 0);
  const [consecutiveRed, setConsecutiveRed] = useState(0);

  // Latest Detection Info
  const [lastDetection, setLastDetection] = useState(null);

  // Active Fault State: { code: string, message: string, timestamp: string } | null
  const [activeFault, setActiveFault] = useState(() => { try { return JSON.parse(localStorage.getItem('mv_activeFault') || 'null'); } catch { return null; } });

  // Live Camera Detection State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [liveObjectInView, setLiveObjectInView] = useState(null); // 'Red' | 'Green' | 'Blue' | null

  // --------------------------------------------------------------------------
  // Refs for Continuous Fault Tracking & Locks
  // --------------------------------------------------------------------------
  const isStoppedRef = useRef(false);
  isStoppedRef.current = isStopped;

  // Session start time (for 10s grace period)
  const sessionStartTimeRef = useRef(Number(localStorage.getItem('mv_sessionStartedAt')) || Date.now());
  const stoppedAtRef = useRef(Number(localStorage.getItem('mv_stoppedAt')) || (localStorage.getItem('mv_isStopped') === 'true' ? Date.now() : null));
  
  // Last detection timestamp (for 10s timeout fault)
  const lastDetectionTimeRef = useRef(Date.now());

  // Object in view tracking (for single count & 5s jam fault)
  const objectInViewRef = useRef(null);
  const objectInViewSinceRef = useRef(null);

  // Video & Canvas refs for Camera Mode
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // --------------------------------------------------------------------------
  // Stop & Fault Lock Logic (Requirement 4 & 5)
  // --------------------------------------------------------------------------
  const triggerFault = useCallback((code, message, customTime) => {
    // If already stopped, ignore subsequent triggers
    if (isStoppedRef.current) return;

    const timeStr = customTime || new Date().toLocaleTimeString();

    // Lock system state
    isStoppedRef.current = true;
    setIsStopped(true);
    setMachineStatus('STOPPED');
    const fault = { code, message, timestamp: timeStr };
    setActiveFault(fault);
    stoppedAtRef.current = Date.now();
    localStorage.setItem('mv_stoppedAt', String(stoppedAtRef.current));
    localStorage.setItem('mv_isStopped', 'true');
    localStorage.setItem('mv_activeFault', JSON.stringify(fault));
  }, []);

  // --------------------------------------------------------------------------
  // Register Object Detection (Requirement 3 & 4)
  // --------------------------------------------------------------------------
  const registerDetection = useCallback((color, source) => {
    // Strict Guard: Ignore all detections when machine is stopped
    if (isStoppedRef.current) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString();

    // Update last activity timestamp to prevent timeout fault
    lastDetectionTimeRef.current = Date.now();

    // Update counters and check 5 consecutive red objects rule
    if (color === 'Red') {
      setRedCount((prev) => prev + 1);
      setConsecutiveRed((prevStreak) => {
        const nextStreak = prevStreak + 1;
        // Fault Rule 1: 5 Consecutive Red Objects
        if (nextStreak >= 5) {
          triggerFault('DEFECT_FAULT', 'DEFECT FAULT — 5 CONSECUTIVE RED OBJECTS', timeStr);
        }
        return nextStreak;
      });
    } else {
      // Non-red object resets consecutive red streak
      setConsecutiveRed(0);
      if (color === 'Green') {
        setGreenCount((prev) => prev + 1);
      } else if (color === 'Blue') {
        setBlueCount((prev) => prev + 1);
      }
    }

    // Update live detection display
    setLastDetection({
      color,
      source,
      timestamp: timeStr,
    });
  }, [triggerFault]);

  // --------------------------------------------------------------------------
  // Fault Rule 2: 10-Second Inactivity Timeout Supervisor
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isLoggedIn) return;
    const timer = setInterval(() => {
      // Do nothing if already stopped
      if (isStoppedRef.current) return;

      const now = Date.now();
      // Startup Grace Period check: allow 10 seconds before monitoring begins
      const timeSinceSessionStart = now - sessionStartTimeRef.current;
      if (timeSinceSessionStart < 10000) {
        return; // Still within startup grace period
      }

      // Check time elapsed since last detection
      const timeSinceLastDetection = now - lastDetectionTimeRef.current;
      if (timeSinceLastDetection >= 10000) {
        triggerFault('TIMEOUT_FAULT', 'TIMEOUT FAULT — NO OBJECT DETECTED FOR 10 SECONDS');
      }
    }, 500);

    return () => clearInterval(timer);
  }, [triggerFault, isLoggedIn]);

  // --------------------------------------------------------------------------
  // Fault Rule 3: Inspection Area Jam Supervisor (> 5 seconds in view)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isLoggedIn) return;
    const jamTimer = setInterval(() => {
      if (isStoppedRef.current) return;

      if (objectInViewRef.current && objectInViewSinceRef.current) {
        const durationInView = Date.now() - objectInViewSinceRef.current;
        if (durationInView >= 5000) {
          triggerFault('JAM_FAULT', 'JAM WARNING — OBJECT REMAINING IN INSPECTION AREA');
        }
      }
    }, 300);

    return () => clearInterval(jamTimer);
  }, [triggerFault, isLoggedIn]);

  // Shared action for the physical R key and the mobile on-screen control.
  const openDowntimeDialog = () => {
    if (!isStoppedRef.current) return;
    const reason = activeFault?.code === 'DEFECT_FAULT' ? 'Defective parts / consecutive red objects'
      : activeFault?.code === 'TIMEOUT_FAULT' ? 'No object detected / production timeout'
      : activeFault?.code === 'JAM_FAULT' ? 'Object jam in inspection area' : 'Machine fault';
    setSelectedDowntimeReason(reason);
    setDowntimeOpen(true);
  };

  // R opens the downtime dialog while stopped; it does not reload the page.
  useEffect(() => {
    if (!isLoggedIn) return;
    const handleKeyDown = (event) => {
      if ((event.key || '').toLowerCase() === 'r' && isStoppedRef.current && !event.repeat) {
        const target = event.target;
        if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
        event.preventDefault();
        openDowntimeDialog();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFault, isLoggedIn]);

  // Persist live session values so a page refresh does not erase production data.
  useEffect(() => {
    localStorage.setItem('mv_redCount', String(redCount));
    localStorage.setItem('mv_greenCount', String(greenCount));
    localStorage.setItem('mv_blueCount', String(blueCount));
    localStorage.setItem('mv_isStopped', String(isStopped));
    localStorage.setItem('mv_activeFault', JSON.stringify(activeFault));
    localStorage.setItem('mv_downtimeLog', JSON.stringify(downtimeLog));
    localStorage.setItem('mv_sessionStartedAt', String(sessionStartedAt));
  }, [redCount, greenCount, blueCount, isStopped, activeFault, downtimeLog, sessionStartedAt]);

  const saveDowntime = () => {
    const start = stoppedAtRef.current || Date.now();
    const durationSeconds = Math.max(0, Math.round((Date.now() - start) / 1000));
    setDowntimeLog((previous) => [...previous, {
      id: `${Date.now()}-${previous.length}`, reason: selectedDowntimeReason || 'Other',
      fault: activeFault?.message || 'Machine stopped', startTime: new Date(start).toLocaleString(),
      durationSeconds,
    }]);
    // R confirms the downtime record and resumes monitoring without clearing production totals.
    setDowntimeOpen(false);
    setIsStopped(false);
    setMachineStatus('RUNNING');
    setActiveFault(null);
    setConsecutiveRed(0);
    isStoppedRef.current = false;
    stoppedAtRef.current = null;
    localStorage.removeItem('mv_stoppedAt');
    localStorage.setItem('mv_isStopped', 'false');
    localStorage.removeItem('mv_activeFault');
    lastDetectionTimeRef.current = Date.now();
  };

  const logoutSession = () => {
    if (!window.confirm('Logout and reset all production and downtime data to zero?')) return;
    ['mv_redCount','mv_greenCount','mv_blueCount','mv_isStopped','mv_activeFault','mv_downtimeLog','mv_sessionStartedAt','mv_stoppedAt'].forEach((key) => localStorage.removeItem(key));
    setRedCount(0); setGreenCount(0); setBlueCount(0); setConsecutiveRed(0);
    setIsStopped(false); setMachineStatus('RUNNING'); setActiveFault(null); setDowntimeLog([]);
    setLastDetection(null); setDowntimeOpen(false);
    const now = Date.now(); setSessionStartedAt(now); sessionStartTimeRef.current = now;
    lastDetectionTimeRef.current = now; stoppedAtRef.current = null; isStoppedRef.current = false;
    // Release the webcam on logout; login starts a fresh application session.
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraError(null);
    setLiveObjectInView(null);
    objectInViewRef.current = null;
    objectInViewSinceRef.current = null;
    setActivePage('dashboard');
    setIsLoggedIn(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam access is not supported by your browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(err.message || 'Unable to access camera.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    objectInViewRef.current = null;
    objectInViewSinceRef.current = null;
    setLiveObjectInView(null);
  };

  // Process frames from webcam
  useEffect(() => {
    if (!isLoggedIn || !cameraActive) return;

    const interval = setInterval(() => {
      if (isStoppedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Draw center 140x140 inspection area onto canvas
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = 140;
      canvas.height = 140;

      const sx = Math.floor((width - 140) / 2);
      const sy = Math.floor((height - 140) / 2);
      ctx.drawImage(video, sx, sy, 140, 140, 0, 0, 140, 140);

      const frameData = ctx.getImageData(0, 0, 140, 140).data;
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      const pixelCount = frameData.length / 4;

      for (let i = 0; i < frameData.length; i += 4) {
        totalR += frameData[i];
        totalG += frameData[i + 1];
        totalB += frameData[i + 2];
      }

      const avgR = totalR / pixelCount;
      const avgG = totalG / pixelCount;
      const avgB = totalB / pixelCount;

      // Color classification based on RGB dominance and saturation
      let detectedColor = null;
      const thresholdDiff = 25; // minimum difference to classify as distinct color

      if (avgR > 100 && avgR > avgG + thresholdDiff && avgR > avgB + thresholdDiff) {
        detectedColor = 'Red';
      } else if (avgG > 90 && avgG > avgR + thresholdDiff && avgG > avgB + thresholdDiff) {
        detectedColor = 'Green';
      } else if (avgB > 100 && avgB > avgR + thresholdDiff && avgB > avgG + thresholdDiff) {
        detectedColor = 'Blue';
      }

      setLiveObjectInView(detectedColor);

      // Edge-triggered counting: count only once when object enters view
      if (detectedColor !== null) {
        if (objectInViewRef.current === null) {
          // New object arrived
          objectInViewRef.current = detectedColor;
          objectInViewSinceRef.current = Date.now();
          registerDetection(detectedColor, 'LIVE CAMERA');
        } else if (objectInViewRef.current !== detectedColor) {
          // Color changed to another object
          objectInViewRef.current = detectedColor;
          objectInViewSinceRef.current = Date.now();
          registerDetection(detectedColor, 'LIVE CAMERA');
        }
        // If same color remains, do not count again!
      } else {
        // Object has left inspection area
        objectInViewRef.current = null;
        objectInViewSinceRef.current = null;
      }
    }, 100);

    return () => clearInterval(interval);
  }, [cameraActive, registerDetection, isLoggedIn]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Total count computed
  const totalCount = redCount + greenCount + blueCount;

  if (!isLoggedIn) {
    return (
      <main className="login-screen">
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">Colour Sorting Monitoring System</h1>
          <p>You have been logged out. Select Login to start a fresh session.</p>
          <button type="button" className="login-button" onClick={() => window.location.reload()}>
            Login
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard-container">
      {/* ------------------------------------------------------------------ */}
      {/* Header with Title and Machine Status                                */}
      {/* ------------------------------------------------------------------ */}
      <header className="dashboard-header">
        <div className="header-titles">
          <h1>Colour Sorting Monitoring System</h1>
          <p className="subtitle">Live Colour Detection & Fault Supervision</p>
        </div>
        <div className="header-actions">
          <div className={`status-badge ${machineStatus.toLowerCase()}`}>
            <span className="status-dot"></span>
            <span>STATUS: {machineStatus}</span>
          </div>
          {isStopped && (
            <button
              type="button"
              className="mobile-downtime-button"
              onClick={openDowntimeDialog}
              aria-label="Open downtime record, same action as pressing R"
            >
              Open Downtime Record (R)
            </button>
          )}
          <button type="button" className="header-logout-btn" onClick={logoutSession}>Logout</button>
        </div>
      </header>
      <nav className="page-navigation" aria-label="Main navigation">
        <button type="button" className={activePage === 'dashboard' ? 'page-nav-btn active' : 'page-nav-btn'} onClick={() => setActivePage('dashboard')}>Production Dashboard</button>
        <button type="button" className={activePage === 'downtime' ? 'page-nav-btn active' : 'page-nav-btn'} onClick={() => setActivePage('downtime')}>Downtime Analysis</button>
      </nav>

      <div style={{ display: activePage === 'dashboard' ? 'block' : 'none' }}>
      {/* ------------------------------------------------------------------ */}
      {/* Counter Cards Row                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="counter-grid">
        {/* Red Card */}
        <div className="counter-card red">
          <div className="card-label">
            <span>Red Objects</span>
            <span className="card-category">Defective</span>
          </div>
          <div className="card-value">{redCount}</div>
          <div className="card-subtext">Total Defective Detected</div>
          {consecutiveRed > 0 && !isStopped && (
            <div className={`streak-indicator ${consecutiveRed >= 3 ? 'warning' : ''}`}>
              Streak: {consecutiveRed} / 5 red
            </div>
          )}
        </div>

        {/* Green Card */}
        <div className="counter-card green">
          <div className="card-label">
            <span>Green Objects</span>
            <span className="card-category">Accepted</span>
          </div>
          <div className="card-value">{greenCount}</div>
          <div className="card-subtext">Total Accepted (Pass)</div>
        </div>

        {/* Blue Card */}
        <div className="counter-card blue">
          <div className="card-label">
            <span>Blue Objects</span>
            <span className="card-category">Accepted</span>
          </div>
          <div className="card-value">{blueCount}</div>
          <div className="card-subtext">Total Accepted (Pass)</div>
        </div>

        {/* Total Card */}
        <div className="counter-card total">
          <div className="card-label">
            <span>Total Objects</span>
            <span className="card-category">Total</span>
          </div>
          <div className="card-value">{totalCount}</div>
          <div className="card-subtext">All Objects Processed</div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Main Two-Column Layout                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="main-layout">
        {/* LEFT COLUMN: Camera Feed & Live Detection Mode */}
        <div className="left-column">
          <div className="panel-card">
            <div className="panel-title">
              <span>Live Camera Detection</span>
              <span className="badge-tag">
                {cameraActive ? 'CAMERA CONNECTED' : 'CAMERA STANDBY'}
              </span>
            </div>

            <div className="camera-wrapper">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video"
                style={{ display: cameraActive ? 'block' : 'none' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {cameraActive ? (
                <>
                  <div
                    className={`inspection-overlay ${
                      liveObjectInView ? `detecting-${liveObjectInView.toLowerCase()}` : ''
                    }`}
                  >
                    <span className="inspection-tag">Inspection Area</span>
                    <span className="inspection-tag" style={{ alignSelf: 'flex-end' }}>
                      {liveObjectInView ? `${liveObjectInView.toUpperCase()}` : 'WAITING'}
                    </span>
                  </div>
                  <div className="camera-state-indicator">
                    <span>Single-count edge detection active</span>
                    <span>{liveObjectInView ? `Detected: ${liveObjectInView}` : 'No Object in View'}</span>
                  </div>
                </>
              ) : (
                <div className="camera-offline-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                  <p>Webcam is currently disabled or offline.</p>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Click "Start Live Camera" to begin inspection.
                  </p>
                </div>
              )}
            </div>

            {cameraError && (
              <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '8px' }}>
                Camera access error: {cameraError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              {!cameraActive ? (
                <button
                  type="button"
                  className="camera-toggle-btn"
                  onClick={startCamera}
                  disabled={isStopped}
                >
                  Start Live Camera
                </button>
              ) : (
                <button
                  type="button"
                  className="camera-toggle-btn"
                  onClick={stopCamera}
                >
                  Stop Live Camera
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Status, Fault Panel & Latest Detection */}
        <div className="right-column">
          {/* Fault Alert Panel */}
          <div className="panel-card">
            <div className="panel-title">
              <span>System Fault Status</span>
              <span className="badge-tag">Supervision</span>
            </div>

            {activeFault ? (
              <div className="fault-panel active-fault">
                <div className="fault-title">⚠️ SYSTEM STOPPED: {activeFault.message}</div>
                <div className="fault-detail">
                  Counting is locked. Subsequent detections are disabled in accordance with safety protocol.
                </div>
                <div className="fault-timestamp">
                  FAULT LOGGED AT: {activeFault.timestamp}
                </div>
                <div className="fault-enter-prompt">
                  Press R or tap Open Downtime Record (R) to log downtime and review the stop reason.
                </div>
              </div>
            ) : (
              <div className="fault-panel healthy">
                <div className="fault-status-text">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>System Healthy — No Faults Detected</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                  Monitoring for 5 consecutive red defects, 10-second inactivity timeouts, and inspection jams.
                </p>
              </div>
            )}
          </div>

          {/* Live Detection Panel */}
          <div className="panel-card">
            <div className="panel-title">
              <span>Latest Detection</span>
              <span className="badge-tag">Live State</span>
            </div>

            <div className="detection-display">
              <div
                className={`colour-preview-swatch ${
                  lastDetection ? lastDetection.color.toLowerCase() : 'none'
                }`}
              >
                {lastDetection ? lastDetection.color[0] : '—'}
              </div>
              <div className="detection-info">
                <div className="detection-colour-name">
                  {lastDetection ? `${lastDetection.color} Object` : 'No Detections Yet'}
                </div>
                <div className="detection-meta">
                  {lastDetection ? (
                    <>
                      <span>
                        Source:{' '}
                        <span className="source-tag camera">
                          {lastDetection.source}
                        </span>
                      </span>
                      <span>Time: {lastDetection.timestamp}</span>
                    </>
                  ) : (
                    <span>Waiting for camera input...</span>
                  )}
                </div>
              </div>
            </div>
          </div>


        </div>
      </div>
      </div>
      {activePage === 'downtime' && <section className="downtime-page">
        <div className="downtime-page-heading">
          <div><h2>Downtime Analysis</h2><p>Recorded downtime grouped by reason for the current production session.</p></div>
          <div className="downtime-total-card"><span>Total recorded downtime</span><strong>{Math.floor(downtimeLog.reduce((sum, item) => sum + item.durationSeconds, 0) / 60)}m {downtimeLog.reduce((sum, item) => sum + item.durationSeconds, 0) % 60}s</strong></div>
        </div>
        <div className="panel-card downtime-card">
          <div className="panel-title"><span>Downtime by Reason</span><span className="badge-tag">Session Log</span></div>
          {downtimeLog.length === 0 ? <p className="downtime-empty">No downtime has been logged this session.</p> : (() => {
            const totals = downtimeLog.reduce((acc, item) => { acc[item.reason] = (acc[item.reason] || 0) + item.durationSeconds; return acc; }, {});
            const max = Math.max(1, ...Object.values(totals));
            return <div className="downtime-bars">{Object.entries(totals).sort((a,b) => b[1]-a[1]).map(([reason, seconds]) => <div className="downtime-bar-row" key={reason}><div className="downtime-bar-label"><span>{reason}</span><strong>{Math.floor(seconds / 60)}m {seconds % 60}s</strong></div><div className="downtime-track"><div className="downtime-fill" style={{ width: `${Math.max(3, seconds / max * 100)}%` }} /></div></div>)}
              <div className="downtime-history"><strong>Downtime history</strong>{downtimeLog.slice().reverse().map((item) => <div className="downtime-history-row" key={item.id}><span>{item.reason}<small>{item.startTime}</small></span><b>{Math.floor(item.durationSeconds / 60)}m {item.durationSeconds % 60}s</b></div>)}</div></div>;
          })()}
        </div>
        <div className="reset-info-box"><p><strong>Session:</strong> Production and downtime data persist across page refreshes. Press <strong>R</strong> when stopped to record downtime. Use Logout only when the session should be cleared.</p></div>
      </section>}
      {downtimeOpen && <div className="modal-backdrop" role="presentation"><div className="downtime-modal" role="dialog" aria-modal="true" aria-labelledby="downtime-title"><h2 id="downtime-title">Downtime Record</h2><p className="modal-note">The fault reason is pre-filled from the detected machine condition. You can change it below.</p><label htmlFor="downtime-reason">Downtime reason</label><select id="downtime-reason" value={selectedDowntimeReason} onChange={(e) => setSelectedDowntimeReason(e.target.value)}><option>Defective parts / consecutive red objects</option><option>No object detected / production timeout</option><option>Object jam in inspection area</option><option>Machine fault</option><option>Conveyor / motor issue</option><option>Sensor / camera issue</option><option>Material loading delay</option><option>Operator intervention</option><option>Other</option></select><div className="modal-detail"><span>Fault</span><strong>{activeFault?.message || 'Machine stopped'}</strong><span>Stopped at</span><strong>{activeFault?.timestamp || 'Unknown'}</strong><span>Elapsed downtime</span><strong>{Math.floor(Math.max(0, Date.now() - (stoppedAtRef.current || Date.now())) / 60000)} min (approx.)</strong></div><div className="modal-actions"><button type="button" className="modal-secondary" onClick={() => setDowntimeOpen(false)}>Cancel</button><button type="button" className="modal-primary" onClick={saveDowntime}>Save Downtime</button></div></div></div>}
    </div>
  );
}
