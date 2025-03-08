const colors = [
    '#0000FF', '#0033FF', '#0066FF', '#0099FF', '#00CCFF', '#00FFFF',
    '#00FFCC', '#00FF99', '#00FF66', '#00FF33', '#00FF00', '#99FF00',
    '#CCFF00', '#FFFF00', '#FFCC00', '#FF9900', '#FF6600', '#FF3300', '#FF0000'
];

// Define default values for tackAngle and reachAngle
let tackAngle = 45;
let reachAngle = 90;

// Initialize chart instance
let chart;

// Store latest polar data globally
let latestPolarData = {};

function initChart() {
    chart = Highcharts.chart('container', {
        chart: {
            polar: true,
            type: 'line'
        },
        title: {
            text: ''
        },
        pane: {
            size: '100%',
            startAngle: -180, // ✅ Extend pane to cover full range
            endAngle: 180
        },
        xAxis: {
            tickInterval: 15,
            min: -180,  // ✅ Extend X-axis for mirroring
            max: 180,
            labels: {
                formatter: function () {
                    return this.value + '°';
                }
            }
        },
        yAxis: {
            gridLineInterpolation: 'circle',
            lineWidth: 0,
            min: 0,
            max: 14,
            tickInterval: 2,
            title: {
                text: 'Boat Speed (kt)'
            }
        },
        tooltip: {
            shared: false,  // ✅ Ensure only the hovered point is shown
            formatter: function () {
                const windSpeed = this.point.series.name.split(' ')[0]; // ✅ Extract TWS from series name
                return `${this.x}° TWA / ${windSpeed} kt TWS: ${this.y.toFixed(2)} kt STW`;
            }
        },
        legend: {
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'middle',
            itemMarginTop: 5,
            itemMarginBottom: 5
        },
        series: [
            // Add series for current performance point
            {
                name: 'Current Performance',
                type: 'scatter',
                color: 'black',
                marker: {
                    radius: 5,
                    symbol: 'circle'
                },
                data: [[0, 0]], // Initial placeholder
                enableMouseTracking: false
            }
        ]
    });
}


// Fetch and store polar data
async function fetchPolarData() {
    try {
        const response = await fetch('/signalk/v1/api/signalk-polar-recorder/polar-data');
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

// Update timestamp display
function updateTimestamp() {
    const updateTimeElement = document.getElementById('updateTime');
    const now = new Date();
    const formattedTime = now.toLocaleTimeString();
    updateTimeElement.textContent = `Updated at: ${formattedTime}`;
}

// Generate data table for polar data
function generateTable(polarData) {
    const tableHeader = document.querySelector('#polarTable thead');
    const tableBody = document.querySelector('#polarTableBody');

    // Extract wind angles (keys at top level) and wind speeds (nested keys)
    let windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b);
    let windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b);

    // Remove TWA = 0
    windAngles = windAngles.filter(angle => angle !== 0);

    // Remove TWS = 0
    windSpeeds = windSpeeds.filter(speed => speed !== 0);

    // Create table header (TWS values as columns)
    let headerRow = '<tr><th>TWA/TWS</th>';
    windSpeeds.forEach(speed => {
        headerRow += `<th>${speed} kt</th>`;
    });
    headerRow += '</tr>';
    tableHeader.innerHTML = headerRow;

    // Create table body (TWA values as rows)
    tableBody.innerHTML = '';
    windAngles.forEach(angle => {
        let row = `<tr><td>${angle}°</td>`; // First column (TWA)
        windSpeeds.forEach(speed => {
            const boatSpeed = polarData[angle] && polarData[angle][speed] ? polarData[angle][speed].toFixed(1) : '-';
            row += `<td>${boatSpeed}</td>`;
        });
        row += '</tr>';
        tableBody.innerHTML += row;
    });
}

function findClosestPolarPoint(windAngle, windSpeed, polarData) {
    let closestTWA = null;
    let closestTWS = null;
    let expectedBoatSpeed = 0;
    let minDistance = Infinity;

    const windAngles = Object.keys(polarData).map(Number);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))];

    windAngles.forEach(twa => {
        windSpeeds.forEach(tws => {
            if (polarData[twa] && polarData[twa][tws] !== undefined) {
                const distance = Math.sqrt(Math.pow(twa - windAngle, 2) + Math.pow(tws - windSpeed, 2));
                if (distance < minDistance) {
                    minDistance = distance;
                    closestTWA = twa;
                    closestTWS = tws;
                    expectedBoatSpeed = polarData[twa][tws];
                }
            }
        });
    });

    return { closestTWA, closestTWS, expectedBoatSpeed };
}

function updateChart(polarData) {
    const seriesData = [];

    // Extract wind angles and wind speeds dynamically
    const windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b);

    windSpeeds.forEach((windSpeed, index) => {
        let data = windAngles.map(angle => {
            const boatSpeed = polarData[angle] && polarData[angle][windSpeed]
                ? parseFloat(polarData[angle][windSpeed])
                : null;

            return boatSpeed !== null ? [angle, boatSpeed] : null;
        }).filter(point => point !== null); // Remove null values

        // ✅ Append mirrored values in correct order (descending)
        let mirroredData = data.map(([angle, speed]) => [-angle, speed]).reverse();

        // ✅ Combine original and mirrored data in the correct order
        data = [...data, ...mirroredData];

        seriesData.push({
            name: `${windSpeed} kt wind`,
            data: data,
            pointPlacement: 'on',
            color: colors[index % colors.length],  
            connectEnds: true,
            connectNulls: true,
            visible: windSpeed < 40
        });
    });

    // Remove existing series (except the first one)
    chart.series.slice(1).forEach(s => s.remove(false));

    // Add updated series
    seriesData.forEach(s => chart.addSeries(s, false));

    chart.redraw();
}

// Update current performance point on the chart & Live Data
function updateLivePoint(angle, speed, windSpeed) {
    const liveSeries = chart.series.find(s => s.name === 'Current Performance');
    if (liveSeries) {
        liveSeries.setData([[angle, speed]], true);
    }

    // Find closest polar data
    const { closestTWA, closestTWS, expectedBoatSpeed } = findClosestPolarPoint(angle, windSpeed, latestPolarData);

    // Calculate differences
    const absoluteDifference = (speed - expectedBoatSpeed).toFixed(2);
    const percentageDifference = expectedBoatSpeed > 0 ? ((absoluteDifference / expectedBoatSpeed) * 100).toFixed(1) : "--";

    // Update Live Data Display
    document.getElementById("windAngle").textContent = `Wind Angle: ${angle.toFixed(1)}°`;
    document.getElementById("windSpeed").textContent = `Wind Speed: ${windSpeed.toFixed(1)} kt`;
    document.getElementById("boatSpeed").textContent = `Boat Speed: ${speed.toFixed(1)} kt`;
    document.getElementById("closestPolar").textContent = `Closest Polar: ${closestTWS} kt TWS / ${closestTWA}° TWA`;
    document.getElementById("speedDifference").textContent = `Difference: ${absoluteDifference} kt (${percentageDifference}%)`;
}

async function fetchSignalKData() {
    try {
        const response = await fetch('/signalk/v1/api/vessels/self');
        if (!response.ok) {
            throw new Error('Failed to fetch SignalK data');
        }

        const data = await response.json();

        // Extract wind angle, wind speed, and boat speed from SignalK paths
        const windAngle = data.environment?.wind?.angleTrueGround?.value || 0;
        const windSpeed = data.environment?.wind?.speedOverGround?.value || 0;
        const boatSpeed = data.navigation?.speedThroughWater?.value || 0;

        // Convert values where necessary
        const windAngleDeg = (windAngle * 180) / Math.PI; // Convert radians to degrees
        const windSpeedKnots = windSpeed * 1.94384; // Convert m/s to knots
        const boatSpeedKnots = boatSpeed * 1.94384;

        // Update the live chart point and display
        updateLivePoint(windAngleDeg, boatSpeedKnots, windSpeedKnots);
    } catch (error) {
        console.error("Error fetching SignalK data:", error);
    }
}

// Poll SignalK data every second
setInterval(fetchSignalKData, 1000);

fetchPolarData();
initChart();

// Toggle table visibility
document.addEventListener("DOMContentLoaded", function () {
    const toggleTableBtn = document.getElementById("toggleTableBtn");
    const polarTable = document.getElementById("polarTable");

    toggleTableBtn.addEventListener("click", function () {
        if (polarTable.style.display === "none") {
            polarTable.style.display = "table";
            toggleTableBtn.textContent = "Hide Table";
        } else {
            polarTable.style.display = "none";
            toggleTableBtn.textContent = "Show Table";
        }
    });
});