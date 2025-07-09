function roundToNearest(value, step) {
  return Math.round(value / step) * step;
}

function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

function msToKnots(ms){
  return ms * 1.94384;
}

// Utilidad para diferencia angular mínima (considerando wrap-around de 360º)
function angleDifferenceDeg(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}


module.exports = {
  roundToNearest,
  radToDeg,
  msToKnots,
  angleDifferenceDeg
};
