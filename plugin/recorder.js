const { roundToNearest } = require('./utils');

function update(state, windAngle, windSpeed, boatSpeed) {
  const twa = Math.abs(roundToNearest(windAngle, 5));
  const tws = roundToNearest(windSpeed, 2);

  if (!state.recording[twa]) state.recording[twa] = {};
  if (!state.recording[twa][tws] || state.recording[twa][tws] < boatSpeed) {
    state.recording[twa][tws] = boatSpeed;
    state.app.debug(`Recorded ${boatSpeed.toFixed(2)}kt at TWA ${twa}° / TWS ${tws}kt`);
  }
}

module.exports = { update };
