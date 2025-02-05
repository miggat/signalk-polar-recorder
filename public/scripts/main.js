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

function initChart() {
    chart = Highcharts.chart('container', {
        chart: {
            polar: true,
            type: 'line'
        },
        title: {
            text: 'Polar Performance Chart'
        },
        pane: {
            size: '100%',
            startAngle: 0,
            endAngle: 180
        },
        xAxis: {
            tickInterval: 15,
            min: 0,
            max: 180,
            labels: {
                formatter: function () {
                    return this.value + '°';
                }
            }
        },
        yAxis: {
            gridLineInterpolation: 'polygon',
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
        }        ,
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

// Fetch and display polar data
async function fetchPolarData() {
    try {
        const response = await fetch('/signalk/v1/api/signalk-polar-recorder/polar-data');
        if (response.ok) {
            const data = await response.json();
            generateTable(data);
            updateChart(data);
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

    // Extract wind angles (top-level keys) and wind speeds (nested keys)
    const windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b);

    let headerRow = '<tr><th>Wind Speed (kt)</th>';
    windAngles.forEach(angle => {
        headerRow += `<th>${angle}°</th>`;
    });
    headerRow += '</tr>';
    tableHeader.innerHTML = headerRow;

    tableBody.innerHTML = '';
    windSpeeds.forEach(speed => {
        let row = `<tr><td>${speed}</td>`;
        windAngles.forEach(angle => {
            const boatSpeed = polarData[angle] && polarData[angle][speed] ? polarData[angle][speed].toFixed(1) : '-';
            row += `<td>${boatSpeed}</td>`;
        });
        row += '</tr>';
        tableBody.innerHTML += row;
    });
}



function updateChart(polarData) {
    const seriesData = [];

    // Extract wind angles and wind speeds dynamically
    const windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b);

    windSpeeds.forEach((windSpeed, index) => {
        const data = windAngles.map(angle => {
            const boatSpeed = polarData[angle] && polarData[angle][windSpeed]
                ? parseFloat(polarData[angle][windSpeed])
                : null;
            return [angle, boatSpeed];
        });

        seriesData.push({
            name: `${windSpeed} kt wind`,
            data: data,
            pointPlacement: 'on',
            color: colors[index % colors.length],  // Ensure color cycling
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


// Update current performance point on the chart
function updateLivePoint(angle, speed, windSpeed) {
    const liveSeries = chart.series.find(s => s.name === 'Current Performance');
    if (liveSeries) {
        liveSeries.setData([[angle, speed]], true);
    }

    // Update the live data display
    document.getElementById("windAngle").textContent = `Wind Angle: ${angle.toFixed(1)}°`;
    document.getElementById("windSpeed").textContent = `Wind Speed: ${windSpeed.toFixed(1)} kt`;
    document.getElementById("boatSpeed").textContent = `Boat Speed: ${speed.toFixed(1)} kt`;
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
// setInterval(fetchPolarData, 5000);