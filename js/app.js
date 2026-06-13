import { renderDashboard } from './pages/dashboard.js';
import { renderWorkers } from './pages/workers.js';
import { renderAttendance, clearAttendanceCache } from './pages/attendance.js';
import { renderPayroll } from './pages/payroll.js';
import { renderReports } from './pages/reports.js';
import { renderSettings } from './pages/settings.js';
import { destroyAllCharts } from './components/charts.js';
import { showToast } from './components/toast.js';
import { api } from './services/api.js';
import { Storage } from './services/storage.js';
import { showProcessing, hideProcessing } from './components/loader.js';

const PAGE_TITLES = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview & Statistics' },
  workers: { title: 'Workers', subtitle: 'Manage factory workers' },
  attendance: { title: 'Attendance', subtitle: 'Track daily attendance' },
  payroll: { title: 'Payroll', subtitle: 'Salary & payments' },
  reports: { title: 'Reports', subtitle: 'Analytics & exports' },
  settings: { title: 'Settings', subtitle: 'Configuration' }
};

let currentPage = 'dashboard';
let moreSheetOpen = false;

const pages = {
  dashboard: renderDashboard,
  workers: renderWorkers,
  attendance: renderAttendance,
  payroll: renderPayroll,
  reports: renderReports,
  settings: renderSettings
};

const PAGE_LOAD_MESSAGES = {
  dashboard: 'Loading dashboard...',
  workers: 'Loading workers...',
  attendance: 'Loading attendance...',
  payroll: 'Loading payroll...',
  reports: 'Loading reports...',
  settings: 'Loading settings...'
};

async function navigateTo(page) {
  if (!pages[page]) return;

  closeMoreSheet();
  currentPage = page;
  destroyAllCharts();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page ||
      (page === 'reports' || page === 'settings') && item.dataset.page === 'more');
  });

  const titles = PAGE_TITLES[page];
  document.getElementById('pageTitle').textContent = titles.title;
  document.getElementById('pageSubtitle').textContent = titles.subtitle;

  const container = document.getElementById('pageContainer');
  container.innerHTML = '';
  showProcessing(PAGE_LOAD_MESSAGES[page] || 'Loading...');

  try {
    await pages[page](container);
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">error</span>
        <h3>Something went wrong</h3>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Reload</button>
      </div>
    `;
  } finally {
    hideProcessing();
    updateOfflineBanner();
  }

  history.replaceState({ page }, '', `?page=${page}`);
}

async function refreshCurrentPage() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn?.classList.add('spinning');

  api.clearAllCaches();
  clearAttendanceCache();

  try {
    const result = await api.getSettings();
    if (result.data) Storage.syncSettingsFromApi(result.data);
  } catch {
    // keep local settings
  }

  try {
    await navigateTo(currentPage);
    showToast('Data refreshed from spreadsheet', 'success');
  } finally {
    api.endForceFresh();
    refreshBtn?.classList.remove('spinning');
  }
}

function showLoading(show) {
  if (show) showProcessing('Loading...');
  else hideProcessing();
}

function updateOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  const offline = !navigator.onLine || api.isOffline();
  banner.classList.toggle('hidden', !offline);
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page === 'more') {
        toggleMoreSheet();
      } else {
        navigateTo(page);
      }
    });
  });

  document.querySelectorAll('.sheet-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const page = item.dataset.page;
      closeMoreSheet();
      navigateTo(page);
    });
  });

  document.getElementById('sheetBackdrop').addEventListener('click', closeMoreSheet);
  document.getElementById('refreshBtn').addEventListener('click', () => refreshCurrentPage());
  document.getElementById('menuBtn')?.addEventListener('click', () => toggleMoreSheet());
}

function toggleMoreSheet() {
  if (moreSheetOpen) {
    closeMoreSheet();
  } else {
    openMoreSheet();
  }
}

function openMoreSheet() {
  const sheet = document.getElementById('moreSheet');
  const backdrop = document.getElementById('sheetBackdrop');

  moreSheetOpen = true;
  sheet.setAttribute('aria-hidden', 'false');
  backdrop.setAttribute('aria-hidden', 'false');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === 'more');
  });

  requestAnimationFrame(() => {
    sheet.classList.add('open');
    backdrop.classList.add('open');
  });
}

function closeMoreSheet() {
  const sheet = document.getElementById('moreSheet');
  const backdrop = document.getElementById('sheetBackdrop');

  if (!sheet || !backdrop) return;

  moreSheetOpen = false;
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  backdrop.setAttribute('aria-hidden', 'true');

  if (currentPage !== 'reports' && currentPage !== 'settings') {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === currentPage);
    });
  }
}

function setupPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
      registration.update();
    }).catch(err => {
      console.warn('SW registration failed:', err);
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const prompt = document.getElementById('installPrompt');
    if (!localStorage.getItem('fwms_install_dismissed')) {
      prompt.classList.remove('hidden');
    }
  });

  document.getElementById('installBtn')?.addEventListener('click', async () => {
    const event = window.deferredInstallPrompt;
    if (event) {
      event.prompt();
      const result = await event.userChoice;
      if (result.outcome === 'accepted') {
        showToast('App installed!', 'success');
      }
      window.deferredInstallPrompt = null;
    }
    document.getElementById('installPrompt').classList.add('hidden');
  });

  document.getElementById('dismissInstall')?.addEventListener('click', () => {
    document.getElementById('installPrompt').classList.add('hidden');
    localStorage.setItem('fwms_install_dismissed', '1');
  });

  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
}

function getInitialPage() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page');
  return pages[page] ? page : 'dashboard';
}

document.addEventListener('DOMContentLoaded', async () => {
  closeMoreSheet();
  setupNavigation();
  setupPWA();
  try {
    const result = await api.getSettings();
    if (result.data) Storage.syncSettingsFromApi(result.data);
  } catch {
    // use cached settings
  }
  navigateTo(getInitialPage());
});
