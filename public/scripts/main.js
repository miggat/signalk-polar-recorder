// main.js
import { initChart, updateChart, updateLivePoint } from './chart.js';

const API_BASE = '/signalk/v1/api/polar-recorder';

let latestPolarData = {};
let polarFiles = [];
let selectedPolarFile;

let ws;
let reconnectInterval;

function connectWebSocket() {
    ws = new WebSocket(`ws://${location.host}/plugins/polar-recorder/ws`);

    ws.onopen = () => {
        console.log("[WebSocket] Connected to backend");
        clearInterval(reconnectInterval); // Stop reconnection attempts
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log("[WebSocket] Message received:", message);

        switch (message.event) {
            case 'updateLivePerformance':
                updateLivePerformance(message.twa, message.tws, message.stw);
                break;

            case 'changeMotoringStatus':
                document.getElementById('motoringOverlay').style.display = message.engineOn ? 'flex' : 'none';
                break;

            case 'changeRecordStatus':
                document.getElementById('recordControls').style.display = message.status ? 'block' : 'none';
                document.getElementById('recordingOverlay').style.display = message.status ? 'block' : 'none';
                break;

            case 'polarUpdated':
                const updatedFile = message.filePath.split('/').pop(); // Extract filename
                const select = document.getElementById('polarFileSelect');

                if (select && Array.from(select.options).some(opt => opt.value === updatedFile)) {
                    select.value = updatedFile;
                    fetchPolarData(updatedFile);
                } else {
                    // If the file is new, re-fetch the list and then select the new one
                    fetchPolarFiles(updatedFile);
                }
                break;

            default:
                console.warn("[WebSocket] Unknown event:", message);
        }
    };

    ws.onclose = () => {
        console.warn("[WebSocket] Disconnected. Attempting reconnect every 10s...");
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log("[WebSocket] Trying to reconnect...");
                connectWebSocket();
            }, 10000);
        }
    };

    ws.onerror = (err) => {
        console.error("[WebSocket] Error:", err);
        ws.close(); // Trigger reconnect flow
    };
}

async function fetchPolarData(polarFile) {
    try {
        selectedPolarFile = polarFile;

        const url = `${API_BASE}/polar-data${polarFile ? `?fileName=${encodeURIComponent(polarFile)}` : ''}`;
        const response = await fetch(url);
        if (response.ok) {
            latestPolarData = await response.json();
            //generateTable(latestPolarData);
            updateChart(latestPolarData);
            updateTimestamp();
        } else {
            console.error('Failed to fetch polar data');
        }
    } catch (error) {
        console.error('Error fetching polar data:', error);
    }
}

async function fetchPolarFiles(selectedFileName) {
    try {
        const response = await fetch(`${API_BASE}/get-polar-files`);
        if (response.ok) {
            polarFiles = await response.json();
            const select = document.getElementById('polarFileSelect');
            select.innerHTML = polarFiles.map(file => `<option value="${file}">${file}</option>`).join('');
            if (polarFiles.length > 0) {
                const selectedFile = selectedFileName || polarFiles[0];
                select.value = selectedFile;
                await fetchPolarData(selectedFile);
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
            const boatSpeed = polarData[angle]?.[speed].boatSpeed;
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

// async function fetchLivePerformance() {
//     try {
//         const response = await fetch(`${API_BASE}/live-data`);
//         if (!response.ok) throw new Error('Failed to fetch live performance data');

//         const data = await response.json();
//         const twa = parseFloat(data.twa);
//         const tws = parseFloat(data.tws);
//         const stw = parseFloat(data.stw);

//         updateLivePerformance(twa, tws, stw);
//     } catch (error) {
//         console.error("Error fetching live performance data:", error);
//     }
// }

function updateLivePerformance(twa, tws, stw) {
    updateLivePoint(twa, stw);

    document.getElementById("windAngle").textContent = `Wind Angle: ${twa.toFixed(0)}°`;
    document.getElementById("windSpeed").textContent = `Wind Speed: ${tws.toFixed(1)} kt`;
    document.getElementById("boatSpeed").textContent = `Boat Speed: ${stw.toFixed(1)} kt`;

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
}

async function fetchMotoringStatus() {
    const response = await fetch(`${API_BASE}/motoring`);
    if (!response.ok) throw new Error('Failed to fetch live performance data');

    const data = await response.json();
    const motoring = data.motoring;

    console.log(`Front motoring: ${motoring}`);

    const overlay = document.getElementById('motoringOverlay');

    if (motoring) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

async function fetchRecordingStatus() {
    const response = await fetch(`${API_BASE}/recording`);
    if (!response.ok) throw new Error('Failed to fetch live performance data');

    const data = await response.json();
    const recording = data.recording;

    console.log(`Front recording: ${recording}`);

    const overlay = document.getElementById('recordingOverlay');

    if (recording) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

function startRecording(polarFile) {
    fetch(`${API_BASE}/start-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polarFile })
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

// Init chart
initChart();
// Init
fetchPolarFiles();
// fetchMotoringStatus();
// fetchRecordingStatus();
// fetchLivePerformance();
// Initial connection
connectWebSocket();

//setInterval(fetchLivePerformance, 1000);

document.addEventListener("DOMContentLoaded", () => {
    const toggleTableBtn = document.getElementById("toggleTableBtn");
    const polarTable = document.getElementById("polarTable");

    toggleTableBtn.addEventListener("click", () => {
        const isVisible = polarTable.style.display !== "none";
        polarTable.style.display = isVisible ? "none" : "table";
        toggleTableBtn.textContent = isVisible ? "Show Table" : "Hide Table";
    });

    document.getElementById('recordPolarBtn').addEventListener('click', () => {
        startRecording(selectedPolarFile);
    });

    document.getElementById('stopSaveBtn').addEventListener('click', () => stopRecording(true));
    document.getElementById('stopCancelBtn').addEventListener('click', () => stopRecording(false));

    document.getElementById('newPolarBtn').addEventListener('click', async () => {
        let filename = prompt("Enter new polar file name:");
        if (!filename || filename.trim() === "") {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const h = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            filename = `Polar-${y}${m}${d}_${h}${min}.json`;
        } else if (!filename.endsWith(".json")) {
            filename += ".json";
        }

        try {
            const response = await fetch(`${API_BASE}/create-polar-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: filename })
            });

            if (!response.ok) throw new Error("Failed to create file");
            await fetchPolarFiles(filename);
        } catch (error) {
            alert("Error creating polar file: " + error.message);
        }
    });

    fetchPolarFiles().then(() => {
        const select = document.getElementById('polarFileSelect');
        select.addEventListener('change', (event) => {
            fetchPolarData(event.target.value);
        });
    });
});
