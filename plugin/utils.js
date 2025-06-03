function roundToNearest(value, step) {
  return Math.round(value / step) * step;
}

module.exports = { roundToNearest };
