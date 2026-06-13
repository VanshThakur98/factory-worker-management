import { buildWorkerLookup, resolveWorker, resolveWorkerId } from './helpers.js';

/** Shared payroll calculation — used by Payroll page, Dashboard, and Worker profile */

export function getRateType(worker, settings) {
  return (worker.RateType || worker.rateType || settings.defaultRateType || 'hour').toLowerCase();
}

export function getRateLabel(rateType) {
  const map = { hour: '/hr', day: '/day', minute: '/min' };
  return map[rateType] || '/hr';
}

export function computeWorkerPay(attendanceRecords, worker, settings) {
  const rateType = getRateType(worker, settings);
  const rate = parseFloat(worker.HourlyRate || worker.PayRate) || 0;
  const regularLimit = parseFloat(settings.regularHours) || 8;

  let totalWorked = 0;
  let totalRegular = 0;
  let totalOvertime = 0;
  let presentDays = 0;
  let overtimeDays = 0;
  const overtimeRecords = [];

  (attendanceRecords || []).forEach(a => {
    const status = String(a.AttendanceStatus || '').toLowerCase();
    if (status === 'overtime') {
      const otHours = parseFloat(a.OvertimeHours) || parseFloat(a.WorkedHours) || 0;
      totalOvertime += otHours;
      totalWorked += parseFloat(a.WorkedHours) || 0;
      overtimeDays++;
      overtimeRecords.push(a);
    } else if (status === 'present' || status === 'half day') {
      totalRegular += parseFloat(a.RegularHours) || parseFloat(a.WorkedHours) || 0;
      const embeddedOt = parseFloat(a.OvertimeHours) || 0;
      if (embeddedOt > 0) {
        totalOvertime += embeddedOt;
        overtimeDays++;
        overtimeRecords.push({ ...a, _embeddedOt: true });
      }
      totalWorked += parseFloat(a.WorkedHours) || 0;
      presentDays++;
    }
  });

  totalRegular = round2(totalRegular);
  totalOvertime = round2(totalOvertime);
  totalWorked = round2(totalWorked);

  let regularPay = 0;
  let overtimePay = 0;

  if (rateType === 'day') {
    regularPay = presentDays * rate;
    const hourlyEquiv = regularLimit > 0 ? rate / regularLimit : 0;
    overtimePay = totalOvertime * hourlyEquiv;
  } else if (rateType === 'minute') {
    regularPay = totalRegular * 60 * rate;
    overtimePay = totalOvertime * 60 * rate;
  } else {
    regularPay = totalRegular * rate;
    overtimePay = totalOvertime * rate;
  }

  regularPay = round2(regularPay);
  overtimePay = round2(overtimePay);

  return {
    WorkerID: worker.WorkerID,
    WorkerName: worker.WorkerName,
    TotalHours: totalWorked,
    RegularHours: totalRegular,
    OvertimeHours: totalOvertime,
    PresentDays: presentDays,
    OvertimeDays: overtimeDays,
    OvertimeRecords: overtimeRecords,
    HourlyRate: rate,
    RateType: rateType,
    RegularPay: regularPay,
    OvertimePay: overtimePay,
    TotalPay: round2(regularPay + overtimePay)
  };
}

export function computePayrollFromAttendance(attendance, workers, settings) {
  const lookup = buildWorkerLookup(workers);
  const grouped = {};

  (attendance || []).forEach(a => {
    const resolvedId = resolveWorkerId(a.WorkerID, a.WorkerName, lookup);
    if (!resolvedId) return;
    if (!grouped[resolvedId]) grouped[resolvedId] = [];
    grouped[resolvedId].push(a);
  });

  return Object.keys(grouped).map(id => {
    const records = grouped[id];
    const worker = lookup.byId[id] || resolveWorker(records[0]?.WorkerID, records[0]?.WorkerName, lookup);
    return computeWorkerPay(records, worker, settings);
  }).sort((a, b) => b.TotalPay - a.TotalPay);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
