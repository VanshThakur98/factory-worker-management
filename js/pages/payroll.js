import { api } from '../services/api.js';
import { formatCurrency, formatDisplayDate, getToday, getCurrentMonth, getMonthName, normalizeDate } from '../utils/helpers.js';
import { computePayrollFromAttendance, getRateLabel } from '../utils/payroll.js';
import { showToast } from '../components/toast.js';
import { exportPayroll, exportPayrollPDF } from '../services/export.js';
import { Storage } from '../services/storage.js';
import { showDialog } from '../components/dialog.js';

let payrollRecords = [];
let allWorkers = [];
let fromDate = getCurrentMonth() + '-01';
let toDate = getToday();
let selectedWorkerId = '';

export async function renderPayroll(container) {
  container.innerHTML = `
    <div class="card glass" style="padding:16px;margin-bottom:12px">
      <div class="form-row">
        <div class="form-group">
          <label>From Date</label>
          <input type="date" class="form-control" id="payrollFromDate" value="${fromDate}">
        </div>
        <div class="form-group">
          <label>To Date</label>
          <input type="date" class="form-control" id="payrollToDate" value="${toDate}">
        </div>
      </div>
      <div class="form-group">
        <label>Worker</label>
        <select class="form-control" id="payrollWorker">
          <option value="">All Workers</option>
        </select>
      </div>
    </div>
    <div id="payrollDashboard"></div>
    <div id="payrollList"></div>
    <button class="btn btn-secondary" id="generatePayroll" style="width:100%;margin-top:12px">
      <span class="material-symbols-rounded">save</span> Save Payroll for ${getMonthName(getCurrentMonth())}
    </button>`;

  bindEvents(container);
  await loadWorkersList(container);
  await loadPayroll(container);
}

function bindEvents(container) {
  container.querySelector('#generatePayroll').addEventListener('click', async () => {
    try {
      await api.generatePayroll(getCurrentMonth());
      showToast('Payroll saved for ' + getMonthName(getCurrentMonth()), 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  container.querySelector('#payrollFromDate').addEventListener('change', (e) => {
    fromDate = e.target.value;
    loadPayroll(container);
  });

  container.querySelector('#payrollToDate').addEventListener('change', (e) => {
    toDate = e.target.value;
    loadPayroll(container);
  });

  container.querySelector('#payrollWorker').addEventListener('change', (e) => {
    selectedWorkerId = e.target.value;
    loadPayroll(container);
  });
}

async function loadWorkersList(container) {
  try {
    const workersResult = await api.getWorkers({ status: 'Active' });
    allWorkers = workersResult.data || [];
    const select = container.querySelector('#payrollWorker');
    select.innerHTML = '<option value="">All Workers</option>' +
      allWorkers.map(w => `<option value="${w.WorkerID}"${w.WorkerID === selectedWorkerId ? ' selected' : ''}>${w.WorkerName}</option>`).join('');
  } catch {
    allWorkers = [];
  }
}

async function loadPayroll(container) {
  const dashboard = container.querySelector('#payrollDashboard');
  const list = container.querySelector('#payrollList');
  dashboard.innerHTML = '<div class="spinner" style="margin:24px auto"></div>';
  list.innerHTML = '';

  if (fromDate > toDate) {
    dashboard.innerHTML = '<div class="empty-state"><h3>Invalid range</h3><p>From date must be before To date</p></div>';
    return;
  }

  try {
    const settings = Storage.getSettings();
    const attResult = await api.getAttendance({ startDate: fromDate, endDate: toDate });
    let attendance = (attResult.data || []).map(r => ({ ...r, Date: normalizeDate(r.Date) }));

    let workers = allWorkers.length ? allWorkers : (await api.getWorkers({ status: 'Active' })).data || [];

    if (selectedWorkerId) {
      attendance = attendance.filter(a => a.WorkerID === selectedWorkerId);
      workers = workers.filter(w => w.WorkerID === selectedWorkerId);
    }

    payrollRecords = computePayrollFromAttendance(attendance, workers, settings);

    renderDashboard(dashboard, payrollRecords, settings);
    renderList(list, payrollRecords, settings, attendance);
  } catch (error) {
    dashboard.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
  }
}

function renderDashboard(container, records, settings) {
  const total = records.reduce((s, r) => s + (parseFloat(r.TotalPay) || 0), 0);
  const otCost = records.reduce((s, r) => s + (parseFloat(r.OvertimePay) || 0), 0);
  const regCost = records.reduce((s, r) => s + (parseFloat(r.RegularPay) || 0), 0);
  const highest = records.reduce((max, r) => (!max || r.TotalPay > max.TotalPay) ? r : max, null);
  const rangeLabel = `${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}`;

  container.innerHTML = `
    <div class="section-title" style="margin-bottom:8px">${rangeLabel}${selectedWorkerId ? ' · ' + (records[0]?.WorkerName || 'Worker') : ''}</div>
    <div class="payroll-summary">
      <div class="card payroll-card highlight">
        <div class="amount">${formatCurrency(total, settings.currency)}</div>
        <div class="label">Total Earned</div>
      </div>
      <div class="card payroll-card">
        <div class="amount">${formatCurrency(regCost, settings.currency)}</div>
        <div class="label">Regular Pay</div>
      </div>
      <div class="card payroll-card">
        <div class="amount">${formatCurrency(otCost, settings.currency)}</div>
        <div class="label">Overtime Pay</div>
      </div>
      <div class="card payroll-card">
        <div class="amount" style="font-size:1rem">${highest ? highest.WorkerName : '-'}</div>
        <div class="label">Top Earner · ${highest ? formatCurrency(highest.TotalPay, settings.currency) : ''}</div>
      </div>
    </div>`;
}

function renderList(container, records, settings, attendance) {
  if (!records.length) {
    container.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">payments</span><h3>No payroll data</h3><p>Mark attendance for this date range first</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="section-title">Worker Earnings <button class="link" id="exportPayrollBtn">Export</button></div>
      ${records.map(r => `
        <div class="payroll-worker-row" data-id="${r.WorkerID}">
          <div class="payroll-worker-info">
            <h4>${r.WorkerName}</h4>
            <p>${r.TotalHours || 0}h · ${r.OvertimeHours || 0}h OT · ${formatCurrency(r.HourlyRate, settings.currency)}${getRateLabel(r.RateType)}</p>
          </div>
          <div class="payroll-amount">
            <strong>${formatCurrency(r.TotalPay, settings.currency)}</strong>
            <span>Reg ${formatCurrency(r.RegularPay, settings.currency)} + OT ${formatCurrency(r.OvertimePay, settings.currency)}</span>
          </div>
        </div>`).join('')}
    </div>`;

  container.querySelector('#exportPayrollBtn')?.addEventListener('click', () => {
    const { element, close } = showDialog({
      title: 'Export Payroll',
      content: '<p>Choose format:</p>',
      footer: `<button class="btn btn-secondary" id="exportExcel">Excel</button><button class="btn btn-primary" id="exportPdf">PDF</button>`
    });
    element.querySelector('#exportExcel')?.addEventListener('click', () => { exportPayroll(payrollRecords); close(); });
    element.querySelector('#exportPdf')?.addEventListener('click', () => { exportPayrollPDF(payrollRecords, fromDate + ' to ' + toDate); close(); });
  });

  container.querySelectorAll('.payroll-worker-row').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      const r = records.find(rec => rec.WorkerID === row.dataset.id);
      if (r) {
        const workerAttendance = attendance.filter(a => a.WorkerID === r.WorkerID);
        showPayrollDetail(r, settings, workerAttendance);
      }
    });
  });
}

function showPayrollDetail(record, settings, attendance) {
  const dayRows = (attendance || [])
    .filter(a => {
      const s = String(a.AttendanceStatus || '').toLowerCase();
      return s === 'present' || s === 'half day' || s === 'overtime';
    })
    .sort((a, b) => String(a.Date).localeCompare(String(b.Date)))
    .map(a => {
      const s = String(a.AttendanceStatus || '').toLowerCase();
      const hours = s === 'overtime'
        ? `${a.OvertimeHours || a.WorkedHours || 0}h OT`
        : `${a.WorkedHours || 0}h`;
      return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--md-sys-color-outline-variant)">
        <span>${formatDisplayDate(a.Date)} · ${a.AttendanceStatus}</span>
        <span>${a.TimeIn || '-'} – ${a.TimeOut || '-'} · ${hours}</span>
      </div>`;
    }).join('') || '<p style="color:var(--md-sys-color-on-surface-variant)">No attendance records</p>';

  showDialog({
    title: record.WorkerName,
    content: `
      <div style="display:grid;gap:12px">
        <div class="card" style="padding:12px"><strong>Period:</strong> ${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}</div>
        <div class="card" style="padding:12px"><strong>Rate:</strong> ${formatCurrency(record.HourlyRate, settings.currency)}${getRateLabel(record.RateType)}</div>
        <div class="card" style="padding:12px"><strong>Total Hours:</strong> ${record.TotalHours}h (${record.PresentDays || 0} present days)</div>
        <div class="card" style="padding:12px"><strong>Overtime Hours:</strong> ${record.OvertimeHours}h</div>
        <div class="card" style="padding:12px"><strong>Regular Pay:</strong> ${formatCurrency(record.RegularPay, settings.currency)}</div>
        <div class="card" style="padding:12px"><strong>Overtime Pay:</strong> ${formatCurrency(record.OvertimePay, settings.currency)}</div>
        <div class="card" style="padding:12px;background:var(--md-sys-color-primary-container)">
          <strong>Total Earned:</strong> ${formatCurrency(record.TotalPay, settings.currency)}
        </div>
        <div class="section-title">Day-by-day</div>
        <div class="card" style="padding:12px;max-height:200px;overflow-y:auto">${dayRows}</div>
      </div>`,
    footer: '<button class="btn btn-primary dialog-close-btn" style="flex:1">Close</button>'
  }).element.querySelector('.dialog-close-btn')?.addEventListener('click', function() {
    this.closest('.dialog-overlay').querySelector('.dialog-close')?.click();
  });
}

export function exportPayrollData() { exportPayroll(payrollRecords); }
