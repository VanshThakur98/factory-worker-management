import { api } from '../services/api.js';
import { formatDisplayDate, getToday, getCurrentMonth, getMonthName, addDays, statusBadgeClass, getInitials } from '../utils/helpers.js';
import { validateAttendance } from '../utils/validators.js';
import { calculateHours } from '../utils/hours.js';
import { showDialog, getFormData, showFormErrors } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { renderCalendar, buildAttendanceMap } from '../components/calendar.js';
import { exportAttendance, exportAttendancePDF } from '../services/export.js';
import { Storage } from '../services/storage.js';

let records = [];
let workers = [];
let currentDate = getToday();
let currentMonth = getCurrentMonth();
let viewMode = 'daily';

export async function renderAttendance(container) {
  container.innerHTML = `
    <div class="tabs" id="viewTabs">
      <button class="tab active" data-view="daily">Daily</button>
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
  content.innerHTML = '<div class="spinner" style="margin:24px auto"></div>';

  try {
    if (viewMode === 'daily') {
      await renderDailyView(content);
    } else if (viewMode === 'monthly') {
      await renderMonthlyView(content);
    } else {
      await renderTimelineView(content);
    }
  } catch (error) {
    content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
  }
}

async function renderDailyView(content) {
  const [attResult, workersResult] = await Promise.all([
    api.getAttendance({ Date: currentDate }),
    api.getWorkers({ status: 'Active' })
  ]);
  records = attResult.data || [];
  workers = workersResult.data || [];

  const recordMap = {};
  records.forEach(r => { recordMap[r.WorkerID] = r; });

  const markedCount = records.length;
  const pendingCount = Math.max(workers.length - markedCount, 0);

  content.innerHTML = `
    <div class="card date-nav glass">
      <button class="icon-btn" id="prevDay"><span class="material-symbols-rounded">chevron_left</span></button>
      <div class="date-nav-center">
        <h3>${formatDisplayDate(currentDate)}</h3>
        <input type="date" id="attendanceDatePicker" class="form-control" value="${currentDate}">
      </div>
      <button class="icon-btn" id="nextDay"><span class="material-symbols-rounded">chevron_right</span></button>
    </div>
    <div class="section-title">${workers.length} workers · ${markedCount} marked · ${pendingCount} pending</div>
    <div id="dailyList"></div>
  `;

  content.querySelector('#prevDay').addEventListener('click', () => {
    currentDate = addDays(currentDate, -1);
    renderView(document.getElementById('pageContainer'));
  });
  content.querySelector('#nextDay').addEventListener('click', () => {
    currentDate = addDays(currentDate, 1);
    renderView(document.getElementById('pageContainer'));
  });
  content.querySelector('#attendanceDatePicker').addEventListener('change', (e) => {
    currentDate = e.target.value;
    renderView(document.getElementById('pageContainer'));
  });

  renderDailyList(content.querySelector('#dailyList'), recordMap);
}

function renderDailyList(list, recordMap) {
  if (!workers.length) {
    list.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">groups</span><h3>No active workers</h3><p>Add workers first</p></div>';
    return;
  }

  list.innerHTML = workers.map(worker => {
    const record = recordMap[worker.WorkerID];
    const isMarked = !!record;
    const status = (record && record.AttendanceStatus) || 'Not Marked';
    const badgeClass = isMarked ? statusBadgeClass(status) : 'badge-inactive';
    const detail = isMarked
      ? (record.TimeIn && record.TimeOut
        ? `${record.TimeIn} → ${record.TimeOut} · ${record.WorkedHours || 0}h`
        : status)
      : 'Tap to mark attendance';

    return `
      <div class="card attendance-worker-row ${isMarked ? 'attendance-marked' : 'attendance-pending'}" data-worker-id="${worker.WorkerID}">
        <div class="worker-avatar small ${isMarked ? 'marked' : ''}">${getInitials(worker.WorkerName)}</div>
        <div class="attendance-worker-info">
          <strong>${worker.WorkerName}</strong>
          <p>${detail}</p>
        </div>
        <div class="attendance-worker-actions">
          ${isMarked ? '<span class="material-symbols-rounded attendance-check" title="Marked">check_circle</span>' : ''}
          <span class="badge ${badgeClass}">${status}</span>
          <button class="btn btn-sm ${isMarked ? 'btn-secondary' : 'btn-primary'}" data-mark="${worker.WorkerID}">
            ${isMarked ? 'Edit' : 'Mark'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.attendance-worker-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-mark]')) return;
      const worker = workers.find(w => w.WorkerID === row.dataset.workerId);
      const record = recordMap[worker.WorkerID];
      if (worker) showAttendanceForm(record || null, worker);
    });
  });

  list.querySelectorAll('[data-mark]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const worker = workers.find(w => w.WorkerID === btn.dataset.mark);
      const record = recordMap[worker.WorkerID];
      if (worker) showAttendanceForm(record || null, worker);
    });
  });
}

async function renderMonthlyView(content) {
  const [year, month] = currentMonth.split('-').map(Number);
  const result = await api.getAttendance({ month: currentMonth });
  records = result.data || [];
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
    <div id="monthRecords"></div>
  `;

  renderCalendar(content.querySelector('#calendarGrid'), year, month, attMap, (date) => {
    currentDate = date;
    viewMode = 'daily';
    const container = document.getElementById('pageContainer');
    container.querySelectorAll('#viewTabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === 'daily');
    });
    renderView(container);
  });

  content.querySelector('#prevMonth').addEventListener('click', () => {
    const d = new Date(year, month - 2, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderView(document.getElementById('pageContainer'));
  });

  content.querySelector('#nextMonth').addEventListener('click', () => {
    const d = new Date(year, month, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderView(document.getElementById('pageContainer'));
  });

  const monthRecords = content.querySelector('#monthRecords');
  monthRecords.innerHTML = `<div class="section-title">${records.length} records this month</div>`;
}

async function renderTimelineView(content) {
  const workerId = workers[0] && workers[0].WorkerID;
  content.innerHTML = `
    <div class="form-group">
      <label>Select Worker</label>
      <select class="form-control" id="timelineWorker">
        ${workers.map(w => `<option value="${w.WorkerID}">${w.WorkerName}</option>`).join('')}
      </select>
    </div>
    <div id="timelineList"></div>
  `;

  const select = content.querySelector('#timelineWorker');
  if (workerId) select.value = workerId;

  const loadTimeline = async () => {
    const result = await api.getAttendance({ WorkerID: select.value, month: currentMonth });
    const items = result.data || [];
    const list = content.querySelector('#timelineList');

    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><p>No attendance history</p></div>';
      return;
    }

    list.innerHTML = items.map(r => {
      const status = (r.AttendanceStatus || '').toLowerCase();
      const color = status === 'present' || status === 'overtime' ? 'var(--color-present)' :
                    status === 'absent' ? 'var(--color-absent)' : 'var(--color-leave)';
      return `
        <div class="timeline-item">
          <div class="timeline-marker" style="background:${color}22;color:${color}">
            <span class="material-symbols-rounded" style="font-size:16px">schedule</span>
          </div>
          <div class="timeline-content">
            <h4>${formatDisplayDate(r.Date)} — ${r.AttendanceStatus}</h4>
            <p>${r.TimeIn || '-'} to ${r.TimeOut || '-'} · ${r.WorkedHours}h worked${parseFloat(r.OvertimeHours) > 0 ? ` · ${r.OvertimeHours}h OT` : ''}</p>
          </div>
        </div>
      `;
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
        <div class="form-group">
          <label>Date</label>
          <input type="date" class="form-control" value="${(record && record.Date) || currentDate}" disabled>
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="AttendanceStatus" class="form-control" id="attStatus">
            <option value="Present" ${defaultStatus === 'Present' ? 'selected' : ''}>Present</option>
            <option value="Absent" ${defaultStatus === 'Absent' ? 'selected' : ''}>Absent</option>
            <option value="Leave" ${defaultStatus === 'Leave' ? 'selected' : ''}>Leave</option>
            <option value="Overtime" ${defaultStatus === 'Overtime' ? 'selected' : ''}>Overtime</option>
          </select>
        </div>
        <div id="timeFields">
          <div class="section-title" style="margin:12px 0 8px">Working Hours</div>
          <div class="form-row">
            <div class="form-group">
              <label>Time In</label>
              <input type="time" name="TimeIn" class="form-control" value="${(record && record.TimeIn) || '08:00'}">
            </div>
            <div class="form-group">
              <label>Time Out</label>
              <input type="time" name="TimeOut" class="form-control" value="${(record && record.TimeOut) || '17:00'}">
            </div>
          </div>
          <div class="form-group">
            <label>Time Cut (minutes)</label>
            <input type="number" name="TimeCut" class="form-control" min="0" value="${(record && record.TimeCut != null) ? record.TimeCut : 60}">
          </div>
          <div id="hoursPreview" class="card" style="padding:12px;font-size:0.875rem"></div>
        </div>
      </form>
    `,
    footer: `
      ${isEdit ? '<button class="btn btn-danger" id="deleteAttendance">Delete</button>' : ''}
      <button class="btn btn-secondary dialog-cancel">Cancel</button>
      <button class="btn btn-primary" id="saveAttendance">${isEdit ? 'Update' : 'Mark'}</button>
    `
  });

  const form = element.querySelector('#attendanceForm');
  const timeFields = element.querySelector('#timeFields');
  const hoursPreview = element.querySelector('#hoursPreview');
  const statusSelect = element.querySelector('#attStatus');

  const updateFields = () => {
    const status = statusSelect.value.toLowerCase();
    const showTimes = status === 'present' || status === 'overtime';

    timeFields.style.display = showTimes ? 'block' : 'none';

    if (showTimes) {
      const data = getFormData(form);
      const hours = calculateHours(data, parseFloat(settings.regularHours) || 8);
      hoursPreview.innerHTML = `
        <strong>Calculated:</strong> ${hours.workedHours}h worked ·
        ${hours.regularHours}h regular · ${hours.overtimeHours}h overtime
      `;
    }
  };

  statusSelect.addEventListener('change', updateFields);
  form.addEventListener('input', updateFields);
  updateFields();

  element.querySelector('.dialog-cancel').addEventListener('click', close);

  const deleteBtn = element.querySelector('#deleteAttendance');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this attendance record?')) return;
      try {
        await api.deleteAttendance(record.AttendanceID);
        api.invalidateActionCache('getAttendance');
        showToast('Attendance deleted', 'success');
        close();
        renderView(document.getElementById('pageContainer'));
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  }

  element.querySelector('#saveAttendance').addEventListener('click', async () => {
    const data = getFormData(form);
    const status = data.AttendanceStatus.toLowerCase();

    if (status === 'absent' || status === 'leave') {
      data.TimeIn = '';
      data.TimeOut = '';
      data.TimeCut = 0;
    }

    const validation = validateAttendance(data);
    if (!validation.valid) {
      showFormErrors(form, validation.errors);
      return;
    }

    try {
      if (isEdit) {
        await api.updateAttendance({ ...data, AttendanceID: record.AttendanceID });
        showToast('Attendance updated', 'success');
      } else {
        await api.markAttendance(data);
        showToast('Attendance marked', 'success');
      }
      api.invalidateActionCache('getAttendance');
      close();
      renderView(document.getElementById('pageContainer'));
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

export function exportAttendanceData() {
  exportAttendance(records);
}

export function exportAttendancePDFData(dateRange) {
  exportAttendancePDF(records, dateRange);
}
