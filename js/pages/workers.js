import { api } from '../services/api.js';
import { formatCurrency, getInitials, debounce, statusBadgeClass } from '../utils/helpers.js';
import { validateWorker } from '../utils/validators.js';
import { showDialog, getFormData, showFormErrors } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { exportWorkers } from '../services/export.js';
import { Storage } from '../services/storage.js';

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
  list.innerHTML = '<div class="spinner" style="margin:24px auto"></div>';

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
                <td>${formatCurrency(w.HourlyRate, settings.currency)}/hr</td>
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
          <div class="worker-rate">${formatCurrency(w.HourlyRate, settings.currency)}/hr</div>
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
    card.addEventListener('click', () => {
      const worker = workers.find(w => w.WorkerID === card.dataset.id);
      if (worker) showWorkerForm(worker);
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
            <label>Hourly Rate *</label>
            <input type="number" name="HourlyRate" class="form-control" step="0.01" min="0" value="${worker?.HourlyRate || ''}" required>
          </div>
          <div class="form-group">
            <label>Join Date</label>
            <input type="date" name="JoinDate" class="form-control" value="${worker?.JoinDate || new Date().toISOString().split('T')[0]}">
          </div>
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
    }
  });
}

export function exportWorkersData() {
  exportWorkers(workers);
}
