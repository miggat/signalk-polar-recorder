function isStableCourse(app, courseHistory, threshold) {
    if (courseHistory.length === 0) return false;

    const angles = courseHistory.map(e => e.angle);
    const reference = angles[0];
    const maxDelta = Math.max(...angles.map(a => Math.abs(a - reference)));

    app.debug("Stable course", maxDelta <= threshold);

    return maxDelta <= threshold;
}

function passesVmgRatioFilter(app, stwMs, twaRad, twsMs, polarData, options) {
    if (!options.useVmgThreshold) return true;

    const twaDeg = twaRad * 180 / Math.PI;
    const twsKnots = twsMs * 1.94384;
    const stwKnots = stwMs * 1.94384;

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

    const avg = stwHistory.reduce((sum, e) => sum + e.value, 0) / stwHistory.length;
    const ratio = avg > 0.01 ? stw / avg : null;

    app.debug(`STW=${stw} | AVG=${avg.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < options.avgSpeedThresholdUp &&
        ratio > options.avgSpeedThresholdDown
    );
}

function passesAvgTwaFilter(app, twa, twaHistory, options) {
    if (!options.useAvgTwaThreshold || twa === undefined || twaHistory.length === 0) return true;

    const avg = twaHistory.reduce((sum, e) => sum + e.value, 0) / twaHistory.length;
    const ratio = Math.abs(avg) > 0.01 ? Math.abs(twa) / Math.abs(avg) : null;

    app.debug(`TWA=${twa} | AVG=${avg.toFixed(2)} | Ratio=${ratio}`);
    return (
        ratio !== null &&
        ratio < options.avgTwaThresholdUp &&
        ratio > options.avgTwaThresholdDown
    );
}

function passesAvgTwsFilter(app, tws, twsHistory, options) {
    if (!options.useAvgTwsThreshold || tws === undefined || twsHistory.length === 0) return true;

    const avg = twsHistory.reduce((sum, e) => sum + e.value, 0) / twsHistory.length;
    const ratio = avg > 0.01 ? tws / avg : null;

    app.debug(`TWS=${tws} | AVG=${avg.toFixed(2)} | Ratio=${ratio}`);
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

    Math.abs(twa)

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
    passesVmgRatioFilter,
    passesAvgSpeedFilter,
    passesAvgTwaFilter,
    passesAvgTwsFilter,
    findClosestPolarPoint
};
