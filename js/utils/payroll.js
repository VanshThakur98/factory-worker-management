/** Shared payroll calculation — used by Payroll page and Dashboard */

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
  const multiplier = parseFloat(settings.overtimeMultiplier) || 1.5;
  const regularLimit = parseFloat(settings.regularHours) || 8;

  let totalWorked = 0;
  let totalRegular = 0;
  let totalOvertime = 0;
  let presentDays = 0;

  (attendanceRecords || []).forEach(a => {
    const status = String(a.AttendanceStatus || '').toLowerCase();
    if (status === 'overtime') {
      totalOvertime += parseFloat(a.OvertimeHours) || parseFloat(a.WorkedHours) || 0;
      totalWorked += parseFloat(a.WorkedHours) || 0;
    } else if (status === 'present' || status === 'half day') {
      totalRegular += parseFloat(a.RegularHours) || parseFloat(a.WorkedHours) || 0;
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
    overtimePay = totalOvertime * hourlyEquiv * multiplier;
  } else if (rateType === 'minute') {
    regularPay = totalRegular * 60 * rate;
    overtimePay = totalOvertime * 60 * rate * multiplier;
  } else {
    regularPay = totalRegular * rate;
    overtimePay = totalOvertime * rate * multiplier;
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
    HourlyRate: rate,
    RateType: rateType,
    RegularPay: regularPay,
    OvertimePay: overtimePay,
    TotalPay: round2(regularPay + overtimePay)
  };
}

export function computePayrollFromAttendance(attendance, workers, settings) {
  const workerMap = {};
  (workers || []).forEach(w => { workerMap[w.WorkerID] = w; });

  const grouped = {};
  (attendance || []).forEach(a => {
    if (!grouped[a.WorkerID]) grouped[a.WorkerID] = [];
    grouped[a.WorkerID].push(a);
  });

  return Object.keys(grouped).map(id =>
    computeWorkerPay(grouped[id], workerMap[id] || { WorkerID: id, WorkerName: 'Unknown', HourlyRate: 0 }, settings)
  ).sort((a, b) => b.TotalPay - a.TotalPay);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
