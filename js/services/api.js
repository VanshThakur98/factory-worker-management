import { Storage } from './storage.js';

class ApiService {
    constructor() {
        this.baseUrl = Storage.getApiUrl() || '';
        this.offline = false;
        this.memCache = new Map();
        this.memCacheTTL = 60000;
        this.forceFresh = false;
    }

    isForceFresh() {
        return this.forceFresh;
    }

    clearAllCaches() {
        this.memCache.clear();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('fwms_cache_')) {
                localStorage.removeItem(key);
            }
        }
        this.forceFresh = true;
    }

    endForceFresh() {
        this.forceFresh = false;
    }

    memCacheKey(action, data) {
        return `${action}_${JSON.stringify(data)}`;
    }

    getMemCached(action, data) {
        const key = this.memCacheKey(action, data);
        const entry = this.memCache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.ts > this.memCacheTTL) {
            this.memCache.delete(key);
            return null;
        }
        return entry.result;
    }

    setMemCached(action, data, result) {
        this.memCache.set(this.memCacheKey(action, data), { result, ts: Date.now() });
    }

    clearMemCacheForAction(action) {
        const prefix = `${action}_`;
        for (const key of this.memCache.keys()) {
            if (key.startsWith(prefix)) this.memCache.delete(key);
        }
    }

    setBaseUrl(url) {
        this.baseUrl = String(url).trim().replace(/\/$/, '');
        Storage.setApiUrl(this.baseUrl);
    }

    getBaseUrl() {
        return this.baseUrl;
    }

    async request(action, data = {}, options = {}) {
        const url = this.getBaseUrl();

        if (!url && !options.allowOffline) {
            throw new Error('API URL not configured. Set APPS_SCRIPT_API_URL in js/config.js.');
        }

        const payload = { action, ...data };

        const skipCache = options.skipCache || this.forceFresh;

        if (!skipCache) {
            const memCached = this.getMemCached(action, data);
            if (memCached) {
                this.offline = false;
                return memCached;
            }
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                mode: 'cors',
                cache: skipCache ? 'no-store' : 'default'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success === false) {
                throw new Error(result.error || 'Request failed');
            }

            this.offline = false;
            if (!skipCache) {
                this.cacheResult(action, result, data);
                this.setMemCached(action, data, result);
            }
            return result;
        } catch (error) {
            if (!skipCache) {
                const cached = this.getCachedResult(action, data);
                if (cached) {
                    this.offline = true;
                    return { ...cached, offline: true };
                }
            }

            if (options.allowOffline) {
                this.offline = true;
                return { success: true, data: [], offline: true };
            }

            throw error;
        }
    }

    cacheResult(action, result, params) {
        const cacheKey = `${action}_${JSON.stringify(params)}`;
        Storage.cacheData(cacheKey, result);
    }

    getCachedResult(action, params) {
        const cacheKey = `${action}_${JSON.stringify(params)}`;
        return Storage.getCachedData(cacheKey, 86400000);
    }

    invalidateActionCache(action) {
        Storage.clearCacheForAction(action);
        this.clearMemCacheForAction(action);
    }

    isOffline() {
        return this.offline || !navigator.onLine;
    }

    async ping() {
        return this.request('ping', {}, { allowOffline: true });
    }

    async initialize() {
        return this.request('initialize');
    }

    async getWorkers(params = {}) {
        return this.request('getWorkers', params);
    }

    async addWorker(data) {
        const result = await this.request('addWorker', { data });
        this.invalidateRelatedCaches();
        return result;
    }

    async updateWorker(data) {
        const result = await this.request('updateWorker', { data });
        this.invalidateRelatedCaches();
        return result;
    }

    async deleteWorker(workerId) {
        const result = await this.request('deleteWorker', { data: { WorkerID: workerId } });
        this.invalidateRelatedCaches();
        return result;
    }

    invalidateRelatedCaches() {
        ['getWorkers', 'getAttendance', 'getPayroll', 'getDashboard', 'getReports'].forEach((action) => {
            this.invalidateActionCache(action);
        });
    }

    async getAttendance(params = {}) {
        const { skipCache, ...query } = params;
        return this.request('getAttendance', query, { skipCache });
    }

    async markAttendance(data) {
        const result = await this.request('markAttendance', { data });
        this.invalidateActionCache('getAttendance');
        this.invalidateActionCache('getDashboard');
        this.invalidateActionCache('getPayroll');
        return result;
    }

    async updateAttendance(data) {
        const result = await this.request('updateAttendance', { data });
        this.invalidateActionCache('getAttendance');
        this.invalidateActionCache('getDashboard');
        this.invalidateActionCache('getPayroll');
        return result;
    }

    async deleteAttendance(attendanceId) {
        const result = await this.request('deleteAttendance', { data: { AttendanceID: attendanceId } });
        this.invalidateActionCache('getAttendance');
        this.invalidateActionCache('getDashboard');
        this.invalidateActionCache('getPayroll');
        return result;
    }

    async getLeaves(params = {}) {
        return this.request('getLeaves', params);
    }

    async applyLeave(data) {
        return this.request('applyLeave', { data });
    }

    async approveLeave(leaveId) {
        return this.request('approveLeave', { data: { LeaveID: leaveId } });
    }

    async rejectLeave(leaveId) {
        return this.request('rejectLeave', { data: { LeaveID: leaveId } });
    }

    async getPayroll(params = {}) {
        return this.request('getPayroll', params);
    }

    async generatePayroll(month) {
        const result = await this.request('generatePayroll', { data: { month } });
        this.invalidateActionCache('getPayroll');
        this.invalidateActionCache('getDashboard');
        return result;
    }

    async getDashboard(params = {}) {
        return this.request('getDashboard', params);
    }

    async getSettings() {
        return this.request('getSettings', {}, { allowOffline: true });
    }

    async updateSettings(settings) {
        const result = await this.request('updateSettings', { data: { settings } });
        this.invalidateActionCache('getSettings');
        return result;
    }

    async getReports(params) {
        return this.request('getReports', params);
    }
}

export const api = new ApiService();