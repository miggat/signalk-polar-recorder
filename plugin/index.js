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
      const polarRecordingsDir = path.join(app.getDataDirPath(), 'polar-recordings');
      let polarData = {};

      function loadPolarData(fileName) {
        let tempData;
        let filePath = polarDataFilePath;
        if (fileName) {
          filePath = path.join(app.getDataDirPath(), fileName);
        }

        if (fs.existsSync(filePath)) {
          try {
            tempData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`Loaded polar data from ${filePath}:`, polarData);
          } catch (err) {
            app.error(`Error loading polar data file (${filePath}):`, err);
          }
        }

        return tempData;
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

      function ensureDirectoryExists(directory) {
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
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
        const fileName = req.query.fileName; // Get fileName from query parameters
        const data = loadPolarData(fileName); // Load data from the specified file
    
        if (data) {
            res.json(data);
        } else {
            res.status(404).json({ error: "Polar data file not found or could not be loaded." });
        }
    });
    

      app.get('/signalk/v1/api/signalk-polar-recorder/get-polar-files', (req, res) => {
        ensureDirectoryExists(polarRecordingsDir);

        const files = [];
        if (fs.existsSync(polarDataFilePath)) {
          files.push(path.basename(polarDataFilePath));
        }

        if (fs.existsSync(polarRecordingsDir)) {
          const recordingFiles = fs.readdirSync(polarRecordingsDir).map(file => `polar-recordings/${file}`);
          files.push(...recordingFiles);
        }

        res.json(files);
      });

      app.post('/save-polar-data', (req, res) => {
        ensureDirectoryExists(polarRecordingsDir);
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
        const filename = `polar-${timestamp}.json`;
        const filePath = path.join(polarRecordingsDir, filename);

        try {
          fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
          console.log(`Polar data saved to ${filePath}`);
          res.json({ success: true, message: `Polar data saved as ${filename}` });
        } catch (err) {
          console.error("Error saving polar data:", err);
          res.status(500).json({ success: false, message: "Error saving polar data" });
        }
      });

      polarData = loadPolarData();
    },

    stop: function () {
      console.log("Polar Recorder plugin stopped");
    }
  };

  return plugin;
};
