const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');

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

      function isValidPolarData(data) {
        return typeof data === 'object' && Object.keys(data).length > 0;
      }

      function parseCSVToPolar(csvContent) {
        try {
          const records = csvParse.parse(csvContent, { delimiter: ';', columns: true });
          const twaValues = Object.keys(records[0]).filter(key => key !== 'twa/tws').map(Number);

          let polarJson = {};
          records.forEach(row => {
            const twa = parseFloat(row['twa/tws']);
            if (!isNaN(twa)) {
              polarJson[twa] = {};
              twaValues.forEach(tws => {
                const boatSpeed = parseFloat(row[tws]);
                if (!isNaN(boatSpeed)) {
                  polarJson[twa][tws] = boatSpeed;
                }
              });
            }
          });

          return polarJson;
        } catch (error) {
          console.error("Error parsing CSV:", error);
          return null;
        }
      }

      function handlePolarImport(content) {
        let parsedData;
        
        try {
          if (content.trim().startsWith('{')) {
            // Assume it's JSON
            parsedData = JSON.parse(content);
          } else {
            // Assume it's CSV
            parsedData = parseCSVToPolar(content);
          }

          if (isValidPolarData(parsedData)) {
            polarData = parsedData;
            savePolarData();
            return { success: true, message: "Polar data successfully imported and saved." };
          } else {
            return { success: false, message: "Invalid polar data format." };
          }
        } catch (error) {
          return { success: false, message: "Error processing polar data: " + error.message };
        }
      }

      // Handle import when settings are updated
      if (options.importPolarData) {
        console.log("Importing user-provided polar data...");
        const result = handlePolarImport(options.importPolarData);
        if (result.success) {
          console.log("Polar data successfully imported via settings.");
        } else {
          app.error("Polar data import failed:", result.message);
        }
      }

      app.get('/signalk/v1/api/signalk-polar-recorder/polar-data', (req, res) => {
        res.json(polarData);
      });

      loadPolarData();
    },

    stop: function () {
      console.log("Polar Recorder plugin stopped");
    }
  };

  return plugin;
};
