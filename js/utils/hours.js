const REGULAR_HOURS_DEFAULT = 8;

export function parseTime(timeStr) {
  if (!timeStr) return { hours: 0, minutes: 0 };
  const parts = String(timeStr).trim().split(':');
  return {
    hours: parseInt(parts[0]) || 0,
    minutes: parseInt(parts[1]) || 0
  };
}

export function getWorkedMinutes(timeIn, timeOut) {
  const inParts = parseTime(timeIn);
  const outParts = parseTime(timeOut);

  let inMinutes = inParts.hours * 60 + inParts.minutes;
  let outMinutes = outParts.hours * 60 + outParts.minutes;

  if (outMinutes <= inMinutes) {
    outMinutes += 24 * 60;
  }

  return outMinutes - inMinutes;
}

export function roundHours(hours) {
  return Math.round(hours * 100) / 100;
}

export function calculateHours(data, regularLimit = REGULAR_HOURS_DEFAULT) {
  const status = (data.AttendanceStatus || '').toLowerCase();

  if (status === 'absent' || status === 'leave') {
    return { workedHours: 0, regularHours: 0, overtimeHours: 0 };
  }

  if (status === 'present') {
    if (!data.TimeIn || !data.TimeOut) {
      return {
        workedHours: regularLimit,
        regularHours: regularLimit,
        overtimeHours: 0
      };
    }
  }

  if (status === 'half day') {
    const half = regularLimit / 2;
    return { workedHours: half, regularHours: half, overtimeHours: 0 };
  }

  if (!data.TimeIn || !data.TimeOut) {
    return { workedHours: 0, regularHours: 0, overtimeHours: 0 };
  }

  const timeCut = parseInt(data.TimeCut) || 0;
  let workedMinutes = getWorkedMinutes(data.TimeIn, data.TimeOut) - timeCut;
  if (workedMinutes < 0) workedMinutes = 0;

  const workedHours = roundHours(workedMinutes / 60);
  const regularHours = roundHours(Math.min(workedHours, regularLimit));
  const overtimeHours = roundHours(Math.max(0, workedHours - regularLimit));

  return { workedHours, regularHours, overtimeHours };
}

export function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function calculatePay(regularHours, overtimeHours, hourlyRate, overtimeMultiplier = 1.5) {
  const rate = parseFloat(hourlyRate) || 0;
  const regularPay = roundHours(regularHours * rate);
  const overtimePay = roundHours(overtimeHours * rate * overtimeMultiplier);
  return {
    regularPay,
    overtimePay,
    totalPay: roundHours(regularPay + overtimePay)
  };
}
