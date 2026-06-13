import { api } from '../services/api.js';
import { formatDisplayDate, getToday, getCurrentMonth, getMonthName, addDays, statusBadgeClass, getInitials, normalizeDate, normalizeTime } from '../utils/helpers.js';
import { validateAttendance } from '../utils/validators.js';
import { calculateHours } from '../utils/hours.js';
import { showDialog, getFormData, showFormErrors } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { renderCalendar, buildAttendanceMap } from '../components/calendar.js';
import { renderTimePicker, initTimePickers } from '../components/time-picker.js';
import { exportAttendance, exportAttendancePDF } from '../services/export.js';
import { Storage } from '../services/storage.js';
import { renderInlineLoader, showProcessing, hideProcessing } from '../components/loader.js';

let records = [];
let workers = [];
let currentDate = getToday();
let currentMonth = getCurrentMonth();
let viewMode = 'daily';
let monthCacheKey = null;
let monthCacheData = null;

function clearMonthCache() {
  monthCacheKey = null;
  monthCacheData = null;
}

async function loadMonthAttendance(month) {
  if (monthCacheKey === month && monthCacheData) return monthCacheData;
  const result = await api.getAttendance({ month });
  monthCacheKey = month;
  monthCacheData = (result.data || []).map(normalizeRecord);
  return monthCacheData;
}

function normalizeRecord(record) {
  if (!record) return record;
  return {
    ...record,
    Date: normalizeDate(record.Date),
    TimeIn: normalizeTime(record.TimeIn),
    TimeOut: normalizeTime(record.TimeOut)
  };
}

async function loadAttendanceForDate(date) {
  const month = date.substring(0, 7);
  const monthData = await loadMonthAttendance(month);
  return monthData.filter(r => normalizeDate(r.Date) === date);
}

function splitDayRecords(dayRecords) {
  const dailyMap = {};
  const otByWorker = {};
  const otList = [];

  dayRecords.forEach(r => {
    const status = String(r.AttendanceStatus || '').toLowerCase();
    if (status === 'overtime') {
      otList.push(r);
      if (!otByWorker[r.WorkerID]) otByWorker[r.WorkerID] = { hours: 0, records: [] };
      otByWorker[r.WorkerID].hours += parseFloat(r.OvertimeHours) || parseFloat(r.WorkedHours) || 0;
      otByWorker[r.WorkerID].records.push(r);
    } else {
      dailyMap[r.WorkerID] = r;
    }
  });

  return { dailyMap, otByWorker, otList };
}

function getWorkerDaySummary(workerId, dayRecords) {
  const { dailyMap, otByWorker } = splitDayRecords(dayRecords);
  const present = dailyMap[workerId];
  const otData = otByWorker[workerId];
  const explicitOt = otData ? otData.hours : 0;
  const regularHours = present ? (parseFloat(present.RegularHours) || parseFloat(present.WorkedHours) || 0) : 0;
  const embeddedOt = present ? (parseFloat(present.OvertimeHours) || 0) : 0;
  const totalOt = Math.round((embeddedOt + explicitOt) * 100) / 100;
  const totalHours = Math.round((regularHours + totalOt) * 100) / 100;
  return {
    present,
    explicitOtRecords: otData?.records || [],
    regularHours,
    embeddedOt,
    explicitOt,
    totalOt,
    totalHours,
    hasOvertime: totalOt > 0
  };
}

function formatDayDetail(summary, record, status) {
  if (!record) return 'Tap to mark';
  const parts = [];
  if (record.TimeIn && record.TimeOut) {
    parts.push(`${record.TimeIn} → ${record.TimeOut}`);
  }
  if (summary.hasOvertime || summary.regularHours > 0) {
    const hourParts = [];
    if (summary.regularHours > 0) hourParts.push(`${summary.regularHours}h regular`);
    if (summary.totalOt > 0) hourParts.push(`${summary.totalOt}h OT`);
    hourParts.push(`${summary.totalHours}h total`);
    parts.push(hourParts.join(' · '));
  } else if (status.toLowerCase() !== 'absent') {
    parts.push(`${record.WorkedHours || 0}h`);
  } else {
    parts.push(status);
  }
  return parts.join(' · ') || status;
}

export async function renderAttendance(container) {
  container.innerHTML = `
    <div class="tabs" id="viewTabs">
      <button class="tab active" data-view="daily">Daily</button>
      <button class="tab" data-view="overtime">Overtime</button>
      <button class="tab" data-view="monthly">Monthly</button>
      <button class="tab" data-view="timeline">Timeline</button>
    </div>
    <div id="attendanceContent"></div>
  `;

  container.querySelectorAll('#viewTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      viewMode = tab.dataset.view;
      container.querySelectorAll('#viewTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
      renderView(container);
    });
  });

  await loadWorkers();
  await renderView(container);
}

async function loadWorkers() {
  try {
    const result = await api.getWorkers({ status: 'Active' });
    workers = result.data || [];
  } catch {
    workers = [];
  }
}

async function renderView(container) {
  const content = container.querySelector('#attendanceContent');
  content.innerHTML = renderInlineLoader('Loading attendance...');

  try {
    if (viewMode === 'daily') await renderDailyView(content);
    else if (viewMode === 'overtime') await renderOvertimeView(content);
    else if (viewMode === 'monthly') await renderMonthlyView(content);
    else await renderTimelineView(content);
  } catch (error) {
    content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
  }
}

function renderDateNav(content, onChange) {
  content.innerHTML = `
    <div class="card date-nav glass">
      <button class="icon-btn" id="prevDay"><span class="material-symbols-rounded">chevron_left</span></button>
      <div class="date-nav-center">
        <h3>${formatDisplayDate(currentDate)}</h3>
        <input type="date" id="attendanceDatePicker" class="form-control" value="${currentDate}">
      </div>
      <button class="icon-btn" id="nextDay"><span class="material-symbols-rounded">chevron_right</span></button>
    </div>
    <div id="attendanceList"></div>
  `;

  content.querySelector('#prevDay').addEventListener('click', () => {
    currentDate = addDays(currentDate, -1);
    onChange();
  });
  content.querySelector('#nextDay').addEventListener('click', () => {
    currentDate = addDays(currentDate, 1);
    onChange();
  });
  content.querySelector('#attendanceDatePicker').addEventListener('change', (e) => {
    currentDate = e.target.value;
    onChange();
  });

  return content.querySelector('#attendanceList');
}

async function renderDailyView(content) {
  const dayRecords = await loadAttendanceForDate(currentDate);
  records = dayRecords;
  const { dailyMap } = splitDayRecords(dayRecords);

  const markedCount = Object.keys(dailyMap).length;
  const pendingCount = Math.max(workers.length - markedCount, 0);

  const list = renderDateNav(content, () => renderView(document.getElementById('pageContainer')));
  content.insertAdjacentHTML('afterbegin', `<div class="section-title">${workers.length} workers · ${markedCount} marked · ${pendingCount} pending</div>`);

  if (!workers.length) {
    list.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">groups</span><h3>No active workers</h3></div>';
    return;
  }

  list.innerHTML = workers.map(worker => {
    const record = dailyMap[worker.WorkerID];
    const summary = getWorkerDaySummary(worker.WorkerID, dayRecords);
    const isMarked = !!record;
    const status = (record && record.AttendanceStatus) || 'Not Marked';
    const badgeClass = isMarked ? statusBadgeClass(status) : 'badge-inactive';
    const detail = formatDayDetail(summary, record, status);
    const otBadge = summary.hasOvertime
      ? `<span class="attendance-ot-badge">${summary.totalOt}h OT</span>`
      : '';

    return `
      <div class="card attendance-worker-row ${isMarked ? 'attendance-marked' : 'attendance-pending'}" data-worker-id="${worker.WorkerID}">
        <div class="worker-avatar small ${isMarked ? 'marked' : ''}">${getInitials(worker.WorkerName)}</div>
        <div class="attendance-worker-info">
          <strong>${worker.WorkerName}</strong>
          <p>${detail}${otBadge}</p>
        </div>
        <div class="attendance-worker-actions">
          ${isMarked ? '<span class="material-symbols-rounded attendance-check">check_circle</span>' : ''}
          <span class="badge ${badgeClass}">${status}</span>
          <button class="btn btn-sm ${isMarked ? 'btn-secondary' : 'btn-primary'}" data-mark="${worker.WorkerID}">${isMarked ? 'Edit' : 'Mark'}</button>
        </div>
      </div>`;
  }).join('');

  bindDailyEvents(list, dailyMap);
}

function bindDailyEvents(list, dailyMap) {
  list.querySelectorAll('[data-mark]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const worker = workers.find(w => w.WorkerID === btn.dataset.mark);
      if (worker) showAttendanceForm(dailyMap[worker.WorkerID] || null, worker);
    });
  });
  list.querySelectorAll('.attendance-worker-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-mark]')) return;
      const worker = workers.find(w => w.WorkerID === row.dataset.workerId);
      if (worker) showAttendanceForm(dailyMap[worker.WorkerID] || null, worker);
    });
  });
}

async function renderOvertimeView(content) {
  const dayRecords = await loadAttendanceForDate(currentDate);
  const { otByWorker, otList } = splitDayRecords(dayRecords);

  const list = renderDateNav(content, () => renderView(document.getElementById('pageContainer')));
  const totalOtHours = otList.reduce((s, r) => s + (parseFloat(r.OvertimeHours) || parseFloat(r.WorkedHours) || 0), 0);
  content.insertAdjacentHTML('afterbegin', `<div class="section-title">${otList.length} OT entries · ${totalOtHours.toFixed(1)}h total overtime</div>`);

  if (!workers.length) {
    list.innerHTML = '<div class="empty-state"><h3>No active workers</h3></div>';
    return;
  }

  list.innerHTML = workers.map(worker => {
    const ot = otByWorker[worker.WorkerID];
    const otHours = ot ? ot.hours.toFixed(1) : '0';
    const entries = ot ? ot.records.length : 0;

    return `
      <div class="card attendance-worker-row ${entries ? 'attendance-marked' : ''}" style="border-left-color:var(--color-overtime)">
        <div class="worker-avatar small" style="background:rgba(124,77,255,0.2);color:var(--color-overtime)">${getInitials(worker.WorkerName)}</div>
        <div class="attendance-worker-info">
          <strong>${worker.WorkerName}</strong>
          <p>${entries ? `${entries} OT entry · ${otHours}h cumulative` : 'No overtime logged'}</p>
        </div>
        <div class="attendance-worker-actions">
          <span class="badge badge-overtime">${otHours}h OT</span>
          <button class="btn btn-sm btn-primary" data-add-ot="${worker.WorkerID}">Add OT</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-add-ot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const worker = workers.find(w => w.WorkerID === btn.dataset.addOt);
      if (worker) showOvertimeForm(null, worker);
    });
  });

  if (otList.length) {
    list.insertAdjacentHTML('beforeend', `
      <div class="section-title" style="margin-top:16px">Today's OT entries</div>
      ${otList.map(r => `
        <div class="card" style="padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${r.WorkerName}</strong>
            <p style="font-size:0.8125rem;color:var(--md-sys-color-on-surface-variant)">${r.TimeIn} → ${r.TimeOut} · ${r.OvertimeHours || r.WorkedHours}h</p>
          </div>
          <button class="btn btn-sm btn-secondary" data-edit-ot="${r.AttendanceID}">Edit</button>
        </div>`).join('')}
    `);

    list.querySelectorAll('[data-edit-ot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const record = otList.find(r => r.AttendanceID === btn.dataset.editOt);
        const worker = workers.find(w => w.WorkerID === record.WorkerID);
        if (record && worker) showOvertimeForm(record, worker);
      });
    });
  }
}

async function renderMonthlyView(content) {
  const [year, month] = currentMonth.split('-').map(Number);
  records = await loadMonthAttendance(currentMonth);
  const attMap = buildAttendanceMap(records);

  content.innerHTML = `
    <div class="card calendar glass">
      <div class="calendar-header">
        <button class="icon-btn" id="prevMonth"><span class="material-symbols-rounded">chevron_left</span></button>
        <h3>${getMonthName(currentMonth)}</h3>
        <button class="icon-btn" id="nextMonth"><span class="material-symbols-rounded">chevron_right</span></button>
      </div>
      <div id="calendarGrid"></div>
    </div>
    <div class="section-title">${records.length} records this month</div>`;

  renderCalendar(content.querySelector('#calendarGrid'), year, month, attMap, (date) => {
    currentDate = date;
    viewMode = 'daily';
    document.getElementById('pageContainer').querySelectorAll('#viewTabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === 'daily');
    });
    renderView(document.getElementById('pageContainer'));
  });

  content.querySelector('#prevMonth').addEventListener('click', () => {
    const d = new Date(year, month - 2, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthCacheKey = null;
    renderView(document.getElementById('pageContainer'));
  });
  content.querySelector('#nextMonth').addEventListener('click', () => {
    const d = new Date(year, month, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthCacheKey = null;
    renderView(document.getElementById('pageContainer'));
  });
}

async function renderTimelineView(content) {
  const workerId = workers[0] && workers[0].WorkerID;
  content.innerHTML = `
    <div class="form-group">
      <label>Select Worker</label>
      <select class="form-control" id="timelineWorker">${workers.map(w => `<option value="${w.WorkerID}">${w.WorkerName}</option>`).join('')}</select>
    </div>
    <div id="timelineList"></div>`;

  const select = content.querySelector('#timelineWorker');
  if (workerId) select.value = workerId;

  const loadTimeline = async () => {
    const items = await loadMonthAttendance(currentMonth);
    const filtered = items.filter(r => r.WorkerID === select.value);
    const list = content.querySelector('#timelineList');
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state"><p>No history</p></div>';
      return;
    }
    list.innerHTML = filtered.map(r => {
      const status = (r.AttendanceStatus || '').toLowerCase();
      const color = status === 'overtime' ? 'var(--color-overtime)' :
        status === 'present' ? 'var(--color-present)' : 'var(--color-absent)';
      const otHours = parseFloat(r.OvertimeHours) || 0;
      const regularHours = parseFloat(r.RegularHours) || 0;
      let hoursDetail = `${r.WorkedHours}h total`;
      if (status === 'present' && otHours > 0) {
        hoursDetail = `${regularHours}h regular · ${otHours}h OT · ${r.WorkedHours}h total`;
      } else if (status === 'overtime') {
        hoursDetail = `${otHours || r.WorkedHours}h OT`;
      }
      return `
        <div class="timeline-item">
          <div class="timeline-marker" style="background:${color}22;color:${color}"><span class="material-symbols-rounded" style="font-size:16px">schedule</span></div>
          <div class="timeline-content">
            <h4>${formatDisplayDate(r.Date)} — ${r.AttendanceStatus}</h4>
            <p>${r.TimeIn || '-'} to ${r.TimeOut || '-'} · ${hoursDetail}</p>
          </div>
        </div>`;
    }).join('');
  };

  select.addEventListener('change', loadTimeline);
  await loadTimeline();
}

function showAttendanceForm(record = null, worker = null) {
  const isEdit = !!record;
  const settings = Storage.getSettings();
  const workerId = (worker && worker.WorkerID) || (record && record.WorkerID) || '';
  const workerName = (worker && worker.WorkerName) || (record && record.WorkerName) || '';
  const defaultStatus = (record && record.AttendanceStatus) || 'Present';

  const { close, element } = showDialog({
    title: isEdit ? `Edit — ${workerName}` : `Mark — ${workerName}`,
    content: `
      <form id="attendanceForm">
        <input type="hidden" name="WorkerID" value="${workerId}">
        <input type="hidden" name="Date" value="${(record && record.Date) || currentDate}">
        <div class="form-group"><label>Date</label><input type="date" class="form-control" value="${(record && record.Date) || currentDate}" disabled></div>
        <div class="form-group">
          <label>Status *</label>
          <select name="AttendanceStatus" class="form-control" id="attStatus">
            <option value="Present" ${defaultStatus === 'Present' ? 'selected' : ''}>Present</option>
            <option value="Absent" ${defaultStatus === 'Absent' ? 'selected' : ''}>Absent</option>
          </select>
        </div>
        <div id="timeFields">
          <div class="section-title" style="margin:12px 0 8px">Working Hours</div>
          <div class="form-row">
            ${renderTimePicker('TimeIn', (record && record.TimeIn) || '08:00', 'Time In')}
            ${renderTimePicker('TimeOut', (record && record.TimeOut) || '17:00', 'Time Out')}
          </div>
          <div class="form-group"><label>Time Cut (minutes)</label><input type="number" name="TimeCut" class="form-control" min="0" value="${(record && record.TimeCut != null) ? record.TimeCut : 60}"></div>
          <div id="hoursPreview" class="card" style="padding:12px;font-size:0.875rem"></div>
        </div>
      </form>`,
    footer: `
      ${isEdit ? '<button class="btn btn-danger" id="deleteAttendance">Delete</button>' : ''}
      <button class="btn btn-secondary dialog-cancel">Cancel</button>
      <button class="btn btn-primary" id="saveAttendance">${isEdit ? 'Update' : 'Mark'}</button>`
  });

  setupTimeForm(element, settings, () => {
    const status = element.querySelector('#attStatus').value.toLowerCase();
    element.querySelector('#timeFields').style.display = status === 'present' ? 'block' : 'none';
  });

  element.querySelector('.dialog-cancel').addEventListener('click', close);
  bindDelete(element, record, close);
  bindSave(element, record, isEdit, close, (data) => {
    if (data.AttendanceStatus.toLowerCase() === 'absent') {
      data.TimeIn = '';
      data.TimeOut = '';
      data.TimeCut = 0;
    }
    return validateAttendance(data);
  });
}

function showOvertimeForm(record = null, worker = null) {
  const isEdit = !!record;
  const settings = Storage.getSettings();
  const workerId = (worker && worker.WorkerID) || (record && record.WorkerID) || '';
  const workerName = (worker && worker.WorkerName) || (record && record.WorkerName) || '';

  const { close, element } = showDialog({
    title: isEdit ? `Edit OT — ${workerName}` : `Add Overtime — ${workerName}`,
    content: `
      <form id="attendanceForm">
        <input type="hidden" name="WorkerID" value="${workerId}">
        <input type="hidden" name="Date" value="${(record && record.Date) || currentDate}">
        <input type="hidden" name="AttendanceStatus" value="Overtime">
        <div class="form-group"><label>Date</label><input type="date" class="form-control" value="${(record && record.Date) || currentDate}" disabled></div>
        <div class="section-title" style="margin:12px 0 8px">Overtime Hours</div>
        <div class="form-row">
          ${renderTimePicker('TimeIn', (record && record.TimeIn) || '18:00', 'Time In')}
          ${renderTimePicker('TimeOut', (record && record.TimeOut) || '21:00', 'Time Out')}
        </div>
        <div class="form-group"><label>Time Cut (minutes)</label><input type="number" name="TimeCut" class="form-control" min="0" value="${(record && record.TimeCut != null) ? record.TimeCut : 0}"></div>
        <div id="hoursPreview" class="card" style="padding:12px;font-size:0.875rem"></div>
      </form>`,
    footer: `
      ${isEdit ? '<button class="btn btn-danger" id="deleteAttendance">Delete</button>' : ''}
      <button class="btn btn-secondary dialog-cancel">Cancel</button>
      <button class="btn btn-primary" id="saveAttendance">${isEdit ? 'Update' : 'Save OT'}</button>`
  });

  setupTimeForm(element, settings, null, 'overtime');
  element.querySelector('.dialog-cancel').addEventListener('click', close);
  bindDelete(element, record, close);
  bindSave(element, record, isEdit, close, (data) => {
    data.AttendanceStatus = 'Overtime';
    return validateAttendance(data);
  });
}

function setupTimeForm(element, settings, onStatusChange, forceStatus) {
  const form = element.querySelector('#attendanceForm');
  initTimePickers(form);

  const updatePreview = () => {
    if (onStatusChange) onStatusChange();
    const data = getFormData(form);
    if (forceStatus) data.AttendanceStatus = forceStatus;
    const status = (data.AttendanceStatus || '').toLowerCase();
    const preview = element.querySelector('#hoursPreview');
    if (status === 'absent') return;
    const hours = calculateHours(data, parseFloat(settings.regularHours) || 8);
    preview.innerHTML = forceStatus === 'overtime'
      ? `<strong>Overtime:</strong> ${hours.overtimeHours}h added to cumulative OT`
      : `<strong>Calculated:</strong> ${hours.workedHours}h worked · ${hours.regularHours}h regular · ${hours.overtimeHours}h overtime`;
  };

  const statusSelect = element.querySelector('#attStatus');
  if (statusSelect) statusSelect.addEventListener('change', updatePreview);
  form.addEventListener('change', updatePreview);
  form.addEventListener('input', updatePreview);
  updatePreview();
}

function bindDelete(element, record, close) {
  const deleteBtn = element.querySelector('#deleteAttendance');
  if (!deleteBtn || !record) return;
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this record?')) return;
    try {
      await api.deleteAttendance(record.AttendanceID);
      clearMonthCache();
      showToast('Deleted', 'success');
      close();
      renderView(document.getElementById('pageContainer'));
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

function bindSave(element, record, isEdit, close, validateFn) {
  element.querySelector('#saveAttendance').addEventListener('click', async () => {
    const form = element.querySelector('#attendanceForm');
    const data = getFormData(form);
    data.Date = normalizeDate(data.Date || currentDate);
    const validation = validateFn(data);
    if (!validation.valid) {
      showFormErrors(form, validation.errors);
      return;
    }
    const saveBtn = element.querySelector('#saveAttendance');
    saveBtn.disabled = true;
    showProcessing(isEdit ? 'Updating attendance...' : 'Saving attendance...');
    try {
      if (isEdit) {
        await api.updateAttendance({ ...data, AttendanceID: record.AttendanceID });
        showToast('Updated', 'success');
      } else {
        await api.markAttendance(data);
        showToast('Saved', 'success');
      }
      clearMonthCache();
      close();
      renderView(document.getElementById('pageContainer'));
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      hideProcessing();
      saveBtn.disabled = false;
    }
  });
}

export function exportAttendanceData() { exportAttendance(records); }
export function exportAttendancePDFData(dateRange) { exportAttendancePDF(records, dateRange); }
