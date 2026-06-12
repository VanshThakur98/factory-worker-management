const PREFIX = 'fwms_';

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
    return localStorage.getItem(PREFIX + 'api_url') || '';
  },

  setApiUrl(url) {
    localStorage.setItem(PREFIX + 'api_url', url);
  },

  getSettings() {
    return this.get('settings', {
      companyName: 'Factory Worker Management',
      regularHours: 8,
      overtimeMultiplier: 1.5,
      currency: 'INR'
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
  }
};
