// main.js
import { initChart, updateChart, updateLivePoint } from './chart.js';

const API_BASE = '/signalk/v1/api/polar-recorder';

let latestPolarData = {};
let polarFiles = [];

async function fetchPolarData(polarFile) {
    try {
        const url = `${API_BASE}/polar-data${polarFile ? `?fileName=${encodeURIComponent(polarFile)}` : ''}`;
        const response = await fetch(url);
        if (response.ok) {
            latestPolarData = await response.json();
            generateTable(latestPolarData);
            updateChart(latestPolarData);
            updateTimestamp();
        } else {
            console.error('Failed to fetch polar data');
        }
    } catch (error) {
        console.error('Error fetching polar data:', error);
    }
}

async function fetchPolarFiles() {
    try {
        const response = await fetch(`${API_BASE}/get-polar-files`);
        if (response.ok) {
            polarFiles = await response.json();
            const select = document.getElementById('polarFileSelect');
            select.innerHTML = polarFiles.map(file => `<option value="${file}">${file}</option>`).join('');
            if (polarFiles.length > 0) {
                await fetchPolarData(polarFiles[0]);
            }
        } else {
            console.error('Failed to fetch polar files');
        }
    } catch (error) {
        console.error('Error fetching polar files:', error);
    }
}

function updateTimestamp() {
    const now = new Date();
    document.getElementById('updateTime').textContent = `Updated at: ${now.toLocaleTimeString()}`;
}

function generateTable(polarData) {
    const tableHeader = document.querySelector('#polarTable thead');
    const tableBody = document.querySelector('#polarTableBody');

    let windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b).filter(a => a !== 0);
    let windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b).filter(s => s !== 0);

    let headerRow = '<tr><th>TWA/TWS</th>' + windSpeeds.map(s => `<th>${s} kt</th>`).join('') + '</tr>';
    tableHeader.innerHTML = headerRow;

    tableBody.innerHTML = windAngles.map(angle => {
        let row = `<tr><td>${angle}°</td>`;
        windSpeeds.forEach(speed => {
            const boatSpeed = polarData[angle]?.[speed];
            row += `<td>${boatSpeed != null ? boatSpeed.toFixed(1) : '-'}</td>`;
        });
        return row + '</tr>';
    }).join('');
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
                    expectedBoatSpeed = polarData[angle][speed];
                }
            }
        });
    });

    return { closestTWA, closestTWS, expectedBoatSpeed };
}

async function fetchLivePerformance() {
    try {
        const response = await fetch(`${API_BASE}/live-data`);
        if (!response.ok) throw new Error('Failed to fetch live performance data');

        const data = await response.json();
        const twa = parseFloat(data.twa);
        const tws = parseFloat(data.tws);
        const stw = parseFloat(data.stw);

        updateLivePoint(twa, stw);

        document.getElementById("windAngle").textContent = `Wind Angle: ${twa}°`;
        document.getElementById("windSpeed").textContent = `Wind Speed: ${tws} kt`;
        document.getElementById("boatSpeed").textContent = `Boat Speed: ${stw} kt`;

        if (Object.keys(latestPolarData).length > 0) {
            const { closestTWA, closestTWS, expectedBoatSpeed } = findClosestPolarPoint(twa, tws, latestPolarData);
            const delta = (stw - expectedBoatSpeed).toFixed(2);
            const deltaPct = expectedBoatSpeed > 0 ? ((delta / expectedBoatSpeed) * 100).toFixed(1) : "--";

            document.getElementById("closestPolar").textContent = `Closest Polar: ${closestTWS} kt TWS / ${closestTWA}° TWA`;
            document.getElementById("speedDifference").textContent = `Difference: ${delta} kt (${deltaPct}%)`;
        } else {
            document.getElementById("closestPolar").textContent = `Closest Polar: -- kt TWS / --° TWA`;
            document.getElementById("speedDifference").textContent = `Difference: -- kt (--%)`;
        }
    } catch (error) {
        console.error("Error fetching live performance data:", error);
    }
}

function startRecording(mode) {
    fetch(`${API_BASE}/start-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
    });
    document.getElementById('recordControls').style.display = 'block';
}

function stopRecording(save) {
    fetch(`${API_BASE}/stop-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ save })
    }).then(() => {
        if (polarFiles.length > 0) {
            fetchPolarData(polarFiles[0]);
        }
    });

    document.getElementById('recordControls').style.display = 'none';
}

async function updateUI() {
    const response = await fetch(`${API_BASE}/motoring`);
    if (!response.ok) throw new Error('Failed to fetch live performance data');

    const data = await response.json();
    const motoring = data.motoring;

    const overlay = document.getElementById("motoringOverlay");

    //console.log(`Motoring: ${data.motoring}`);

    if (motoring) {
        if (!overlay) {
            const cover = document.createElement("div");
            cover.id = "motoringOverlay";
            cover.style.position = "fixed";
            cover.style.top = 0;
            cover.style.left = 0;
            cover.style.width = "100vw";
            cover.style.height = "100vh";
            cover.style.backgroundColor = "rgba(100, 100, 100, 0.7)";
            cover.style.zIndex = 9999;
            cover.style.display = "flex";
            cover.style.alignItems = "center";
            cover.style.justifyContent = "center";
            cover.style.color = "white";
            cover.style.fontSize = "2em";
            cover.textContent = "Recording disabled while motoring...";
            document.body.appendChild(cover);
        }
    } else {
        if (overlay) overlay.remove();
        fetchLivePerformance();
    }
}

// Init
fetchPolarFiles();
initChart();
setInterval(updateUI, 1000);

document.addEventListener("DOMContentLoaded", () => {
    const toggleTableBtn = document.getElementById("toggleTableBtn");
    const polarTable = document.getElementById("polarTable");

    toggleTableBtn.addEventListener("click", () => {
        const isVisible = polarTable.style.display !== "none";
        polarTable.style.display = isVisible ? "none" : "table";
        toggleTableBtn.textContent = isVisible ? "Show Table" : "Hide Table";
    });

    document.getElementById('recordPolarBtn').addEventListener('click', () => {
        const mode = confirm("New Polar? Click OK. Incremental? Click Cancel.") ? 'new' : 'incremental';
        startRecording(mode);
    });

    document.getElementById('stopSaveBtn').addEventListener('click', () => stopRecording(true));
    document.getElementById('stopCancelBtn').addEventListener('click', () => stopRecording(false));

    fetchPolarFiles().then(() => {
        const select = document.getElementById('polarFileSelect');
        select.addEventListener('change', (event) => {
            fetchPolarData(event.target.value);
        });
    });
});
