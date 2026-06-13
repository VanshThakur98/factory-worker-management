import { api } from '../services/api.js';
import { formatCurrency, getInitials, debounce, statusBadgeClass, formatDisplayDate, getCurrentMonth, getMonthName, normalizeDate } from '../utils/helpers.js';
import { getRateLabel, computeWorkerPay } from '../utils/payroll.js';
import { validateWorker } from '../utils/validators.js';
import { showDialog, getFormData, showFormErrors } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { exportWorkers } from '../services/export.js';
import { Storage } from '../services/storage.js';
import { renderInlineLoader, renderProcessingBlock, showProcessing, hideProcessing } from '../components/loader.js';

let workers = [];
let viewMode = 'cards';
let sortBy = 'WorkerName';
let sortDir = 'asc';
let statusFilter = 'all';

export async function renderWorkers(container) {
  container.innerHTML = `
    <div class="page-toolbar">
      <div class="view-toggle">
        <button class="${viewMode === 'cards' ? 'active' : ''}" data-view="cards" aria-label="Card view">
          <span class="material-symbols-rounded">grid_view</span>
        </button>
        <button class="${viewMode === 'table' ? 'active' : ''}" data-view="table" aria-label="Table view">
          <span class="material-symbols-rounded">table_rows</span>
        </button>
      </div>
      <select class="sort-select" id="sortSelect">
        <option value="WorkerName">Name</option>
        <option value="HourlyRate">Rate</option>
        <option value="JoinDate">Join Date</option>
        <option value="Status">Status</option>
      </select>
    </div>
    <div class="search-bar">
      <span class="material-symbols-rounded">search</span>
      <input type="search" class="form-control" id="workerSearch" placeholder="Search workers...">
    </div>
    <div class="chip-group" id="statusChips">
      <button class="chip active" data-status="all">All</button>
      <button class="chip" data-status="Active">Active</button>
      <button class="chip" data-status="Inactive">Inactive</button>
    </div>
    <div id="workersList"></div>
    <button class="btn-fab" id="addWorkerFab" aria-label="Add worker">
      <span class="material-symbols-rounded">add</span>
    </button>
  `;

  bindEvents(container);
  await loadWorkers(container);
}

function bindEvents(container) {
  container.querySelector('#addWorkerFab').addEventListener('click', () => showWorkerForm());
  container.querySelector('#workerSearch').addEventListener('input', debounce(() => loadWorkers(container), 300));

  container.querySelector('#sortSelect').value = sortBy;
  container.querySelector('#sortSelect').addEventListener('change', (e) => {
    sortBy = e.target.value;
    loadWorkers(container);
  });

  container.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      container.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === viewMode));
      renderWorkersList(container);
    });
  });

  container.querySelectorAll('#statusChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      statusFilter = chip.dataset.status;
      container.querySelectorAll('#statusChips .chip').forEach(c => c.classList.toggle('active', c === chip));
      renderWorkersList(container);
    });
  });
}

async function loadWorkers(container) {
  const list = container.querySelector('#workersList');
  list.innerHTML = renderInlineLoader('Loading workers...');

  try {
    const search = container.querySelector('#workerSearch').value;
    const result = await api.getWorkers({ search, sortBy, sortDir });
    workers = result.data || [];
    renderWorkersList(container);
  } catch (error) {
    list.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
  }
}

function renderWorkersList(container) {
  const list = container.querySelector('#workersList');
  let filtered = [...workers];

  if (statusFilter !== 'all') {
    filtered = filtered.filter(w => w.Status === statusFilter);
  }

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">groups</span>
        <h3>No workers found</h3>
        <p>Add your first worker to get started</p>
      </div>
    `;
    return;
  }

  const settings = Storage.getSettings();

  if (viewMode === 'table') {
    list.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr><th>Name</th><th>Rate</th><th>Phone</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            ${filtered.map(w => `
              <tr>
                <td>${w.WorkerName}</td>
                <td>${formatCurrency(w.HourlyRate, settings.currency)}${getRateLabel(w.RateType || 'hour')}</td>
                <td>${w.Phone || '-'}</td>
                <td><span class="badge ${statusBadgeClass(w.Status)}">${w.Status}</span></td>
                <td>
                  <div class="action-menu">
                    <button class="action-btn" data-action="edit" data-id="${w.WorkerID}"><span class="material-symbols-rounded">edit</span></button>
                    <button class="action-btn" data-action="toggle" data-id="${w.WorkerID}"><span class="material-symbols-rounded">${w.Status === 'Active' ? 'person_off' : 'person'}</span></button>
                    <button class="action-btn danger" data-action="delete" data-id="${w.WorkerID}"><span class="material-symbols-rounded">delete</span></button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    list.innerHTML = filtered.map(w => `
      <div class="card worker-card" data-id="${w.WorkerID}">
        <div class="worker-avatar">${getInitials(w.WorkerName)}</div>
        <div class="worker-info">
          <h3>${w.WorkerName}</h3>
          <p>${w.Phone || 'No phone'} · Joined ${w.JoinDate}</p>
        </div>
        <div class="worker-card-actions">
          <div class="worker-rate">${formatCurrency(w.HourlyRate, settings.currency)}${getRateLabel(w.RateType || 'hour')}</div>
          <span class="badge ${statusBadgeClass(w.Status)}">${w.Status}</span>
          <button class="action-btn danger" data-action="delete" data-id="${w.WorkerID}" aria-label="Delete worker">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
    `).join('');
  }

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAction(btn.dataset.action, btn.dataset.id, container);
    });
  });

  list.querySelectorAll('.worker-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      const worker = workers.find(w => w.WorkerID === card.dataset.id);
      if (worker) showWorkerProfile(worker);
    });
  });

  list.querySelectorAll('.data-table tbody tr').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      const id = row.querySelector('[data-id]')?.dataset.id;
      const worker = workers.find(w => w.WorkerID === id);
      if (worker) showWorkerProfile(worker);
    });
  });
}

async function handleAction(action, workerId, container) {
  const worker = workers.find(w => w.WorkerID === workerId);
  if (!worker) return;

  switch (action) {
    case 'edit':
      showWorkerForm(worker);
      break;
    case 'toggle':
      try {
        await api.updateWorker({
          ...worker,
          Status: worker.Status === 'Active' ? 'Inactive' : 'Active'
        });
        showToast(`Worker ${worker.Status === 'Active' ? 'deactivated' : 'activated'}`, 'success');
        loadWorkers(container);
      } catch (e) {
        showToast(e.message, 'error');
      }
      break;
    case 'delete':
      if (confirm(`Delete ${worker.WorkerName}? This cannot be undone.`)) {
        try {
          await api.deleteWorker(workerId);
          showToast('Worker deleted', 'success');
          loadWorkers(container);
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
      break;
  }
}

async function showWorkerProfile(worker) {
  const settings = Storage.getSettings();
  const profileMonth = getCurrentMonth();
  const startDate = profileMonth + '-01';
  const endDate = profileMonth + '-31';

  const { close, element } = showDialog({
    title: 'Worker Profile',
    content: renderProcessingBlock('Loading profile...'),
    footer: `
      <button class="btn btn-secondary" id="editWorkerProfile">Edit</button>
      <button class="btn btn-primary dialog-cancel">Close</button>`
  });

  element.querySelector('.dialog-cancel').addEventListener('click', close);
  element.querySelector('#editWorkerProfile').addEventListener('click', () => {
    close();
    showWorkerForm(worker);
  });

  try {
    const attResult = await api.getAttendance({ WorkerID: worker.WorkerID, startDate, endDate });
    const attendance = (attResult.data || []).map(r => ({ ...r, Date: normalizeDate(r.Date) }));
    const pay = computeWorkerPay(attendance, worker, settings);

    const otRecordsHtml = pay.OvertimeRecords.length
      ? pay.OvertimeRecords.map(r => {
          const otH = parseFloat(r.OvertimeHours) || parseFloat(r.WorkedHours) || 0;
          const label = r._embeddedOt ? 'Embedded OT' : 'Overtime entry';
          return `
            <div class="worker-ot-record">
              <span>${formatDisplayDate(r.Date)} · ${label}</span>
              <span>${r.TimeIn || '-'} – ${r.TimeOut || '-'} · ${otH}h</span>
            </div>`;
        }).join('')
      : '<p style="color:var(--md-sys-color-on-surface-variant);font-size:0.8125rem;padding:8px 0">No overtime records this month</p>';

    const body = element.querySelector('.dialog-body');
    if (body) {
      body.innerHTML = `
        <div class="worker-profile-header">
          <div class="worker-avatar">${getInitials(worker.WorkerName)}</div>
          <div>
            <h3 style="margin:0">${worker.WorkerName}</h3>
            <p style="font-size:0.8125rem;color:var(--md-sys-color-on-surface-variant);margin:4px 0 0">
              ${worker.Phone || 'No phone'} · ${worker.Status} · Joined ${worker.JoinDate || '-'}
            </p>
            <p style="font-size:0.8125rem;margin-top:4px">
              ${formatCurrency(worker.HourlyRate, settings.currency)}${getRateLabel(worker.RateType || 'hour')}
            </p>
          </div>
        </div>
        <div class="section-title">${getMonthName(profileMonth)} Summary</div>
        <div class="worker-profile-stats">
          <div class="worker-stat-card">
            <div class="stat-value">${pay.RegularHours}h</div>
            <div class="stat-label">Normal Hours</div>
          </div>
          <div class="worker-stat-card overtime">
            <div class="stat-value">${pay.OvertimeHours}h</div>
            <div class="stat-label">Overtime Hours</div>
          </div>
          <div class="worker-stat-card">
            <div class="stat-value">${pay.PresentDays}</div>
            <div class="stat-label">Normal Days</div>
          </div>
          <div class="worker-stat-card overtime">
            <div class="stat-value">${pay.OvertimeDays || 0}</div>
            <div class="stat-label">OT Days</div>
          </div>
          <div class="worker-stat-card">
            <div class="stat-value">${formatCurrency(pay.RegularPay, settings.currency)}</div>
            <div class="stat-label">Normal Earnings</div>
          </div>
          <div class="worker-stat-card overtime">
            <div class="stat-value">${formatCurrency(pay.OvertimePay, settings.currency)}</div>
            <div class="stat-label">Overtime Earnings</div>
          </div>
        </div>
        <div class="card" style="padding:14px;background:var(--md-sys-color-primary-container);margin-bottom:16px;text-align:center">
          <div style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant)">Total Payment</div>
          <div style="font-size:1.5rem;font-weight:700;margin-top:4px">${formatCurrency(pay.TotalPay, settings.currency)}</div>
        </div>
        <div class="section-title">Overtime Records</div>
        <div class="card worker-ot-records" style="padding:12px">${otRecordsHtml}</div>`;
    }
  } catch (e) {
    const body = element.querySelector('.dialog-body');
    if (body) body.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

function showWorkerForm(worker = null) {
  const isEdit = !!worker;
  const { close, element } = showDialog({
    title: isEdit ? 'Edit Worker' : 'Add Worker',
    content: `
      <form id="workerForm">
        <div class="form-group">
          <label>Worker Name *</label>
          <input type="text" name="WorkerName" class="form-control" value="${worker?.WorkerName || ''}" required>
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="Phone" class="form-control" value="${worker?.Phone || ''}" placeholder="10-digit mobile" maxlength="10" inputmode="numeric" pattern="[0-9]{10}">
        </div>
        <div class="form-group">
          <label>Address</label>
          <input type="text" name="Address" class="form-control" value="${worker?.Address || ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Pay Rate *</label>
            <input type="number" name="HourlyRate" class="form-control" step="0.01" min="0" value="${worker?.HourlyRate || ''}" required>
          </div>
          <div class="form-group">
            <label>Rate Type *</label>
            <select name="RateType" class="form-control">
              <option value="hour" ${(worker?.RateType || 'hour') === 'hour' ? 'selected' : ''}>Per Hour</option>
              <option value="day" ${worker?.RateType === 'day' ? 'selected' : ''}>Per Day</option>
              <option value="minute" ${worker?.RateType === 'minute' ? 'selected' : ''}>Per Minute</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Join Date</label>
          <input type="date" name="JoinDate" class="form-control" value="${worker?.JoinDate || new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select name="Status" class="form-control">
            <option value="Active" ${worker?.Status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${worker?.Status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </form>
    `,
    footer: `
      ${isEdit ? '<button class="btn btn-danger" id="deleteWorker">Delete</button>' : ''}
      <button class="btn btn-secondary dialog-cancel">Cancel</button>
      <button class="btn btn-primary" id="saveWorker">${isEdit ? 'Update' : 'Add'} Worker</button>
    `
  });

  element.querySelector('.dialog-cancel').addEventListener('click', close);

  const deleteBtn = element.querySelector('#deleteWorker');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${worker.WorkerName}? This cannot be undone.`)) return;
      try {
        await api.deleteWorker(worker.WorkerID);
        showToast('Worker deleted', 'success');
        close();
        const container = document.getElementById('pageContainer');
        await loadWorkers(container);
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  }

  element.querySelector('#saveWorker').addEventListener('click', async () => {
    const form = element.querySelector('#workerForm');
    const data = getFormData(form);
    const validation = validateWorker(data);

    if (!validation.valid) {
      showFormErrors(form, validation.errors);
      return;
    }

    try {
      showProcessing(isEdit ? 'Updating worker...' : 'Adding worker...');
      if (isEdit) {
        await api.updateWorker({ ...data, WorkerID: worker.WorkerID });
        showToast('Worker updated', 'success');
      } else {
        await api.addWorker(data);
        showToast('Worker added', 'success');
      }
      close();
      const container = document.getElementById('pageContainer');
      await loadWorkers(container);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideProcessing();
    }
  });
}

export function exportWorkersData() {
  exportWorkers(workers);
}
