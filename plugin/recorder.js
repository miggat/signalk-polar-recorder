// recorder.js

const fs = require('fs');
const { roundToNearest } = require('./utils');

function update(state, filePath) {
  const windAngle = state.liveTWA;
  const windSpeed = state.liveTWS;
  const boatSpeed = state.liveSTW;

  if (windAngle === undefined || windSpeed === undefined || boatSpeed === undefined) {
    state.app.debug("Skipping update: missing live data");
    return { updated: false };
  }

  const twa = Math.abs(roundToNearest(windAngle, 5));
  const tws = roundToNearest(windSpeed, 2);

  let polarData = {};
  if (fs.existsSync(filePath)) {
    try {
      polarData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      state.app.error("Error reading polar file:", err);
      return { updated: false };
    }
  }

  const nowIso = new Date().toISOString();
  const existing = polarData[twa]?.[tws]; // e.g. { boatSpeed, timestamp }
  const newEntry = { boatSpeed, timestamp: nowIso };

  if (existing) {
    state.app.debug(`Before update: recorded STW=${existing.boatSpeed} | current STW=${boatSpeed}`);
  } else {
    state.app.debug(`No existing point found`);
  }

  let didUpdate = false;
  let previous = existing ? { stw: existing.boatSpeed, timestamp: existing.timestamp } : undefined;

  if (!existing || boatSpeed > existing.boatSpeed) {
    if (!polarData[twa]) polarData[twa] = {};
    polarData[twa][tws] = newEntry;
    didUpdate = true;

    try {
      fs.writeFileSync(filePath, JSON.stringify(polarData, null, 2));
      state.app.debug(`Recorded (${filePath}) ${boatSpeed.toFixed(2)}kt at TWA ${twa}° / TWS ${tws}kt`);
    } catch (err) {
      state.app.error("Error saving polar file:", err);
    }
  }

  // Punto “vigente” tras la posible actualización (si no se actualizó, es el existente)
  const recorded = polarData[twa]?.[tws] || existing || newEntry;

  return {
    updated: didUpdate,
    lastPoint: {
      twa,
      tws,
      stw: recorded.boatSpeed,
      timestamp: recorded.timestamp
    },
    live: {
      twa: windAngle,
      tws: windSpeed,
      stw: boatSpeed
    },
    previous
  };
}

module.exports = { update };
