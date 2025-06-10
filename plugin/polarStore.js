// polarStore.js
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');

function load(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error("Error loading polar data:", err);
    return {};
  }
}

function save(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function parseCSV(csvContent) {
  try {
    const records = csvParse.parse(csvContent, { delimiter: ';', columns: true });
    const twaValues = Object.keys(records[0]).filter(k => k !== 'twa/tws').map(Number);
    const result = {};
    records.forEach(row => {
      const twa = parseFloat(row['twa/tws']);
      if (!isNaN(twa)) {
        result[twa] = {};
        twaValues.forEach(tws => {
          const speed = parseFloat(row[tws]);
          if (!isNaN(speed)) result[twa][tws] = speed;
        });
      }
    });
    return result;
  } catch (err) {
    console.error("CSV parsing failed:", err);
    return null;
  }
}

function importData(content, state) {
  try {
    const parsed = content.trim().startsWith('{')
      ? JSON.parse(content)
      : parseCSV(content);

    if (parsed && typeof parsed === 'object') {
      state.polarData = parsed;
      save(state.polarDataFile, parsed);
      return { success: true };
    }
    return { success: false, message: "Invalid polar format" };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = { load, save, parseCSV, import: importData };
