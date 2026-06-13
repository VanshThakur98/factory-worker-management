import { api } from '../services/api.js';
import { formatCurrency, formatDisplayDate, getToday, getMonthName, normalizeDate } from '../utils/helpers.js';
import { computePayrollFromAttendance } from '../utils/payroll.js';
import { renderAttendanceChart, renderPayrollChart, destroyAllCharts } from '../components/charts.js';
import { Storage } from '../services/storage.js';

let selectedDate = getToday();

export async function renderDashboard(container) {
  destroyAllCharts();
  const settings = Storage.getSettings();
  const month = selectedDate.substring(0, 7);

  container.innerHTML = `
    <div class="dashboard-greeting">
      <h2>Good ${getGreeting()}, Manager</h2>
      <div class="dashboard-date-picker">
        <label for="dashboardDate">View data for</label>
        <input type="date" id="dashboardDate" class="form-control" value="${selectedDate}">
      </div>
    </div>
    <div class="stat-grid" id="statGrid">${renderStatSkeleton()}</div>
    <div class="card chart-card">
      <div class="section-title">Attendance Overview <span>${getMonthName(month)}</span></div>
      <div class="chart-container"><canvas id="attendanceChart"></canvas></div>
    </div>
    <div class="card chart-card">
      <div class="section-title">Payroll Breakdown</div>
      <div class="chart-container"><canvas id="payrollChart"></canvas></div>
    </div>
    <div id="monthlyStatsSection"></div>
    <div class="card">
      <div class="section-title">Recent Activity</div>
      <div id="recentActivity"></div>
    </div>`;

  container.querySelector('#dashboardDate').addEventListener('change', (e) => {
    selectedDate = e.target.value;
    loadDashboardData(container, settings);
  });

  await loadDashboardData(container, settings);
}

async function loadDashboardData(container, settings) {
  const month = selectedDate.substring(0, 7);
  const dateLabel = formatDisplayDate(selectedDate);

  container.querySelector('#statGrid').innerHTML = renderStatSkeleton(dateLabel);
  container.querySelector('#recentActivity').innerHTML = '<div class="spinner" style="margin:16px auto"></div>';

  try {
    const [attResult, workersResult] = await Promise.all([
      api.getAttendance({ month }),
      api.getWorkers({ status: 'Active' })
    ]);

    const attendance = (attResult.data || []).map(r => ({ ...r, Date: normalizeDate(r.Date) }));
    const workers = workersResult.data || [];
    const todayRecords = attendance.filter(r => normalizeDate(r.Date) === selectedDate);
    const activeWorkers = workers.filter(w => String(w.Status).toLowerCase() === 'active');

    const livePayroll = computePayrollFromAttendance(attendance, workers, settings);
    const monthlyTotal = livePayroll.reduce((s, r) => s + r.TotalPay, 0);

    const dashData = buildClientDashboard(todayRecords, activeWorkers, attendance, livePayroll, monthlyTotal);
    dashData.monthlyPayrollCost = monthlyTotal;
    dashData.payrollChart = {
      labels: livePayroll.map(p => p.WorkerName),
      regularPay: livePayroll.map(p => p.RegularPay),
      overtimePay: livePayroll.map(p => p.OvertimePay),
      totalPay: livePayroll.map(p => p.TotalPay)
    };

    updateStats(dashData, settings, dateLabel);
    updateMonthlyStats(dashData.monthlyStats);
    updateRecentActivity(dashData.recentActivity || []);

    if (dashData.attendanceChart) renderAttendanceChart('attendanceChart', dashData.attendanceChart);
    if (dashData.payrollChart) renderPayrollChart('payrollChart', dashData.payrollChart);
  } catch (error) {
    container.querySelector('#statGrid').innerHTML = `
      <div class="empty-state wide" style="grid-column:span 2">
        <span class="material-symbols-rounded">cloud_off</span>
        <h3>Unable to load dashboard</h3>
        <p>${error.message}</p>
      </div>`;
  }
}

function buildClientDashboard(todayRecords, activeWorkers, monthAttendance, livePayroll, monthlyTotal) {
  const presentToday = todayRecords.filter(a => {
    const s = String(a.AttendanceStatus || '').toLowerCase();
    return s === 'present' || s === 'half day';
  }).length;

  const absentToday = todayRecords.filter(a =>
    String(a.AttendanceStatus || '').toLowerCase() === 'absent'
  ).length;

  let overtimeHoursToday = 0;
  let totalHoursToday = 0;
  todayRecords.forEach(a => {
    totalHoursToday += parseFloat(a.WorkedHours) || 0;
    const s = String(a.AttendanceStatus || '').toLowerCase();
    if (s === 'overtime') {
      overtimeHoursToday += parseFloat(a.OvertimeHours) || parseFloat(a.WorkedHours) || 0;
    } else {
      overtimeHoursToday += parseFloat(a.OvertimeHours) || 0;
    }
  });

  const unmarked = Math.max(activeWorkers.length - todayRecords.length, 0);

  const byDate = {};
  monthAttendance.forEach(a => {
    const date = normalizeDate(a.Date);
    if (!byDate[date]) byDate[date] = { present: 0, absent: 0, overtime: 0 };
    const s = String(a.AttendanceStatus || '').toLowerCase();
    if (s === 'present' || s === 'half day') byDate[date].present++;
    else if (s === 'absent') byDate[date].absent++;
    else if (s === 'overtime') byDate[date].overtime++;
  });

  const labels = Object.keys(byDate).sort();
  let present = 0, absent = 0, overtime = 0;
  monthAttendance.forEach(a => {
    const s = String(a.AttendanceStatus || '').toLowerCase();
    if (s === 'present' || s === 'half day') present++;
    else if (s === 'absent') absent++;
    else if (s === 'overtime') overtime++;
  });

  return {
    totalWorkers: activeWorkers.length,
    presentToday,
    absentToday: absentToday + unmarked,
    overtimeHoursToday: Math.round(overtimeHoursToday * 100) / 100,
    totalHoursToday: Math.round(totalHoursToday * 100) / 100,
    monthlyPayrollCost: monthlyTotal,
    recentActivity: monthAttendance.slice(-10).reverse(),
    monthlyStats: { present, absent, overtimeDays: overtime },
    attendanceChart: {
      labels,
      present: labels.map(d => byDate[d].present),
      absent: labels.map(d => byDate[d].absent),
      overtime: labels.map(d => byDate[d].overtime)
    }
  };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function renderStatSkeleton(dateLabel) {
  const stats = [
    { icon: 'groups', label: 'Total Workers', color: '#1a73e8' },
    { icon: 'check_circle', label: `Present (${dateLabel})`, color: '#34a853' },
    { icon: 'cancel', label: `Absent (${dateLabel})`, color: '#ea4335' },
    { icon: 'more_time', label: `OT Hours (${dateLabel})`, color: '#7c4dff' },
    { icon: 'schedule', label: `Hours (${dateLabel})`, color: '#4285f4' },
    { icon: 'payments', label: 'Monthly Payroll', color: '#188038', wide: true }
  ];

  return stats.map(s => `
    <div class="stat-card ${s.wide ? 'wide' : ''}">
      <div class="stat-icon" style="background:${s.color}22;color:${s.color}">
        <span class="material-symbols-rounded">${s.icon}</span>
      </div>
      <div class="stat-value">--</div>
      <div class="stat-label">${s.label}</div>
    </div>`).join('');
}

function updateStats(data, settings, dateLabel) {
  const values = [
    data.totalWorkers,
    data.presentToday,
    data.absentToday,
    (data.overtimeHoursToday || 0) + 'h',
    (data.totalHoursToday || 0) + 'h',
    formatCurrency(data.monthlyPayrollCost || 0, settings.currency)
  ];

  document.querySelectorAll('#statGrid .stat-value').forEach((el, i) => {
    el.textContent = values[i] ?? '--';
  });
}

function updateMonthlyStats(stats) {
  const section = document.getElementById('monthlyStatsSection');
  if (!stats) return;

  section.innerHTML = `
    <div class="section-title">Monthly Statistics</div>
    <div class="monthly-stats">
      <div class="monthly-stat present"><div class="value">${stats.present}</div><div class="label">Present</div></div>
      <div class="monthly-stat absent"><div class="value">${stats.absent}</div><div class="label">Absent</div></div>
      <div class="monthly-stat overtime"><div class="value">${stats.overtimeDays || 0}</div><div class="label">Overtime</div></div>
    </div>`;
}

function updateRecentActivity(activities) {
  const container = document.getElementById('recentActivity');
  if (!activities.length) {
    container.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
    return;
  }

  container.innerHTML = activities.map(a => {
    const status = (a.AttendanceStatus || '').toLowerCase();
    const dotClass = status === 'overtime' ? 'overtime' :
      status === 'present' || status === 'half day' ? 'present' : 'absent';
    const badge = status === 'overtime' ? 'badge-overtime' :
      dotClass === 'present' ? 'badge-present' : 'badge-absent';
    return `
      <div class="activity-item">
        <div class="activity-dot ${dotClass}"></div>
        <div class="activity-info">
          <strong>${a.WorkerName}</strong>
          <span>${formatDisplayDate(a.Date)} · ${a.AttendanceStatus} · ${a.WorkedHours || 0}h</span>
        </div>
        <span class="badge ${badge}">${a.AttendanceStatus}</span>
      </div>`;
  }).join('');
}
