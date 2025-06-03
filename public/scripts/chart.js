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
      type: 'line',
      animation: false
    },
    accessibility: { enabled: false },
    title: { text: '' },
    pane: {
      size: '100%',
      startAngle: -180,
      endAngle: 180
    },
    xAxis: {
      tickInterval: 15,
      min: -180,
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
      title: { text: 'Boat Speed (kt)' }
    },
    tooltip: {
      shared: false,
      formatter: function () {
        const windSpeed = this.point.series.name.split(' ')[0];
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
    series: [{
      name: 'Current Performance',
      type: 'scatter',
      color: 'black',
      marker: {
        radius: 5,
        symbol: 'circle'
      },
      data: [[0, 0]],
      enableMouseTracking: false
    }]
  });
}

function updateChart(polarData) {
  const seriesData = [];
  const windAngles = Object.keys(polarData).map(Number).sort((a, b) => a - b);
  const windSpeeds = [...new Set(Object.values(polarData).flatMap(obj => Object.keys(obj).map(Number)))].sort((a, b) => a - b);

  windSpeeds.forEach((windSpeed, index) => {
    let data = windAngles.map(angle => {
      const boatSpeed = polarData[angle]?.[windSpeed];
      return boatSpeed != null ? [angle, boatSpeed] : null;
    }).filter(Boolean);

    let mirroredData = data.map(([angle, speed]) => [-angle, speed]).reverse();
    data = [...data, ...mirroredData];

    seriesData.push({
      name: `${windSpeed} kt wind`,
      data,
      pointPlacement: 'on',
      color: colors[index % colors.length],
      connectEnds: true,
      connectNulls: true,
      visible: windSpeed < 40
    });
  });

  chart.series.slice(1).forEach(s => s.remove(false));
  seriesData.forEach(s => chart.addSeries(s, false));
  chart.redraw();
}

function updateLivePoint(angle, speed) {
  const liveSeries = chart.series.find(s => s.name === 'Current Performance');
  if (liveSeries) {
    liveSeries.setData([[angle, speed]], true);
  }
}

export { initChart, updateChart, updateLivePoint };