// apiRoutes.js
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
    try {
      const files = fs.readdirSync(app.getDataDirPath())
        .filter(f => f.endsWith('.json'));
      res.json(files);
    } catch (err) {
      app.error('Error listing polar files:', err);
      res.status(500).json({ error: 'Failed to list polar files' });
    }
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
      const file = path.join(app.getDataDirPath(), `polar-${ts}.json`);
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

  app.get(`${API_BASE}/recording`, (req, res) => {
    const { recordingActive } = state;

    res.json({
      recording: recordingActive === true
    });
  });

  app.post(`${API_BASE}/create-polar-file`, (req, res) => {
    const { fileName } = req.body;
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'Invalid file name' });
    }

    const fullPath = path.join(app.getDataDirPath(), fileName);
    try {
      fs.writeFileSync(fullPath, '{}');  // create empty polar
      res.json({ success: true, message: `File ${fileName} created.` });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create file' });
    }
  });

  app.post(`${API_BASE}/import-polar`, (req, res) => {
    const { fileName, data } = req.body;
    if (!fileName || typeof fileName !== 'string' || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const fullPath = path.join(app.getDataDirPath(), fileName.endsWith('.json') ? fileName : fileName + '.json');

    app.debug('Saving new polar file: ', fullPath);

    try {
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
      res.json({ success: true, message: `File ${fileName} imported.` });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save imported file' });
    }
  });

};
