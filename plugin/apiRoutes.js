const fs = require('fs');
const path = require('path');
const { findClosest } = require('./compare');
const polarStore = require('./polarStore');

const API_BASE = '/signalk/v1/api/polar-recorder';

module.exports = function (app, state) {
  app.get(`${API_BASE}/polar-data`, (req, res) => {
    const file = req.query.fileName;
    const data = file ? polarStore.load(path.join(app.getDataDirPath(), file)) : state.polarData;
    res.json(data);
  });

  app.get(`${API_BASE}/get-polar-files`, (req, res) => {
    const files = [];
    if (fs.existsSync(state.polarDataFile)) files.push(path.basename(state.polarDataFile));
    if (fs.existsSync(state.recordingsDir)) {
      const recs = fs.readdirSync(state.recordingsDir).map(f => `polar-recordings/${f}`);
      files.push(...recs);
    }
    res.json(files);
  });

  app.post(`${API_BASE}/start-recording`, (req, res) => {
    state.recording = req.body?.mode === 'incremental' ? state.recording : {};
    state.recordingActive = true;
    res.json({ success: true });
  });

  app.post(`${API_BASE}/stop-recording`, (req, res) => {
    state.recordingActive = false;
    if (req.body?.save) {
      const ts = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
      const file = path.join(state.recordingsDir, `polar-${ts}.json`);
      fs.mkdirSync(state.recordingsDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state.recording, null, 2));
      res.json({ success: true, message: `Saved as ${path.basename(file)}` });
    } else {
      res.json({ success: true, message: 'Recording discarded' });
    }
  });

  app.get(`${API_BASE}/compare-performance`, (req, res) => {
    const twa = parseFloat(req.query.twa);
    const tws = parseFloat(req.query.tws);
    const stw = parseFloat(req.query.stw);

    if ([twa, tws, stw].some(isNaN)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const match = findClosest(twa, tws, state.polarData);
    const delta = stw - match.expectedBoatSpeed;
    const pct = match.expectedBoatSpeed > 0 ? (delta / match.expectedBoatSpeed * 100).toFixed(1) : "--";

    res.json({
      twa: twa.toFixed(1),
      tws: tws.toFixed(1),
      stw: stw.toFixed(2),
      expected: match.expectedBoatSpeed.toFixed(2),
      delta: delta.toFixed(2),
      deltaPct: pct
    });
  });


  app.get(`${API_BASE}/live-data`, (req, res) => {
    const { liveTWA, liveTWS, liveSTW } = state;

    res.json({
      twa: liveTWA !== undefined ? liveTWA.toFixed(1) : null,
      tws: liveTWS !== undefined ? liveTWS.toFixed(1) : null,
      stw: liveSTW !== undefined ? liveSTW.toFixed(2) : null
    });
  });

  app.get(`${API_BASE}/motoring`, (req, res) => {
    const { motoring } = state;

    res.json({
      motoring: motoring === true
    });
  });

};
