import { api } from '../services/api.js';
import { formatCurrency, formatDisplayDate, getToday, getCurrentMonth, getMonthName, normalizeDate, normalizeWorkerId, getInitials } from '../utils/helpers.js';
import { computePayrollFromAttendance, getRateLabel } from '../utils/payroll.js';
import { showToast } from '../components/toast.js';
import { exportPayroll, exportPayrollPDF } from '../services/export.js';
import { Storage } from '../services/storage.js';
import { showDialog } from '../components/dialog.js';
import { renderProcessingBlock, showProcessing, hideProcessing } from '../components/loader.js';

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
      showProcessing('Saving payroll...');
      await api.generatePayroll(getCurrentMonth());
      showToast('Payroll saved for ' + getMonthName(getCurrentMonth()), 'success');
      await loadPayroll(container);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideProcessing();
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
  dashboard.innerHTML = renderProcessingBlock('Calculating payroll...');
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
      const workerId = normalizeWorkerId(selectedWorkerId);
      const worker = workers.find(w => normalizeWorkerId(w.WorkerID) === workerId);
      const workerName = worker ? String(worker.WorkerName).trim().toLowerCase() : '';
      attendance = attendance.filter(a => {
        if (normalizeWorkerId(a.WorkerID) === workerId) return true;
        return workerName && String(a.WorkerName).trim().toLowerCase() === workerName;
      });
      workers = workers.filter(w => normalizeWorkerId(w.WorkerID) === workerId);
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
  const regHours = records.reduce((s, r) => s + (parseFloat(r.RegularHours) || 0), 0);
  const otHours = records.reduce((s, r) => s + (parseFloat(r.OvertimeHours) || 0), 0);
  const highest = records.reduce((max, r) => (!max || r.TotalPay > max.TotalPay) ? r : max, null);
  const rangeLabel = `${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}`;
  container.innerHTML = `
    <div class="section-title" style="margin-bottom:8px">${rangeLabel}${selectedWorkerId ? ' · ' + (records[0]?.WorkerName || 'Worker') : ''}</div>
    <div class="payroll-summary">
      <div class="card payroll-card highlight">
        <div class="amount">${formatCurrency(total, settings.currency)}</div>
        <div class="label">Combined Total</div>
      </div>
      <div class="card payroll-card">
        <div class="amount">${formatCurrency(regCost, settings.currency)}</div>
        <div class="label">Normal Pay · ${regHours.toFixed(1)}h</div>
      </div>
      <div class="card payroll-card">
        <div class="amount money-overtime">${formatCurrency(otCost, settings.currency)}</div>
        <div class="label">Overtime Pay · ${otHours.toFixed(1)}h</div>
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
    <div class="card payroll-earnings">
      <div class="payroll-earnings-toolbar">
        <div>
          <h3 class="payroll-earnings-title">Worker Earnings</h3>
          <p class="payroll-earnings-subtitle">${records.length} worker${records.length !== 1 ? 's' : ''} · tap a row for details</p>
        </div>
        <button class="btn btn-outline btn-sm" id="exportPayrollBtn">
          <span class="material-symbols-rounded">download</span> Export
        </button>
      </div>
      <div class="payroll-earnings-table">
        <div class="payroll-earnings-thead">
          <span class="col-worker">Worker</span>
          <span class="col-normal">Normal</span>
          <span class="col-overtime">Overtime</span>
          <span class="col-total">Total</span>
        </div>
        ${records.map(r => `
          <div class="payroll-earnings-row" data-id="${r.WorkerID}">
            <div class="col-worker">
              <div class="payroll-worker-cell">
                <div class="worker-avatar small">${getInitials(r.WorkerName)}</div>
                <div class="payroll-worker-meta">
                  <strong>${r.WorkerName}</strong>
                  <span>${formatCurrency(r.HourlyRate, settings.currency)}${getRateLabel(r.RateType)}</span>
                </div>
              </div>
            </div>
            <div class="col-normal">
              <span class="cell-hours">${r.RegularHours || 0}h</span>
              <span class="cell-pay">${formatCurrency(r.RegularPay, settings.currency)}</span>
              <span class="cell-meta">${r.PresentDays || 0} days</span>
            </div>
            <div class="col-overtime">
              <span class="cell-hours">${r.OvertimeHours || 0}h</span>
              <span class="cell-pay">${formatCurrency(r.OvertimePay, settings.currency)}</span>
              <span class="cell-meta">${r.OvertimeDays || 0} OT days</span>
            </div>
            <div class="col-total">
              <span class="cell-hours">${r.TotalHours || 0}h</span>
              <span class="cell-pay total">${formatCurrency(r.TotalPay, settings.currency)}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  container.querySelector('#exportPayrollBtn')?.addEventListener('click', () => {
    const { element, close } = showDialog({
      title: 'Export Payroll',
      content: '<p>Choose export format:</p>',
      footer: `<button class="btn btn-secondary" id="exportExcel">Excel</button><button class="btn btn-primary" id="exportPdf">PDF</button>`
    });
    element.querySelector('#exportExcel')?.addEventListener('click', () => { exportPayroll(payrollRecords); close(); });
    element.querySelector('#exportPdf')?.addEventListener('click', () => { exportPayrollPDF(payrollRecords, fromDate + ' to ' + toDate); close(); });
  });

  container.querySelectorAll('.payroll-earnings-row').forEach(row => {
    row.addEventListener('click', () => {
      const r = records.find(rec => normalizeWorkerId(rec.WorkerID) === normalizeWorkerId(row.dataset.id));
      if (r) {
        const workerName = String(r.WorkerName).trim().toLowerCase();
        const workerAttendance = attendance.filter(a => {
          if (normalizeWorkerId(a.WorkerID) === normalizeWorkerId(r.WorkerID)) return true;
          return workerName && String(a.WorkerName).trim().toLowerCase() === workerName;
        });
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
      let hours;
      if (s === 'overtime') {
        hours = `${a.OvertimeHours || a.WorkedHours || 0}h OT`;
      } else {
        const ot = parseFloat(a.OvertimeHours) || 0;
        const reg = parseFloat(a.RegularHours) || 0;
        hours = ot > 0
          ? `${reg}h regular · ${ot}h OT · ${a.WorkedHours || 0}h total`
          : `${a.WorkedHours || 0}h`;
      }
      return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--md-sys-color-outline-variant)">
        <span>${formatDisplayDate(a.Date)} · ${a.AttendanceStatus}</span>
        <span>${a.TimeIn || '-'} – ${a.TimeOut || '-'} · ${hours}</span>
      </div>`;
    }).join('') || '<p style="color:var(--md-sys-color-on-surface-variant)">No attendance records</p>';

  showDialog({
    title: record.WorkerName,
    content: `
      <div class="payroll-detail-grid">
        <div class="card" style="padding:12px"><strong>Period:</strong> ${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}</div>
        <div class="card" style="padding:12px"><strong>Rate:</strong> ${formatCurrency(record.HourlyRate, settings.currency)}${getRateLabel(record.RateType)}</div>
        <div class="payroll-detail-section normal">
          <strong>Normal Working</strong>
          <p>${record.RegularHours || 0}h · ${record.PresentDays || 0} days</p>
          <p class="money-normal" style="font-size:1.125rem;margin-top:4px">${formatCurrency(record.RegularPay, settings.currency)}</p>
        </div>
        <div class="payroll-detail-section overtime">
          <strong>Overtime</strong>
          <p>${record.OvertimeHours || 0}h · ${record.OvertimeDays || 0} OT days</p>
          <p class="money-overtime" style="font-size:1.125rem;margin-top:4px">${formatCurrency(record.OvertimePay, settings.currency)}</p>
        </div>
        <div class="payroll-detail-section total">
          <strong>Combined Total</strong>
          <p>${record.TotalHours || 0}h total worked</p>
          <p class="money-total" style="font-size:1.25rem;margin-top:4px">${formatCurrency(record.TotalPay, settings.currency)}</p>
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
