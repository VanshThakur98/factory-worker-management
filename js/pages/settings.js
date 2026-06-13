import { api } from '../services/api.js';
import { Storage } from '../services/storage.js';
import { showToast } from '../components/toast.js';
import { isValidUrl } from '../utils/validators.js';
import { escapeHtml } from '../utils/helpers.js';
import { showProcessing, hideProcessing } from '../components/loader.js';

export async function renderSettings(container) {
  showProcessing('Loading settings...');
  let settings = Storage.getSettings();

  try {
    const result = await api.getSettings();
    if (result.data) settings = Storage.syncSettingsFromApi(result.data);
  } catch {
    // use local settings
  } finally {
    hideProcessing();
  }
  const apiUrl = Storage.getApiUrl();
  const apiHardcoded = Storage.isApiUrlHardcoded();
  let connected = false;

  if (apiUrl) {
    try {
      await api.ping();
      connected = !api.isOffline();
    } catch {
      connected = false;
    }
  }

  const apiSection = apiHardcoded ? `
      <div class="form-group">
        <label>Backend URL (built into app)</label>
        <input type="text" class="form-control" value="${escapeHtml(apiUrl)}" readonly>
      </div>
      <button class="btn btn-primary" id="testApiUrl" style="width:100%;margin-bottom:8px">Test Connection</button>
    ` : `
      <div class="form-group">
        <label>Google Apps Script Web App URL</label>
        <input type="url" class="form-control" id="apiUrl" value="${escapeHtml(apiUrl)}" placeholder="https://script.google.com/macros/s/.../exec">
      </div>
      <button class="btn btn-primary" id="saveApiUrl" style="width:100%;margin-bottom:8px">Save & Test Connection</button>
    `;

  container.innerHTML = `
    <div class="connection-status ${connected ? 'connected' : 'disconnected'}">
      <span class="status-dot"></span>
      ${connected ? 'Connected to backend' : apiHardcoded ? 'Not connected — check your Apps Script deployment' : 'Not connected — configure API URL below'}
    </div>

    <div class="settings-section">
      <h3>API Configuration</h3>
      ${apiSection}
      <button class="btn btn-secondary" id="initDb" style="width:100%">Initialize Database Sheets</button>
    </div>

    <div class="settings-section">
      <h3>Company Settings</h3>
      <div class="form-group">
        <label>Company Name</label>
        <input type="text" class="form-control" id="companyName" value="${settings.companyName}">
      </div>
      <div class="form-group">
        <label>Regular Hours/Day</label>
        <input type="number" class="form-control" id="regularHours" value="${settings.regularHours}" min="1" max="24">
      </div>
      <div class="form-group">
        <label>Default Pay Rate Type</label>
        <select class="form-control" id="defaultRateType">
          <option value="hour" ${(settings.defaultRateType || 'hour') === 'hour' ? 'selected' : ''}>Per Hour</option>
          <option value="day" ${settings.defaultRateType === 'day' ? 'selected' : ''}>Per Day</option>
          <option value="minute" ${settings.defaultRateType === 'minute' ? 'selected' : ''}>Per Minute</option>
        </select>
      </div>
      <div class="form-group">
        <label>Currency</label>
        <select class="form-control" id="currency">
          <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
          <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
          <option value="GBP" ${settings.currency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
          <option value="INR" ${settings.currency === 'INR' ? 'selected' : ''}>INR (₹)</option>
        </select>
      </div>
      <button class="btn btn-primary" id="saveSettings" style="width:100%">Save Settings</button>
    </div>

    <div class="settings-section">
      <h3>PWA</h3>
      <div class="settings-item">
        <label>Install App</label>
        <button class="btn btn-outline btn-sm" id="installAppBtn">Add to Home Screen</button>
      </div>
      <div class="settings-item">
        <label>Clear Cache</label>
        <button class="btn btn-outline btn-sm" id="clearCacheBtn">Clear</button>
      </div>
    </div>

    <div class="about-info">
      <div class="app-logo"><span class="material-symbols-rounded">factory</span></div>
      <strong>Factory Worker Management System</strong>
      <p>Version 1.0.0</p>
      <p>Built with Material 3 Design</p>
    </div>
  `;

  const testConnection = async () => {
    try {
      await api.ping();
      showToast('Connected successfully!', 'success');
      renderSettings(container);
    } catch (e) {
      showToast('Connection failed: ' + e.message, 'error');
    }
  };

  container.querySelector('#testApiUrl')?.addEventListener('click', testConnection);

  container.querySelector('#saveApiUrl')?.addEventListener('click', async () => {
    const url = container.querySelector('#apiUrl').value.trim();
    if (!url || !isValidUrl(url)) {
      showToast('Enter a valid URL', 'error');
      return;
    }

    api.setBaseUrl(url);
    await testConnection();
  });

  container.querySelector('#initDb').addEventListener('click', async () => {
    try {
      await api.initialize();
      showToast('Database initialized', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  container.querySelector('#saveSettings').addEventListener('click', async () => {
    const newSettings = {
      companyName: container.querySelector('#companyName').value,
      regularHours: parseFloat(container.querySelector('#regularHours').value) || 8,
      currency: container.querySelector('#currency').value,
      defaultRateType: container.querySelector('#defaultRateType').value
    };

    Storage.setSettings(newSettings);

    try {
      showProcessing('Saving settings...');
      await api.updateSettings({
        CompanyName: newSettings.companyName,
        RegularHours: String(newSettings.regularHours),
        Currency: newSettings.currency,
        DefaultRateType: newSettings.defaultRateType
      });
      showToast('Settings saved', 'success');
    } catch {
      showToast('Settings saved locally', 'info');
    } finally {
      hideProcessing();
    }
  });

  container.querySelector('#clearCacheBtn').addEventListener('click', async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    Object.keys(localStorage).filter(k => k.startsWith('fwms_cache_')).forEach(k => localStorage.removeItem(k));

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
    }

    showToast('Cache cleared — reloading app', 'success');
    setTimeout(() => location.reload(), 800);
  });

  container.querySelector('#installAppBtn').addEventListener('click', () => {
    const event = window.deferredInstallPrompt;
    if (event) {
      event.prompt();
    } else {
      showToast('Use Safari Share → Add to Home Screen', 'info');
    }
  });
}
