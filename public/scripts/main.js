import Highcharts from 'highcharts';
import More from 'highcharts/highcharts-more';
import Exporting from 'highcharts/modules/exporting';

// Initialize Highcharts modules
More(Highcharts);
Exporting(Highcharts);

const colors = [
    '#0000FF', '#0033FF', '#0066FF', '#0099FF', '#00CCFF', '#00FFFF',
    '#00FFCC', '#00FF99', '#00FF66', '#00FF33', '#00FF00', '#99FF00',
    '#CCFF00', '#FFFF00', '#FFCC00', '#FF9900', '#FF6600', '#FF3300', '#FF0000'
];

let chart;

function initChart() {
    chart = Highcharts.chart('container', {
        chart: {
            polar: true,
            type: 'line'
        },
        title: { text: 'Polar Performance Chart' },
        pane: { size: '100%', startAngle: 0, endAngle: 180 },
        xAxis: { tickInterval: 15, min: 0, max: 180, labels: { formatter: function () { return this.value + '°'; } } },
        yAxis: { gridLineInterpolation: 'polygon', lineWidth: 0, min: 0, max: 14, tickInterval: 2, title: { text: 'Boat Speed (kt)' } },
        tooltip: { shared: true, formatter: function () { return `${this.x}°: ${this.y.toFixed(2)} kt`; } },
        legend: { layout: 'vertical', align: 'right', verticalAlign: 'middle', itemMarginTop: 5, itemMarginBottom: 5 },
        series: [{ name: 'Current Performance', type: 'scatter', color: 'black', marker: { radius: 5, symbol: 'circle' }, data: [[0, 0]], enableMouseTracking: false }]
    });
}

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

function updateTimestamp() {
    document.getElementById('updateTime').textContent = `Updated at: ${new Date().toLocaleTimeString()}`;
}

function generateTable(polarData) {
    const tableHeader = document.querySelector('#polarTable thead');
    const tableBody = document.querySelector('#polarTableBody');
    const windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b);

    tableHeader.innerHTML = '<tr><th>Wind Speed (kt)</th>' + windAngles.map(angle => `<th>${angle}°</th>`).join('') + '</tr>';
    tableBody.innerHTML = windSpeeds.map(speed => `<tr><td>${speed}</td>` + windAngles.map(angle => `<td>${polarData[angle]?.[speed]?.toFixed(1) || '-'}</td>`).join('') + '</tr>').join('');
}

function updateChart(polarData) {
    const windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b);
    const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b);
    const seriesData = windSpeeds.map((windSpeed, index) => ({
        name: `${windSpeed} kt wind`,
        data: windAngles.map(angle => [angle, parseFloat(polarData[angle]?.[windSpeed]) || null]),
        pointPlacement: 'on',
        color: colors[index % colors.length],
        connectEnds: true,
        connectNulls: true
    }));

    chart.series.slice(1).forEach(s => s.remove(false));
    seriesData.forEach(s => chart.addSeries(s, false));
    chart.redraw();
}

function updateLivePoint(angle, speed, windSpeed) {
    const liveSeries = chart.series.find(s => s.name === 'Current Performance');
    liveSeries?.setData([[angle, speed]], true);

    document.getElementById("windAngle").textContent = `Wind Angle: ${angle.toFixed(1)}°`;
    document.getElementById("windSpeed").textContent = `Wind Speed: ${windSpeed.toFixed(1)} kt`;
    document.getElementById("boatSpeed").textContent = `Boat Speed: ${speed.toFixed(1)} kt`;
}

async function fetchSignalKData() {
    try {
        const response = await fetch('/signalk/v1/api/vessels/self');
        if (!response.ok) throw new Error('Failed to fetch SignalK data');

        const data = await response.json();
        const windAngle = (data.environment?.wind?.angleTrueGround?.value || 0) * (180 / Math.PI);
        const windSpeedKnots = (data.environment?.wind?.speedOverGround?.value || 0) * 1.94384;
        const boatSpeedKnots = (data.navigation?.speedThroughWater?.value || 0) * 1.94384;

        updateLivePoint(windAngle, boatSpeedKnots, windSpeedKnots);
    } catch (error) {
        console.error("Error fetching SignalK data:", error);
    }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    initChart();
    fetchPolarData();
    setInterval(fetchSignalKData, 1000);
});
