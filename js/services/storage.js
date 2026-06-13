import { APPS_SCRIPT_API_URL } from '../config.js';

const PREFIX = 'fwms_';

function normalizeApiUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

export const Storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage set failed:', e);
    }
  },

  remove(key) {
    localStorage.removeItem(PREFIX + key);
  },

  getApiUrl() {
    const hardcoded = normalizeApiUrl(APPS_SCRIPT_API_URL);
    if (hardcoded) return hardcoded;
    return normalizeApiUrl(localStorage.getItem(PREFIX + 'api_url'));
  },

  isApiUrlHardcoded() {
    return !!normalizeApiUrl(APPS_SCRIPT_API_URL);
  },

  setApiUrl(url) {
    if (this.isApiUrlHardcoded()) return;
    localStorage.setItem(PREFIX + 'api_url', normalizeApiUrl(url));
  },

  getSettings() {
    return this.get('settings', {
      companyName: 'Factory Worker Management',
      regularHours: 8,
      overtimeMultiplier: 1.5,
      currency: 'INR',
      defaultRateType: 'hour'
    });
  },

  setSettings(settings) {
    this.set('settings', settings);
  },

  cacheData(key, data) {
    this.set(`cache_${key}`, { data, timestamp: Date.now() });
  },

  getCachedData(key, maxAge = 300000) {
    const cached = this.get(`cache_${key}`);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > maxAge) return null;
    return cached.data;
  },

  clearCacheForAction(action) {
    const prefix = `${PREFIX}cache_${action}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  }
};
