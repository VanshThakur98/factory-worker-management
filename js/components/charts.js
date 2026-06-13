let chartInstances = {};

export function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

export function destroyAllCharts() {
  Object.keys(chartInstances).forEach(destroyChart);
}

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#9aa0a6', font: { family: 'Roboto', size: 11 }, boxWidth: 12 }
    }
  },
  scales: {
    x: { ticks: { color: '#9aa0a6', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
    y: { ticks: { color: '#9aa0a6', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
  }
};

export function renderAttendanceChart(canvasId, data) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data) return;

  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels || [],
      datasets: [
        { label: 'Present', data: data.present || [], backgroundColor: 'rgba(52, 168, 83, 0.7)', borderRadius: 4 },
        { label: 'Absent', data: data.absent || [], backgroundColor: 'rgba(234, 67, 53, 0.7)', borderRadius: 4 },
        { label: 'Overtime', data: data.overtime || [], backgroundColor: 'rgba(124, 77, 255, 0.7)', borderRadius: 4 }
      ]
    },
    options: {
      ...chartDefaults,
      plugins: { ...chartDefaults.plugins, legend: { ...chartDefaults.plugins.legend, position: 'bottom' } },
      scales: {
        x: { ...chartDefaults.scales.x, stacked: true },
        y: { ...chartDefaults.scales.y, stacked: true }
      }
    }
  });
}

export function renderPayrollChart(canvasId, data) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data) return;

  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels || [],
      datasets: [
        { label: 'Regular Pay', data: data.regularPay || [], backgroundColor: 'rgba(26, 115, 232, 0.7)', borderRadius: 4 },
        { label: 'Overtime Pay', data: data.overtimePay || [], backgroundColor: 'rgba(66, 133, 244, 0.7)', borderRadius: 4 }
      ]
    },
    options: {
      ...chartDefaults,
      plugins: { ...chartDefaults.plugins, legend: { ...chartDefaults.plugins.legend, position: 'bottom' } },
      scales: {
        x: { ...chartDefaults.scales.x, stacked: true },
        y: { ...chartDefaults.scales.y, stacked: true }
      }
    }
  });
}

export function renderDoughnutChart(canvasId, labels, values, colors) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9aa0a6', font: { size: 11 }, boxWidth: 12 } }
      },
      cutout: '65%'
    }
  });
}

export function renderLineChart(canvasId, labels, datasets) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      ...chartDefaults,
      plugins: { ...chartDefaults.plugins, legend: { ...chartDefaults.plugins.legend, position: 'bottom' } },
      elements: { line: { tension: 0.4 }, point: { radius: 3 } }
    }
  });
}
