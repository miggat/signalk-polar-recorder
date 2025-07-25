// recorder.js

const fs = require('fs');
const { roundToNearest } = require('./utils');

function update(state, filePath) {
  const windAngle = state.liveTWA;
  const windSpeed = state.liveTWS;
  const boatSpeed = state.liveSTW;

  if (windAngle === undefined || windSpeed === undefined || boatSpeed === undefined) {
    state.app.debug("Skipping update: missing live data");
    return false;
  }

  const twa = Math.abs(roundToNearest(windAngle, 5));
  const tws = roundToNearest(windSpeed, 2);

  let polarData = {};
  if (fs.existsSync(filePath)) {
    try {
      polarData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      state.app.error("Error reading polar file:", err);
      return false;
    }
  }

  const now = new Date().toISOString();
  const existing = polarData[twa]?.[tws];
  const newEntry = { boatSpeed, timestamp: now };

  if (existing) {
    state.app.debug(`Before update: Recorded: ${existing} | Recorded STW: ${existing.boatSpeed} | Current STW: ${boatSpeed}`);
  }
  else {
    state.app.debug(`No existing point found`);
  }

  let updated = false;
  if (!existing || boatSpeed > existing.boatSpeed) {
    if (!polarData[twa]) polarData[twa] = {};
    polarData[twa][tws] = newEntry;
    updated = true;

    state.app.debug(`Updated in memory ${boatSpeed.toFixed(2)}kt at TWA ${twa}° / TWS ${tws}kt`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(polarData, null, 2));
      state.app.debug(`Recorded (${filePath}) ${boatSpeed.toFixed(2)}kt at TWA ${twa}° / TWS ${tws}kt`);
    } catch (err) {
      state.app.error("Error saving polar file:", err);
    }
  }

  return updated;
}

module.exports = { update };
