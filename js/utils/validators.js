export function validateWorker(data) {
  const errors = {};

  if (!data.WorkerName || !data.WorkerName.trim()) {
    errors.WorkerName = 'Worker name is required';
  }

  if (data.HourlyRate === '' || data.HourlyRate === null || data.HourlyRate === undefined) {
    errors.HourlyRate = 'Hourly rate is required';
  } else if (isNaN(parseFloat(data.HourlyRate)) || parseFloat(data.HourlyRate) < 0) {
    errors.HourlyRate = 'Enter a valid hourly rate';
  }

  if (data.Phone && !isValidPhone(data.Phone)) {
    errors.Phone = 'Enter a valid 10-digit phone number';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateAttendance(data) {
  const errors = {};
  const status = (data.AttendanceStatus || '').toLowerCase();

  if (!data.WorkerID) errors.WorkerID = 'Select a worker';
  if (!data.Date) errors.Date = 'Date is required';

  if (status === 'overtime') {
    if (!data.TimeIn) errors.TimeIn = 'Time in is required';
    if (!data.TimeOut) errors.TimeOut = 'Time out is required';
  }

  if (status === 'present' && data.TimeIn && !data.TimeOut) {
    errors.TimeOut = 'Time out is required when time in is set';
  }

  if (data.TimeCut && (isNaN(parseInt(data.TimeCut)) || parseInt(data.TimeCut) < 0)) {
    errors.TimeCut = 'Time cut must be a positive number';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function isValidPhone(phone) {
  const cleaned = String(phone).replace(/\D/g, '');
  return /^\d{10}$/.test(cleaned);
}

export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
