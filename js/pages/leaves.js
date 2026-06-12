import { api } from '../services/api.js';
import { formatDisplayDate, statusBadgeClass } from '../utils/helpers.js';
import { validateLeave } from '../utils/validators.js';
import { showDialog, getFormData, showFormErrors } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { renderCalendar, buildAttendanceMap } from '../components/calendar.js';
import { exportLeaves } from '../services/export.js';

const LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Paid Leave', 'Unpaid Leave'];
const LEAVE_BALANCES = { 'Casual Leave': 12, 'Sick Leave': 10, 'Paid Leave': 15, 'Unpaid Leave': 999 };

let leaves = [];
let workers = [];
let statusFilter = 'all';

export async function renderLeaves(container) {
  container.innerHTML = `
    <div class="tabs" id="leaveTabs">
      <button class="tab active" data-view="requests">Requests</button>
      <button class="tab" data-view="calendar">Calendar</button>
      <button class="tab" data-view="balance">Balance</button>
    </div>
    <div class="chip-group" id="leaveStatusChips">
      <button class="chip active" data-status="all">All</button>
      <button class="chip" data-status="Pending">Pending</button>
      <button class="chip" data-status="Approved">Approved</button>
      <button class="chip" data-status="Rejected">Rejected</button>
    </div>
    <div id="leaveContent"></div>
    <button class="btn-fab" id="applyLeaveFab" aria-label="Apply leave">
      <span class="material-symbols-rounded">add</span>
    </button>
  `;

  container.querySelector('#applyLeaveFab').addEventListener('click', () => showLeaveForm());
  container.querySelectorAll('#leaveTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('#leaveTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
      renderLeaveView(container, tab.dataset.view);
    });
  });

  container.querySelectorAll('#leaveStatusChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      statusFilter = chip.dataset.status;
      container.querySelectorAll('#leaveStatusChips .chip').forEach(c => c.classList.toggle('active', c === chip));
      renderLeaveView(container, 'requests');
    });
  });

  await loadData();
  renderLeaveView(container, 'requests');
}

async function loadData() {
  try {
    const [leaveResult, workerResult] = await Promise.all([
      api.getLeaves(),
      api.getWorkers({ status: 'Active' })
    ]);
    leaves = leaveResult.data || [];
    workers = workerResult.data || [];
  } catch {
    leaves = [];
    workers = [];
  }
}

async function renderLeaveView(container, view) {
  const content = container.querySelector('#leaveContent');
  const chips = container.querySelector('#leaveStatusChips');
  chips.style.display = view === 'requests' ? 'flex' : 'none';

  if (view === 'requests') {
    await renderRequests(content);
  } else if (view === 'calendar') {
    await renderLeaveCalendar(content);
  } else {
    await renderBalance(content);
  }
}

async function renderRequests(content) {
  let filtered = [...leaves];
  if (statusFilter !== 'all') {
    filtered = filtered.filter(l => l.Status === statusFilter);
  }

  if (!filtered.length) {
    content.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">event_busy</span><h3>No leave requests</h3></div>';
    return;
  }

  content.innerHTML = filtered.map(l => `
    <div class="card leave-card">
      <div class="leave-card-header">
        <h4>${l.WorkerName}</h4>
        <span class="badge ${statusBadgeClass(l.Status)}">${l.Status}</span>
      </div>
      <div class="leave-dates">
        <span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle">date_range</span>
        ${formatDisplayDate(l.StartDate)} — ${formatDisplayDate(l.EndDate)}
      </div>
      <div style="margin-bottom:8px"><span class="badge badge-leave">${l.LeaveType}</span></div>
      <div class="leave-reason">${l.Reason || 'No reason provided'}</div>
      ${l.Status === 'Pending' ? `
        <div class="leave-actions">
          <button class="btn btn-primary btn-sm" data-approve="${l.LeaveID}">Approve</button>
          <button class="btn btn-danger btn-sm" data-reject="${l.LeaveID}">Reject</button>
        </div>
      ` : ''}
    </div>
  `).join('');

  content.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.approveLeave(btn.dataset.approve);
        showToast('Leave approved', 'success');
        await loadData();
        renderLeaveView(document.getElementById('pageContainer'), 'requests');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  });

  content.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.rejectLeave(btn.dataset.reject);
        showToast('Leave rejected', 'info');
        await loadData();
        renderLeaveView(document.getElementById('pageContainer'), 'requests');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  });
}

async function renderLeaveCalendar(content) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const approved = leaves.filter(l => l.Status === 'Approved');
  const attMap = {};

  approved.forEach(l => {
    const start = new Date(l.StartDate + 'T00:00:00');
    const end = new Date(l.EndDate + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      attMap[dateStr] = { status: 'Leave', overtime: 0 };
    }
  });

  content.innerHTML = `
    <div class="card calendar glass">
      <div class="calendar-header"><h3>Leave Calendar</h3></div>
      <div id="leaveCalGrid"></div>
    </div>
  `;

  renderCalendar(content.querySelector('#leaveCalGrid'), year, month, attMap);
}

async function renderBalance(content) {
  if (!workers.length) {
    content.innerHTML = '<div class="empty-state"><p>No workers available</p></div>';
    return;
  }

  content.innerHTML = `
    <div class="form-group">
      <label>Select Worker</label>
      <select class="form-control" id="balanceWorker">
        ${workers.map(w => `<option value="${w.WorkerID}">${w.WorkerName}</option>`).join('')}
      </select>
    </div>
    <div id="balanceGrid"></div>
  `;

  const updateBalance = () => {
    const workerId = content.querySelector('#balanceWorker').value;
    const workerLeaves = leaves.filter(l =>
      l.WorkerID === workerId && l.Status === 'Approved'
    );

    const used = {};
    LEAVE_TYPES.forEach(t => { used[t] = 0; });

    workerLeaves.forEach(l => {
      const start = new Date(l.StartDate + 'T00:00:00');
      const end = new Date(l.EndDate + 'T00:00:00');
      const days = Math.round((end - start) / 86400000) + 1;
      if (used[l.LeaveType] !== undefined) used[l.LeaveType] += days;
    });

    content.querySelector('#balanceGrid').innerHTML = `
      <div class="leave-balance-grid">
        ${LEAVE_TYPES.map(type => {
          const total = LEAVE_BALANCES[type];
          const u = used[type] || 0;
          const remaining = Math.max(0, total - u);
          return `
            <div class="card leave-balance-card">
              <div class="remaining">${remaining}</div>
              <div class="type">${type}</div>
              <div class="used">${u} used of ${total}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  content.querySelector('#balanceWorker').addEventListener('change', updateBalance);
  updateBalance();
}

function showLeaveForm() {
  const { close, element } = showDialog({
    title: 'Apply Leave',
    content: `
      <form id="leaveForm">
        <div class="form-group">
          <label>Worker *</label>
          <select name="WorkerID" class="form-control">
            <option value="">Select worker</option>
            ${workers.map(w => `<option value="${w.WorkerID}">${w.WorkerName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Leave Type *</label>
          <select name="LeaveType" class="form-control">
            ${LEAVE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Start Date *</label>
            <input type="date" name="StartDate" class="form-control">
          </div>
          <div class="form-group">
            <label>End Date *</label>
            <input type="date" name="EndDate" class="form-control">
          </div>
        </div>
        <div class="form-group">
          <label>Reason</label>
          <textarea name="Reason" class="form-control" rows="3" placeholder="Reason for leave..."></textarea>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-secondary dialog-cancel">Cancel</button>
      <button class="btn btn-primary" id="submitLeave">Submit</button>
    `
  });

  element.querySelector('.dialog-cancel').addEventListener('click', close);
  element.querySelector('#submitLeave').addEventListener('click', async () => {
    const form = element.querySelector('#leaveForm');
    const data = getFormData(form);
    const validation = validateLeave(data);

    if (!validation.valid) {
      showFormErrors(form, validation.errors);
      return;
    }

    try {
      await api.applyLeave(data);
      showToast('Leave request submitted', 'success');
      close();
      await loadData();
      renderLeaveView(document.getElementById('pageContainer'), 'requests');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

export function exportLeavesData() {
  exportLeaves(leaves);
}
