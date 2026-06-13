import { api } from '../services/api.js';
import { formatCurrency, getToday, getCurrentMonth, getMonthName, getWeekRange, normalizeDate } from '../utils/helpers.js';
import { computePayrollFromAttendance, getRateLabel } from '../utils/payroll.js';
import { showToast } from '../components/toast.js';
import { exportPayroll, exportPayrollPDF } from '../services/export.js';
import { Storage } from '../services/storage.js';
import { showDialog } from '../components/dialog.js';

let payrollRecords = [];
let currentMonth = getCurrentMonth();
let viewMode = 'monthly';

export async function renderPayroll(container) {
  container.innerHTML = `
    <div class="tabs" id="payrollTabs">
      <button class="tab active" data-view="monthly">Monthly</button>
      <button class="tab" data-view="weekly">Weekly</button>
      <button class="tab" data-view="daily">Daily</button>
    </div>
    <div class="card date-nav glass" id="monthNav">
      <button class="icon-btn" id="prevPayMonth"><span class="material-symbols-rounded">chevron_left</span></button>
      <h3 id="payrollMonthLabel">${getMonthName(currentMonth)}</h3>
      <button class="icon-btn" id="nextPayMonth"><span class="material-symbols-rounded">chevron_right</span></button>
    </div>
    <div id="payrollDashboard"></div>
    <div id="payrollList"></div>
    <button class="btn btn-primary" id="generatePayroll" style="width:100%;margin-bottom:12px">
      <span class="material-symbols-rounded">autorenew</span> Generate & Save Payroll
    </button>`;

  bindEvents(container);
  await loadPayroll(container);
}

function bindEvents(container) {
  container.querySelector('#generatePayroll').addEventListener('click', async () => {
    try {
      await api.generatePayroll(currentMonth);
      showToast('Payroll generated and saved', 'success');
      loadPayroll(container);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  container.querySelectorAll('#payrollTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      viewMode = tab.dataset.view;
      container.querySelectorAll('#payrollTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
      loadPayroll(container);
    });
  });

  container.querySelector('#prevPayMonth').addEventListener('click', () => {
    shiftMonth(-1);
    container.querySelector('#payrollMonthLabel').textContent = getMonthName(currentMonth);
    loadPayroll(container);
  });

  container.querySelector('#nextPayMonth').addEventListener('click', () => {
    shiftMonth(1);
    container.querySelector('#payrollMonthLabel').textContent = getMonthName(currentMonth);
    loadPayroll(container);
  });
}

function shiftMonth(delta) {
  const [y, m] = currentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function loadPayroll(container) {
  const dashboard = container.querySelector('#payrollDashboard');
  const list = container.querySelector('#payrollList');
  dashboard.innerHTML = '<div class="spinner" style="margin:24px auto"></div>';
  list.innerHTML = '';

  try {
    const settings = Storage.getSettings();
    const workersResult = await api.getWorkers({ status: 'Active' });
    const workers = workersResult.data || [];

    let attendance = [];
    if (viewMode === 'monthly') {
      const attResult = await api.getAttendance({ month: currentMonth, skipCache: true });
      attendance = (attResult.data || []).map(r => ({ ...r, Date: normalizeDate(r.Date) }));
    } else if (viewMode === 'weekly') {
      const week = getWeekRange();
      const attResult = await api.getAttendance({ startDate: week.start, endDate: week.end, skipCache: true });
      attendance = (attResult.data || []).map(r => ({ ...r, Date: normalizeDate(r.Date) }));
    } else {
      const today = getToday();
      const attResult = await api.getAttendance({ month: today.substring(0, 7), skipCache: true });
      attendance = (attResult.data || []).filter(r => normalizeDate(r.Date) === today);
    }

    payrollRecords = computePayrollFromAttendance(attendance, workers, settings);

    renderDashboard(dashboard, payrollRecords, settings);
    renderList(list, payrollRecords, settings);
  } catch (error) {
    dashboard.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
  }
}

function renderDashboard(container, records, settings) {
  const total = records.reduce((s, r) => s + (parseFloat(r.TotalPay) || 0), 0);
  const otCost = records.reduce((s, r) => s + (parseFloat(r.OvertimePay) || 0), 0);
  const regCost = records.reduce((s, r) => s + (parseFloat(r.RegularPay) || 0), 0);
  const highest = records.reduce((max, r) => (!max || r.TotalPay > max.TotalPay) ? r : max, null);

  container.innerHTML = `
    <div class="payroll-summary">
      <div class="card payroll-card highlight">
        <div class="amount">${formatCurrency(total, settings.currency)}</div>
        <div class="label">Total Money Generated</div>
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

function renderList(container, records, settings) {
  if (!records.length) {
    container.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">payments</span><h3>No payroll data</h3><p>Mark attendance first, then payroll calculates automatically</p></div>';
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
    element.querySelector('#exportPdf')?.addEventListener('click', () => { exportPayrollPDF(payrollRecords, currentMonth); close(); });
  });

  container.querySelectorAll('.payroll-worker-row').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      const r = records.find(rec => rec.WorkerID === row.dataset.id);
      if (r) showPayrollDetail(r, settings);
    });
  });
}

function showPayrollDetail(record, settings) {
  showDialog({
    title: record.WorkerName,
    content: `
      <div style="display:grid;gap:12px">
        <div class="card" style="padding:12px"><strong>Rate:</strong> ${formatCurrency(record.HourlyRate, settings.currency)}${getRateLabel(record.RateType)}</div>
        <div class="card" style="padding:12px"><strong>Total Hours:</strong> ${record.TotalHours}h (${record.PresentDays || 0} present days)</div>
        <div class="card" style="padding:12px"><strong>Overtime Hours:</strong> ${record.OvertimeHours}h</div>
        <div class="card" style="padding:12px"><strong>Regular Pay:</strong> ${formatCurrency(record.RegularPay, settings.currency)}</div>
        <div class="card" style="padding:12px"><strong>Overtime Pay:</strong> ${formatCurrency(record.OvertimePay, settings.currency)}</div>
        <div class="card" style="padding:12px;background:var(--md-sys-color-primary-container)">
          <strong>Total Earned:</strong> ${formatCurrency(record.TotalPay, settings.currency)}
        </div>
      </div>`,
    footer: '<button class="btn btn-primary dialog-close-btn" style="flex:1">Close</button>'
  }).element.querySelector('.dialog-close-btn')?.addEventListener('click', function() {
    this.closest('.dialog-overlay').querySelector('.dialog-close')?.click();
  });
}

export function exportPayrollData() { exportPayroll(payrollRecords); }
