import { Storage } from './storage.js';

class ApiService {
    constructor() {
        this.baseUrl = 'https://script.google.com/macros/s/AKfycbz245KUaw5bAWR46q1P8j1UGCfYXuIj-KfsCn1YnCKqSD3BB0GQ4jO_j6PIgzk3rYv45A/exec';
        this.offline = false;
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

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success === false) {
                throw new Error(result.error || 'Request failed');
            }

            this.offline = false;
            this.cacheResult(action, result, data);
            return result;
        } catch (error) {
            const cached = this.getCachedResult(action, data);
            if (cached) {
                this.offline = true;
                return {...cached, offline: true };
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
        return this.request('addWorker', { data });
    }

    async updateWorker(data) {
        return this.request('updateWorker', { data });
    }

    async deleteWorker(workerId) {
        return this.request('deleteWorker', { data: { WorkerID: workerId } });
    }

    async getAttendance(params = {}) {
        return this.request('getAttendance', params);
    }

    async markAttendance(data) {
        return this.request('markAttendance', { data });
    }

    async updateAttendance(data) {
        return this.request('updateAttendance', { data });
    }

    async deleteAttendance(attendanceId) {
        return this.request('deleteAttendance', { data: { AttendanceID: attendanceId } });
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
        return this.request('generatePayroll', { data: { month } });
    }

    async getDashboard(params = {}) {
        return this.request('getDashboard', params);
    }

    async getSettings() {
        return this.request('getSettings', {}, { allowOffline: true });
    }

    async updateSettings(settings) {
        return this.request('updateSettings', { data: { settings } });
    }

    async getReports(params) {
        return this.request('getReports', params);
    }
}

export const api = new ApiService();