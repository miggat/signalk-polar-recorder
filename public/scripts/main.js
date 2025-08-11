// main.js
import { initChart, updateChart, updateLivePoint } from './chart.js';

const API_BASE = '/signalk/v1/api/polar-recorder';

let latestPolarData = {};
let polarFiles = [];
let selectedPolarFile;

let showFullChart = true;

let ws;
let reconnectInterval;

let currentMode = null;

let _lastPolarUpdateTs = null;
let _lastRelTimer = null;

function connectWebSocket() {
    ws = new WebSocket(`ws://${location.host}/plugins/polar-recorder/ws`);

    ws.onopen = () => {
        console.log("[WebSocket] Connected to backend");
        clearInterval(reconnectInterval); // Stop reconnection attempts
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        //console.log("[WebSocket] Message received:", message);

        switch (message.event) {
            case 'updateLivePerformance':
                updateLivePerformance(message.twa, message.tws, message.stw);
                break;

            case 'changeMotoringStatus':
                document.getElementById('motoringOverlay').style.display = message.engineOn ? 'flex' : 'none';
                break;

            case 'setMode':
                currentMode = message.mode

                selectedPolarFile = message.filePath?.split('/').pop(); // Extract filename

                setLayoutMode(currentMode);
                break;

            case 'changeRecordStatus':

                if (message.mode === 'auto') {
                    //var recordingControls = document.getElementById('recordControls');
                    // if (recordingControls) {
                    //     recordingControls.style.display = message.status ? 'block' : 'none';
                    // }
                    //document.getElementById('recordingOverlay').style.display = message.status ? 'block' : 'none';

                    if (currentMode != message.mode) {
                        console.log(`Recording ${message.mode}`);
                        setLayoutMode(currentMode, selectedPolarFile);
                    }
                }
                else {

                    // var recordingControls = document.getElementById('recordControls');
                    // if (recordingControls) {
                    //     recordingControls.style.display = message.status ? 'block' : 'none';
                    // }
                    //document.getElementById('manualRecordingOverlay').style.display = message.status ? 'block' : 'none';
                    if (currentMode != message.mode) {
                        console.log(`Recording ${message.mode}`);
                        setLayoutMode(currentMode, selectedPolarFile);
                    }
                }
                break;

            case 'polarUpdated':
                if (message.filePath != undefined) {
                    updateTimestamp(message);

                    const updatedFile = message.filePath.split('/').pop(); // Extract filename

                    if (currentMode !== 'auto') {
                        const select = document.getElementById('polarFileSelect');

                        if (select && Array.from(select.options).some(opt => opt.value === updatedFile)) {
                            select.value = updatedFile;
                            fetchPolarData(updatedFile);
                        } else {
                            // If the file is new, re-fetch the list and then select the new one
                            fetchPolarFiles(updatedFile);
                        }
                    }
                    else {
                        fetchPolarData(updatedFile);
                    }
                }
                break;
            case 'recordErrors':
                const errorsDiv = document.getElementById('errors');

                if (message.errors) {
                    // Mostrar el div
                    errorsDiv.style.display = 'block';

                    // Crear la lista
                    const ul = document.getElementById('errorList');
                    // Limpiar contenido previo
                    ul.innerHTML = '';

                    message.errors.forEach(err => {
                        const li = document.createElement('li');
                        li.textContent = err;
                        ul.appendChild(li);
                    });

                }
                else {
                    errorsDiv.style.display = 'none';
                }
                break;
            default:
                console.warn("[WebSocket] Unknown event:", message);
        }
    };

    ws.onclose = () => {
        console.warn("[WebSocket] Disconnected. Attempting reconnect every 1s...");
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log("[WebSocket] Trying to reconnect...");
                connectWebSocket();
            }, 1000);
        }
    };

    ws.onerror = (err) => {
        console.error("[WebSocket] Error:", err);
        ws.close(); // Trigger reconnect flow
    };
}

function setLayoutMode(mode) {

    console.log(`Loaded ${currentMode} recording layout`);

    if (currentMode) {
        document.getElementById('errorOverlay').style.display = 'none';
        if (currentMode === 'auto') {
            document.body.classList.add('mode-auto');
            document.body.classList.remove('mode-manual');
            setRecordingBanner(selectedPolarFile);
            fetchPolarData(selectedPolarFile);
        }
        else {
            document.body.classList.remove('mode-auto');
            document.body.classList.add('mode-manual');

            fetchPolarFiles();
        }
    }
    else {
        // Here we have an invalid recording mode
        document.getElementById('errorOverlay').style.display = 'block';
    }
}

function setRecordingBanner(selectedPolarFile) {
    if (currentMode === 'auto') {
        // Texto base
        document.getElementById('autoRecordText').textContent = 'Automatic recording in progress';
        // Fichero destacado
        document.getElementById('current-file').textContent = selectedPolarFile || '—';
    }
}

async function fetchPolarData(polarFile) {
    try {
        selectedPolarFile = polarFile;

        const url = `${API_BASE}/polar-data${polarFile ? `?fileName=${encodeURIComponent(polarFile)}` : ''}`;
        const response = await fetch(url);
        if (response.ok) {
            latestPolarData = await response.json();
            generateTable(latestPolarData);
            updateChart(latestPolarData, showFullChart);
            //updateTimestamp();
        } else {
            console.error('Failed to fetch polar data');
        }
    } catch (error) {
        console.error('Error fetching polar data:', error);
    }
}

async function fetchPolarFiles(selectedFileName) {
    try {
        console.log(`Selected polar file: ${selectedFileName}`);

        const response = await fetch(`${API_BASE}/get-polar-files`);
        if (response.ok) {
            polarFiles = await response.json();
            const select = document.getElementById('polarFileSelect');

            if (select) {
                select.innerHTML = polarFiles.map(file => `<option value="${file}">${file}</option>`).join('');
            }
            // Recuperar de localStorage si no se ha pasado selectedFileName
            let lastSelected = selectedFileName || localStorage.getItem('lastSelectedPolarFile');

            // Fallback al primero si no existe o no está en la lista
            if (!lastSelected || !polarFiles.includes(lastSelected)) {
                lastSelected = polarFiles[0];
            }

            if (polarFiles.length > 0) {
                select.value = lastSelected;
                localStorage.setItem('lastSelectedPolarFile', lastSelected);
                await fetchPolarData(lastSelected);
            }
        } else {
            console.error('Failed to fetch polar files');
        }
    } catch (error) {
        console.error('Error fetching polar files:', error);
    }
}



function updateTimestamp(payload) {
    // 1) Mantener tu texto superior "Updated at: ...":
    const now = new Date();
    const updateEl = document.getElementById('updateTime');
    if (updateEl) updateEl.textContent = `Updated at: ${now.toLocaleTimeString()}`;

    // 2) Extraer datos del último punto desde el payload
    //    Admite dos formatos:
    //    a) plano: payload.twa, payload.tws, payload.stw, payload.timestamp
    //    b) anidado: payload.lastPoint = { twa, tws, stw, timestamp }
    const p = payload?.lastPoint ?? payload ?? {};
    const n = v => (v === undefined || v === null) ? null : Number(v);
    const twa = n(p.twa);
    const tws = n(p.tws);
    const stw = n(p.stw);

    // timestamp puede venir como ms epoch, ISO o Date
    let ts = p.timestamp;
    if (!(ts instanceof Date)) ts = ts != null ? new Date(ts) : now;

    // 3) Volcar en el card de "LAST UPDATE"
    setText('last-twa', Number.isFinite(twa) ? twa.toFixed(0) : '--');
    setText('last-tws', Number.isFinite(tws) ? tws.toFixed(1) : '--');
    setText('last-stw', Number.isFinite(stw) ? stw.toFixed(1) : '--');

    const abs = formatAbs(ts);
    setText('last-date', abs);

    _lastPolarUpdateTs = ts;
    tickRelative(); // primera actualización inmediata

    // refresco periódico del relativo cada 30s
    if (_lastRelTimer) clearInterval(_lastRelTimer);
    _lastRelTimer = setInterval(tickRelative, 30 * 1000);
}

// ===== Helpers locales =====
function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
}

function formatAbs(dt) {
    // fecha/hora compacta 24h
    return dt.toLocaleString(undefined, {
        year: '2-digit', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
}

function formatRel(ms) {
    if (ms == null || !isFinite(ms)) return '(—)';
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `(${s}s)`;
    const m = Math.floor(s / 60);
    if (m < 60) return `(${m}m)`;
    const h = Math.floor(m / 60);
    if (h < 24) return `(${h}h)`;
    const d = Math.floor(h / 24);
    return `(${d}d)`;
}

function tickRelative() {
    if (!_lastPolarUpdateTs) return;
    const relEl = document.getElementById('last-relative');
    if (!relEl) return;
    const rel = formatRel(Date.now() - _lastPolarUpdateTs.getTime());
    relEl.textContent = rel;
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
            const boatSpeed = polarData[angle]?.[speed]?.boatSpeed;
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

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const has = v => v !== undefined && v !== null && Number.isFinite(v);
    const fmtSigned = (v, d = 1) => (!has(v) ? '--' : ((v > 0 ? '+' : '') + v.toFixed(d)));

    const toneBadge = (el, tone) => {
        if (!el) return;
        el.classList.remove('badge-ok', 'badge-warn', 'badge-danger');
        el.classList.add('badge');
        if (tone) el.classList.add(tone);
    };

    if (!(has(twa) && has(tws) && has(stw))) {
        ['now-twa', 'now-tws', 'now-stw', 'polar-twa', 'polar-tws', 'polar-stw'].forEach(id => setText(id, '--'));
        setText('delta-abs', '-- kt'); setText('delta-pct', '(--%)'); setText('delta-trend', '–');
        return;
    }

    // NOW
    setText('now-twa', twa.toFixed(0));
    setText('now-tws', tws.toFixed(1));
    setText('now-stw', stw.toFixed(1));

    // POLAR
    if (latestPolarData && Object.keys(latestPolarData).length) {
        const { closestTWA, closestTWS, expectedBoatSpeed } =
            findClosestPolarPoint(Math.abs(twa), tws, latestPolarData) || {};

        const exp = has(expectedBoatSpeed) ? expectedBoatSpeed : null;

        setText('polar-twa', has(closestTWA) ? closestTWA.toFixed(0) : '--');
        setText('polar-tws', has(closestTWS) ? closestTWS.toFixed(1) : '--');
        setText('polar-stw', has(exp) ? exp.toFixed(1) : '--');

        // Δ STW
        const delta = has(exp) ? (stw - exp) : null;
        const deltaPct = (has(exp) && exp > 0) ? (delta / exp) * 100 : null;

        setText('delta-abs', `${fmtSigned(delta, 1)} kt`);
        setText('delta-pct', `(${fmtSigned(deltaPct, 1)}%)`);

        const trendEl = document.getElementById('delta-trend');
        if (trendEl) trendEl.textContent = (delta > 0.05) ? '▲' : (delta < -0.05) ? '▼' : '–';

        const tone = (delta == null) ? null : (delta > 0.05 ? 'badge-ok' : (delta < -0.05 ? 'badge-danger' : 'badge-warn'));
        toneBadge(document.getElementById('delta-abs'), tone);
        toneBadge(document.getElementById('delta-pct'), tone);
    } else {
        setText('polar-twa', '--'); setText('polar-tws', '--'); setText('polar-stw', '--');
        setText('delta-abs', '-- kt'); setText('delta-pct', '(--%)'); setText('delta-trend', '–');
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

function exportCurrentPolarToCSV() {
    if (!latestPolarData || Object.keys(latestPolarData).length === 0) {
        alert("No polar data loaded.");
        return;
    }

    const angles = Object.keys(latestPolarData).map(Number).sort((a, b) => a - b);
    const speeds = [...new Set(
        Object.values(latestPolarData)
            .flatMap(row => Object.keys(row).map(Number))
    )].sort((a, b) => a - b);

    // Build CSV header
    let csv = "TWA/TWS," + speeds.join(",") + "\n";

    // Build rows
    for (const angle of angles) {
        const row = [angle];
        for (const tws of speeds) {
            const point = latestPolarData[angle]?.[tws];
            row.push(point?.boatSpeed?.toFixed(2) ?? "");
        }
        csv += row.join(",") + "\n";
    }

    // Trigger download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const filename = (selectedPolarFile || "polar").replace(/\.json$/i, ".csv");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}


function triggerFileImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.pol';
    input.addEventListener('change', () => {
        if (input.files?.length) {
            importPolarFile(input.files[0]);
        }
    });
    input.click();
}


async function importPolarFile(file) {
    const reader = new FileReader();

    reader.onload = async () => {
        const text = reader.result;
        const lines = text.trim().split(/\r?\n/);

        const delimiter = lines[0].includes(',') ? ',' : '\t';
        const headers = lines[0].split(delimiter).slice(1).map(Number);

        if (headers.some(isNaN)) {
            alert("Invalid header: some TWS values are not numbers");
            return;
        }

        const polar = {};
        let count = 0;

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(delimiter);
            const angle = parseInt(cols[0]);
            if (isNaN(angle)) {
                alert(`Invalid TWA at line ${i + 1}`);
                return;
            }
            if (!polar[angle]) polar[angle] = {};
            cols.slice(1).forEach((val, j) => {
                const boatSpeed = parseFloat(val);
                if (!isNaN(boatSpeed)) {
                    polar[angle][headers[j]] = {
                        boatSpeed,
                        timestamp: new Date().toISOString()
                    };
                    count++;
                }
            });
        }

        const originalName = file.name.replace(/\.[^.]+$/, '');
        const filename = `${originalName}.json`;

        try {
            const response = await fetch(`${API_BASE}/import-polar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: filename, data: polar })
            });

            if (!response.ok) throw new Error("Failed to import file");
            alert(`Import successful: ${count} points saved.`);
            await fetchPolarFiles(filename);
        } catch (error) {
            alert("Import failed: " + error.message);
        }
    };


    reader.readAsText(file);
}

async function startRecording(polarFile) {
    const response = await fetch(`${API_BASE}/start-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polarFile })
    });

    const result = await response.json();

    if (result.success) {
        document.getElementById('recordControls').style.display = 'block';
    } else if (result.message) {
        alert(result.message);
    }
}


async function stopRecording(save) {
    try {
        const response = await fetch(`${API_BASE}/stop-recording`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ save })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            alert(result.message || 'Failed to stop recording.');
        } else {
            alert(result.message);
            if (selectedPolarFile) {
                fetchPolarData(selectedPolarFile); // 👈 recarga para mostrar los nuevos datos
            }
        }

        document.getElementById('recordingOverlay').style.display = 'none';
        document.getElementById('manualRecordingOverlay').style.display = 'none';
    } catch (err) {
        console.error('Error stopping recording:', err);
        alert('Unexpected error stopping recording');
    }
}


// Init chart
initChart(showFullChart);
// Init
//fetchPolarFiles();
// Initial connection
connectWebSocket();

//setInterval(fetchLivePerformance, 1000);

document.addEventListener("DOMContentLoaded", () => {
    const showTableBtn = document.getElementById("showTableBtn");
    const closeTableBtn = document.getElementById("closeTableBtn");

    showTableBtn.addEventListener("click", () => {
        const container = document.getElementById("toggleTableContainer");
        container.classList.add("expanded");
    });

    closeTableBtn.addEventListener("click", () => {
        const container = document.getElementById("toggleTableContainer");
        container.classList.remove("expanded");
    });

    document.getElementById('exportPolarBtn')?.addEventListener('click', exportCurrentPolarToCSV);

    document.getElementById('importPolarBtn')?.addEventListener('click', triggerFileImport);

    const toggleFullChartBtn = document.getElementById("toggleFullChartBtn");

    toggleFullChartBtn.addEventListener("click", () => {

        showFullChart = !showFullChart;
        if (showFullChart) {
            toggleFullChartBtn.textContent = "Half polar";
        } else {
            toggleFullChartBtn.textContent = "Mirror polar";
        }

        initChart(showFullChart);
        fetchPolarData(selectedPolarFile);
    });

    document.getElementById('recordPolarBtn')?.addEventListener('click', () => {
        console.log(`Start recording in ${selectedPolarFile}`);
        startRecording(selectedPolarFile);
    });

    document.getElementById('stopSaveBtn')?.addEventListener('click', () => stopRecording(true));

    document.getElementById('newPolarBtn')?.addEventListener('click', async () => {
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

    // Cuando cambie el select, guardar en localStorage
    document.getElementById('polarFileSelect')?.addEventListener('change', (event) => {
        const value = event.target.value;
        localStorage.setItem('lastSelectedPolarFile', value);
        fetchPolarData(value);
    });

    // fetchPolarFiles().then(() => {
    //     const select = document.getElementById('polarFileSelect');
    //     select.addEventListener('change', (event) => {
    //         fetchPolarData(event.target.value);
    //     });
    // });



});
