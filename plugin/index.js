const fs = require('fs');
const path = require('path');

module.exports = function (app) {
  const plugin = {
    id: 'signalk-polar-recorder',
    name: 'SignalK Polar Recorder',
    description: 'A SignalK plugin to record boat polars based on sailing performance',
    schema: require('../schema.json'),
    start: function (options) {
      console.log("Polar Recorder plugin started");

      const polarDataFilePath = path.join(app.getDataDirPath(), 'polar-data.json');
      let polarData = {};

      function loadPolarData() {
        if (fs.existsSync(polarDataFilePath)) {
          try {
            polarData = JSON.parse(fs.readFileSync(polarDataFilePath, 'utf8'));
            console.log("Loaded existing polar data:", polarData);
          } catch (err) {
            app.error("Error loading polar data file:", err);
          }
        }
      }

      function savePolarData() {
        try {
          fs.writeFileSync(polarDataFilePath, JSON.stringify(polarData, null, 2));
          console.log("Polar data saved to file.");
        } catch (err) {
          console.error("Error saving polar data to file:", err);
        }
      }

      function roundToStep(value, step) {
        if (isNaN(value)) return 0;
        return Math.round(value / step) * step;
      }

      function cleanPolarData() {
        for (const windSpeedKey in polarData) {
          if (isNaN(Number(windSpeedKey))) {
            delete polarData[windSpeedKey];
          } else {
            const angleData = polarData[windSpeedKey];
            for (const angleKey in angleData) {
              if (isNaN(Number(angleKey))) {
                delete angleData[angleKey];
              }
            }
          }
        }
        savePolarData();
      }

      function updatePolars(angle, windSpeed, boatSpeed) {
        if (!options.enableRecording) return;

        const angleInDegrees = angle * (180 / Math.PI);
        const angleRounded = roundToStep(angleInDegrees, 5);

        const windSpeedInKnots = windSpeed * 1.94384;
        const windSpeedRounded = roundToStep(windSpeedInKnots, 2);

        app.debug(`Attempting update: angle ${angleRounded}, wind ${windSpeedRounded}, speed ${boatSpeed}`);

        if (!isNaN(angleRounded) && !isNaN(windSpeedRounded) && !isNaN(boatSpeed) &&
          angleRounded >= 0 && angleRounded <= 180 &&
          windSpeedRounded >= 0 && windSpeedRounded <= 100) {

          const windSpeedKey = String(windSpeedRounded);
          const angleKey = String(angleRounded);

          if (!polarData[windSpeedKey]) polarData[windSpeedKey] = {};

          const currentSpeed = polarData[windSpeedKey][angleKey];
          if (!currentSpeed || boatSpeed > currentSpeed) {
            polarData[windSpeedKey][angleKey] = boatSpeed;
            savePolarData();
            app.debug(`Updated polar data at wind speed ${windSpeedRounded} kt, angle ${angleRounded}°: new boat speed ${boatSpeed} kt`);
          } else {
            app.debug(`Skipped update: new boat speed ${boatSpeed} kt is not greater than current ${currentSpeed} kt at wind speed ${windSpeedRounded} kt, angle ${angleRounded}°`);
          }
        } else {
          app.debug("Invalid data for update; skipping.");
        }
      }

      function handleData() {
        const angleData = app.getSelfPath('environment.wind.angleTrueGround');
        const windSpeedData = app.getSelfPath('environment.wind.speedOverGround');
        const boatSpeedData = app.getSelfPath('navigation.speedThroughWater');

        const angle = angleData && angleData.value;
        const windSpeed = windSpeedData && windSpeedData.value;
        const boatSpeed = boatSpeedData && boatSpeedData.value;

        if (angle !== undefined && windSpeed !== undefined && boatSpeed !== undefined) {
          app.debug("Received data - Angle:", angle, "Wind Speed:", windSpeed, "Boat Speed:", boatSpeed);

          if (!isNaN(angle) && !isNaN(windSpeed) && !isNaN(boatSpeed)) {
            updatePolars(angle, windSpeed, boatSpeed);
          } else {
            app.debug("Received NaN values; skipping update.");
          }
        } else {
          app.debug("Data not received for all required parameters.");
        }
      }

      app.streambundle.getSelfStream('environment.wind.angleTrueGround').onValue(handleData);
      app.streambundle.getSelfStream('environment.wind.speedOverGround').onValue(handleData);
      app.streambundle.getSelfStream('navigation.speedThroughWater').onValue(handleData);

      app.get('/signalk/v1/api/signalk-polar-recorder/polar-data', (req, res) => {
        res.json(polarData);
      });

      loadPolarData();
      cleanPolarData();

      if (Object.keys(polarData).length === 0) {
        function initializeSampleData() {
          updatePolars(30 * (Math.PI / 180), 6 / 1.94384, 4.5);
          console.log("Initialized sample data.");
        }
        initializeSampleData();
      }
    },
    stop: function () {
      console.log("Polar Recorder plugin stopped");
    }
  };

  return plugin;
};
