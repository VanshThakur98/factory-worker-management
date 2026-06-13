import { api } from '../services/api.js';
import { getToday, getCurrentMonth, getWeekRange, getMonthName, formatDisplayDate, formatCurrency } from '../utils/helpers.js';
import { Storage } from '../services/storage.js';
import { showToast } from '../components/toast.js';
import { renderDoughnutChart, destroyAllCharts } from '../components/charts.js';
import { exportAttendance, exportPayroll, exportWorkers, exportAttendancePDF, exportPayrollPDF, exportMonthlyReportPDF } from '../services/export.js';
import { renderInlineLoader } from '../components/loader.js';

export async function renderReports(container) {
  destroyAllCharts();
  container.innerHTML = `
    <div class="report-type-grid">
      <div class="card report-type-card" data-report="daily">
        <span class="material-symbols-rounded">today</span>
        <h4>Daily Attendance</h4>
      </div>
      <div class="card report-type-card" data-report="weekly">
        <span class="material-symbols-rounded">date_range</span>
        <h4>Weekly Attendance</h4>
      </div>
      <div class="card report-type-card" data-report="monthly">
        <span class="material-symbols-rounded">calendar_month</span>
        <h4>Monthly Attendance</h4>
      </div>
      <div class="card report-type-card" data-report="payrollSummary">
        <span class="material-symbols-rounded">payments</span>
        <h4>Payroll Summary</h4>
      </div>
      <div class="card report-type-card" data-report="monthlyReport">
        <span class="material-symbols-rounded">summarize</span>
        <h4>Monthly Report</h4>
      </div>
    </div>
    <div id="reportContent"></div>
    <div class="card" id="exportSection" style="display:none">
      <div class="section-title">Export Data</div>
      <div class="export-actions">
        <button class="btn btn-outline btn-sm" id="exportWorkersBtn">
          <span class="material-symbols-rounded">groups</span> Workers
        </button>
        <button class="btn btn-outline btn-sm" id="exportAttendanceBtn">
          <span class="material-symbols-rounded">schedule</span> Attendance
        </button>
        <button class="btn btn-outline btn-sm" id="exportPayrollBtn">
          <span class="material-symbols-rounded">payments</span> Payroll
        </button>
      </div>
      <div class="export-actions" style="margin-top:8px">
        <button class="btn btn-secondary btn-sm" id="exportAttPdfBtn">Attendance PDF</button>
        <button class="btn btn-secondary btn-sm" id="exportPayPdfBtn">Payroll PDF</button>
        <button class="btn btn-secondary btn-sm" id="exportMonthPdfBtn">Monthly PDF</button>
      </div>
    </div>
  `;

  let currentReportData = null;
  let currentReportType = null;

  container.querySelectorAll('[data-report]').forEach(card => {
    card.addEventListener('click', () => loadReport(container, card.dataset.report));
  });

  bindExportButtons(container, () => currentReportData, () => currentReportType);

  async function loadReport(cont, type) {
    const content = cont.querySelector('#reportContent');
    const exportSection = cont.querySelector('#exportSection');
    content.innerHTML = renderInlineLoader('Loading report...');
    currentReportType = type;

    try {
      let result;
      const month = getCurrentMonth();
      const week = getWeekRange();

      switch (type) {
        case 'daily':
          result = await api.getReports({ reportType: 'daily', startDate: getToday() });
          break;
        case 'weekly':
          result = await api.getReports({ reportType: 'weekly', startDate: week.start, endDate: week.end });
          break;
        case 'monthly':
          result = await api.getReports({ reportType: 'monthly', month });
          break;
        case 'payrollSummary':
          result = await api.getReports({ reportType: 'payrollSummary', month });
          break;
        case 'monthlyReport':
          result = await api.getDashboard();
          break;
      }

      currentReportData = result;
      renderReportContent(content, type, result);
      exportSection.style.display = 'block';
    } catch (error) {
      content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
    }
  }
}

function renderReportContent(container, type, result) {
  destroyAllCharts();

  if (type === 'payrollSummary') {
    const data = result.data?.data || result.data || {};
    const records = data.records || [];
    const settings = Storage.getSettings();

    container.innerHTML = `
      <div class="card">
        <div class="section-title">Payroll Summary — ${getMonthName(getCurrentMonth())}</div>
        <div class="payroll-summary">
          <div class="card payroll-card"><div class="amount">${formatCurrency(data.totalPayroll || 0, settings.currency)}</div><div class="label">Total</div></div>
          <div class="card payroll-card"><div class="amount">${formatCurrency(data.overtimeCost || 0, settings.currency)}</div><div class="label">OT Cost</div></div>
        </div>
        <div class="chart-container"><canvas id="reportChart"></canvas></div>
      </div>
    `;

    if (records.length) {
      renderDoughnutChart('reportChart',
        records.slice(0, 8).map(r => r.WorkerName),
        records.slice(0, 8).map(r => parseFloat(r.TotalPay) || 0),
        ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#4285f4', '#7c4dff', '#00bcd4', '#ff6d00']
      );
    }
    return;
  }

  if (type === 'monthlyReport') {
    const data = result.data || {};
    container.innerHTML = `
      <div class="card">
        <div class="section-title">Monthly Report</div>
        <div class="monthly-stats">
          <div class="monthly-stat present"><div class="value">${data.monthlyStats?.present || 0}</div><div class="label">Present</div></div>
          <div class="monthly-stat absent"><div class="value">${data.monthlyStats?.absent || 0}</div><div class="label">Absent</div></div>
          <div class="monthly-stat overtime"><div class="value">${data.monthlyStats?.overtimeDays || 0}</div><div class="label">Overtime</div></div>
        </div>
        <div class="chart-container"><canvas id="reportChart"></canvas></div>
      </div>
    `;

    if (data.attendanceChart) {
      import('../components/charts.js').then(({ renderAttendanceChart }) => {
        renderAttendanceChart('reportChart', data.attendanceChart);
      });
    }
    return;
  }

  const records = result.data?.data || result.data || [];

  if (!records.length) {
    container.innerHTML = '<div class="empty-state"><p>No data for this report</p></div>';
    return;
  }

  const present = records.filter(r => (r.AttendanceStatus || '').toLowerCase() === 'present').length;
  const absent = records.filter(r => (r.AttendanceStatus || '').toLowerCase() === 'absent').length;
  const overtime = records.filter(r => (r.AttendanceStatus || '').toLowerCase() === 'overtime').length;

  container.innerHTML = `
    <div class="card">
      <div class="section-title">${type.charAt(0).toUpperCase() + type.slice(1)} Report (${records.length} records)</div>
      <div class="chart-container" style="height:180px"><canvas id="reportChart"></canvas></div>
      <div class="table-container" style="margin-top:16px;max-height:300px;overflow-y:auto">
        <table class="data-table">
          <thead><tr><th>Worker</th><th>Date</th><th>Status</th><th>Hours</th></tr></thead>
          <tbody>
            ${records.slice(0, 50).map(r => `
              <tr>
                <td>${r.WorkerName}</td>
                <td>${formatDisplayDate(r.Date || r.StartDate)}</td>
                <td>${r.AttendanceStatus || r.Status || '-'}</td>
                <td>${r.WorkedHours || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderDoughnutChart('reportChart',
    ['Present', 'Absent', 'Overtime'],
    [present, absent, overtime],
    ['#34a853', '#ea4335', '#7c4dff']
  );
}

function bindExportButtons(container, getData, getType) {
  container.querySelector('#exportWorkersBtn').addEventListener('click', async () => {
    try {
      const result = await api.getWorkers();
      exportWorkers(result.data || []);
      showToast('Workers exported', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  container.querySelector('#exportAttendanceBtn').addEventListener('click', async () => {
    try {
      const result = await api.getAttendance({ month: getCurrentMonth() });
      exportAttendance(result.data || []);
      showToast('Attendance exported', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  container.querySelector('#exportPayrollBtn').addEventListener('click', async () => {
    try {
      const result = await api.getPayroll({ month: getCurrentMonth() });
      exportPayroll(result.data || []);
      showToast('Payroll exported', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  container.querySelector('#exportAttPdfBtn').addEventListener('click', async () => {
    try {
      const result = await api.getAttendance({ month: getCurrentMonth() });
      exportAttendancePDF(result.data || [], getMonthName(getCurrentMonth()));
      showToast('PDF generated', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  container.querySelector('#exportPayPdfBtn').addEventListener('click', async () => {
    try {
      const result = await api.getPayroll({ month: getCurrentMonth() });
      exportPayrollPDF(result.data || [], getCurrentMonth());
      showToast('PDF generated', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  container.querySelector('#exportMonthPdfBtn').addEventListener('click', async () => {
    try {
      const result = await api.getDashboard();
      exportMonthlyReportPDF(result.data || {}, getCurrentMonth());
      showToast('PDF generated', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}
