const { radToDeg, msToKnots, angleDifferenceDeg } = require('./utils');

function mean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values) {
    const avg = mean(values);
    return Math.sqrt(mean(values.map(v => (v - avg) ** 2)));
}

function isStableCourse(app, courseHistory, thresholdDeg, options) {
    if (!options.cogFilter.useCogThreshold) return true;
    if (courseHistory.length === 0) return false;

    const anglesDeg = courseHistory.map(e => radToDeg(e.value));
    const reference = anglesDeg[0];
    const maxDelta = Math.max(...anglesDeg.map(a => angleDifferenceDeg(a, reference)));

    const stable = maxDelta <= thresholdDeg;
    app.debug("Stable course", stable);

    return stable;
}

function isStableTWD(app, twdHistory, thresholdDeg, options) {
    if (!options.twdFilter.useTwdThreshold) return true;
    if (twdHistory.length === 0) return false;

    const anglesDeg = twdHistory.map(e => radToDeg(e.value));
    const reference = anglesDeg[0];
    const maxDelta = Math.max(...anglesDeg.map(a => angleDifferenceDeg(a, reference)));

    const stable = maxDelta <= thresholdDeg;
    app.debug(`Stable TWD ${stable} || maxDelta=${maxDelta} thresholdDeg=${thresholdDeg}`);

    return stable;
}

function passesVmgRatioFilter(app, stwMs, twaRad, twsMs, polarData, options) {
    if (!options.vmgFilter.useVmgThreshold) return true;

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
        ratio < options.vmgFilter.vmgRatioThresholdUp &&
        ratio > options.vmgFilter.vmgRatioThresholdDown
    );
}

function passesAvgSpeedFilter(app, stw, stwHistory, options) {
    const f = options.speedFilter;
    if (!f.useAvgSpeedThreshold || stw === undefined || stwHistory.length === 0) return true;

    const values = stwHistory.map(e => e.value);
    const baseline = options.useStdDev ? standardDeviation(values) : mean(values);
    const ratio = baseline > 0.01 ? stw / baseline : null;

    app.debug(`AVG STW Filter STW=${stw} | BASELINE=${baseline.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < f.avgSpeedThresholdUp &&
        ratio > f.avgSpeedThresholdDown
    );
}

function passesAvgTwaFilter(app, twa, twaHistory, options) {
    const f = options.twaFilter;
    if (!f.useAvgTwaThreshold || twa === undefined || twaHistory.length === 0) return true;

    const values = twaHistory.map(e => e.value);
    const baseline = options.useStdDev ? standardDeviation(values) : mean(values);
    const ratio = Math.abs(baseline) > 0.01 ? Math.abs(twa) / Math.abs(baseline) : null;

    app.debug(`AVG TWA Filter TWA=${twa} | BASELINE=${baseline.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < f.avgTwaThresholdUp &&
        ratio > f.avgTwaThresholdDown
    );
}

function passesAvgTwsFilter(app, tws, twsHistory, options) {
    const f = options.twsFilter;
    if (!f.useAvgTwsThreshold || tws === undefined || twsHistory.length === 0) return true;

    const values = twsHistory.map(e => e.value);
    const baseline = options.useStdDev ? standardDeviation(values) : mean(values);
    const ratio = baseline > 0.01 ? tws / baseline : null;

    app.debug(`AVG TWS Filter TWS=${tws} | BASELINE=${baseline.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < f.avgTwsThresholdUp &&
        ratio > f.avgTwsThresholdDown
    );
}

function findClosestPolarPoint(twa, tws, polarData) {
    let closestTWA = null;
    let closestTWS = null;
    let expectedBoatSpeed = 0;
    let minDistance = Infinity;

    const windAngles = Object.keys(polarData).map(Number);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))];

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
