function findClosest(twa, tws, polarData) {
  let best = { closestTWA: null, closestTWS: null, expectedBoatSpeed: 0, minDistance: Infinity };

  const angles = Object.keys(polarData).map(Number);
  const speeds = [...new Set(Object.values(polarData).flatMap(p => Object.keys(p).map(Number)))];

  angles.forEach(a => {
    speeds.forEach(s => {
      if (polarData[a]?.[s] != null) {
        const d = Math.sqrt((a - twa) ** 2 + (s - tws) ** 2);
        if (d < best.minDistance) {
          best = { closestTWA: a, closestTWS: s, expectedBoatSpeed: polarData[a][s], minDistance: d };
        }
      }
    });
  });

  return best;
}

module.exports = { findClosest };
