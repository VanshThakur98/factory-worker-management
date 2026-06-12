import { renderDashboard } from './pages/dashboard.js';
import { renderWorkers } from './pages/workers.js';
import { renderAttendance } from './pages/attendance.js';
import { renderPayroll } from './pages/payroll.js';
import { renderLeaves } from './pages/leaves.js';
import { renderReports } from './pages/reports.js';
import { renderSettings } from './pages/settings.js';
import { destroyAllCharts } from './components/charts.js';
import { showToast } from './components/toast.js';
import { api } from './services/api.js';

const PAGE_TITLES = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview & Statistics' },
  workers: { title: 'Workers', subtitle: 'Manage factory workers' },
  attendance: { title: 'Attendance', subtitle: 'Track daily attendance' },
  payroll: { title: 'Payroll', subtitle: 'Salary & payments' },
  leaves: { title: 'Leaves', subtitle: 'Leave management' },
  reports: { title: 'Reports', subtitle: 'Analytics & exports' },
  settings: { title: 'Settings', subtitle: 'Configuration' }
};

let currentPage = 'dashboard';

const pages = {
  dashboard: renderDashboard,
  workers: renderWorkers,
  attendance: renderAttendance,
  payroll: renderPayroll,
  leaves: renderLeaves,
  reports: renderReports,
  settings: renderSettings
};

async function navigateTo(page) {
  if (!pages[page]) return;

  currentPage = page;
  destroyAllCharts();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page ||
      (page === 'leaves' || page === 'reports' || page === 'settings') && item.dataset.page === 'more');
  });

  const titles = PAGE_TITLES[page];
  document.getElementById('pageTitle').textContent = titles.title;
  document.getElementById('pageSubtitle').textContent = titles.subtitle;

  const container = document.getElementById('pageContainer');
  container.innerHTML = '';
  showLoading(true);

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
    showLoading(false);
    updateOfflineBanner();
  }

  history.replaceState({ page }, '', `?page=${page}`);
}

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}

function updateOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  const offline = !navigator.onLine || api.isOffline();
  banner.classList.toggle('hidden', !offline);
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.page === 'more') {
        openMoreSheet();
      } else {
        closeMoreSheet();
        navigateTo(item.dataset.page);
      }
    });
  });

  document.querySelectorAll('.sheet-item').forEach(item => {
    item.addEventListener('click', () => {
      closeMoreSheet();
      navigateTo(item.dataset.page);
    });
  });

  document.getElementById('sheetBackdrop').addEventListener('click', closeMoreSheet);
  document.getElementById('refreshBtn').addEventListener('click', () => navigateTo(currentPage));
}

function openMoreSheet() {
  document.getElementById('moreSheet').classList.add('open');
  document.getElementById('sheetBackdrop').classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById('sheetBackdrop').classList.add('open'));
}

function closeMoreSheet() {
  document.getElementById('moreSheet').classList.remove('open');
  document.getElementById('sheetBackdrop').classList.remove('open');
  setTimeout(() => document.getElementById('sheetBackdrop').classList.add('hidden'), 250);
}

function setupPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
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

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupPWA();
  navigateTo(getInitialPage());
});
