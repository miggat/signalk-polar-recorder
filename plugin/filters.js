const { radToDeg, msToKnots, angleDifferenceDeg } = require('./utils');

function mean(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
}

function standardDeviation(values) {
    const avg = mean(values);
    const variance = mean(values.map(v => (v - avg) ** 2));
    return Math.sqrt(variance);
}

function isStableCourse(app, courseHistory, thresholdDeg) {
    if (courseHistory.length === 0) return false;

    const anglesDeg = courseHistory.map(e => radToDeg(e.value));
    const reference = anglesDeg[0];
    const maxDelta = Math.max(...anglesDeg.map(a => angleDifferenceDeg(a, reference)));

    const stable = maxDelta <= thresholdDeg;
    app.debug("Stable course", stable);

    return stable;
}

function isStableTWD(app, twdHistory, thresholdDeg) {
    app.debug(`Filtering TWD with ${thresholdDeg}º`);
    if (twdHistory.length === 0) return false;

    app.debug(`Found ${twdHistory.length} elements in the filter`);
    const anglesDeg = twdHistory.map(e => radToDeg(e.value));
    const reference = anglesDeg[0];
    const maxDelta = Math.max(...anglesDeg.map(a => angleDifferenceDeg(a, reference)));

    const stable = maxDelta <= thresholdDeg;
    app.debug(`Stable TWD ${stable} || maxDelta=${maxDelta} thresholdDeg=${thresholdDeg}`);

    return stable;
}

function passesVmgRatioFilter(app, stwMs, twaRad, twsMs, polarData, options) {
    if (!options.useVmgThreshold) return true;

    const twaDeg = radToDeg(twaRad);
    const twsKnots = msToKnots(twsMs);
    const stwKnots = msToKnots(stwMs);

    const { expectedBoatSpeed } = findClosestPolarPoint(Math.abs(twaDeg), twsKnots, polarData);

    if (expectedBoatSpeed == null || expectedBoatSpeed < 0.01) {
        app.debug("No expected boat speed found for this TWA/TWS.");
        return true;
    }

    const ratio = stwKnots / expectedBoatSpeed;

    app.debug(`STW=${stwKnots.toFixed(2)}kt - Polar=${expectedBoatSpeed.toFixed(2)}kt || Ratio=${ratio.toFixed(2)}`);

    return (
        ratio < options.vmgRatioThresholdUp &&
        ratio > options.vmgRatioThresholdDown
    );
}

function passesAvgSpeedFilter(app, stw, stwHistory, options) {
    if (!options.useAvgSpeedThreshold || stw === undefined || stwHistory.length === 0) return true;

    const values = stwHistory.map(e => e.value);
    const baseline = options.useStdDev ? standardDeviation(values) : mean(values);
    const ratio = baseline > 0.01 ? stw / baseline : null;

    app.debug(`AVG STW Filter STW=${stw} | BASELINE=${baseline.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < options.avgSpeedThresholdUp &&
        ratio > options.avgSpeedThresholdDown
    );
}

function passesAvgTwaFilter(app, twa, twaHistory, options) {
    if (!options.useAvgTwaThreshold || twa === undefined || twaHistory.length === 0) return true;

    const values = twaHistory.map(e => e.value);
    const baseline = options.useStdDev ? standardDeviation(values) : mean(values);
    const ratio = Math.abs(baseline) > 0.01 ? Math.abs(twa) / Math.abs(baseline) : null;

    app.debug(`AVG TWA Filter TWA=${twa} | BASELINE=${baseline.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < options.avgTwaThresholdUp &&
        ratio > options.avgTwaThresholdDown
    );
}

function passesAvgTwsFilter(app, tws, twsHistory, options) {
    if (!options.useAvgTwsThreshold || tws === undefined || twsHistory.length === 0) return true;

    const values = twsHistory.map(e => e.value);
    const baseline = options.useStdDev ? standardDeviation(values) : mean(values);
    const ratio = baseline > 0.01 ? tws / baseline : null;

    app.debug(`AVG TWS Filter TWS=${tws} | BASELINE=${baseline.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < options.avgTwsThresholdUp &&
        ratio > options.avgTwsThresholdDown
    );
}

function findClosestPolarPoint(twa, tws, polarData) {
    let closestTWA = null;
    let closestTWS = null;
    let expectedBoatSpeed = 0;
    let minDistance = Infinity;

    const windAngles = Object.keys(polarData).map(Number);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))]

    windAngles.forEach(angle => {
        windSpeeds.forEach(speed => {
            if (polarData[angle]?.[speed] != null) {
                const dist = Math.sqrt((angle - twa) ** 2 + (speed - tws) ** 2);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestTWA = angle;
                    closestTWS = speed;
                    expectedBoatSpeed = polarData[angle][speed].boatSpeed;
                }
            }
        });
    });

    return { closestTWA, closestTWS, expectedBoatSpeed };
}

module.exports = {
    isStableCourse,
    isStableTWD,
    passesVmgRatioFilter,
    passesAvgSpeedFilter,
    passesAvgTwaFilter,
    passesAvgTwsFilter,
    findClosestPolarPoint
};
