import { formatDisplayDate, formatCurrency, getMonthName } from '../utils/helpers.js';
import { Storage } from './storage.js';

export function exportToExcel(data, sheetName, filename) {
  if (!window.XLSX) {
    throw new Error('SheetJS library not loaded');
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportWorkers(workers) {
  const rows = workers.map(w => ({
    'Name': w.WorkerName,
    'Phone': w.Phone,
    'Address': w.Address,
    'Pay Rate': w.HourlyRate,
    'Rate Type': w.RateType || 'hour',
    'Join Date': w.JoinDate,
    'Status': w.Status
  }));
  exportToExcel(rows, 'Workers', `workers_${Date.now()}`);
}

export function exportAttendance(records) {
  const rows = records.map(a => ({
    'Worker': a.WorkerName,
    'Date': a.Date,
    'Time In': a.TimeIn,
    'Time Out': a.TimeOut,
    'Time Cut (min)': a.TimeCut,
    'Worked Hours': a.WorkedHours,
    'Regular Hours': a.RegularHours,
    'Overtime Hours': a.OvertimeHours,
    'Status': a.AttendanceStatus
  }));
  exportToExcel(rows, 'Attendance', `attendance_${Date.now()}`);
}

export function exportPayroll(records) {
  const rows = records.map(p => ({
    'Worker': p.WorkerName,
    'Normal Hours': p.RegularHours ?? p.TotalHours,
    'Overtime Hours': p.OvertimeHours,
    'Normal Pay': p.RegularPay,
    'Overtime Pay': p.OvertimePay,
    'Total Pay': p.TotalPay,
    'Rate': p.HourlyRate,
    'Rate Type': p.RateType || 'hour'
  }));
  exportToExcel(rows, 'Payroll', `payroll_${Date.now()}`);
}

export function generatePDF(options) {
  if (!window.jspdf) {
    throw new Error('jsPDF library not loaded');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const settings = Storage.getSettings();
  const companyName = settings.companyName || 'Factory Worker Management';
  const currency = settings.currency || 'INR';

  let y = 20;

  doc.setFontSize(18);
  doc.text(companyName, 14, y);
  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(options.title || 'Report', 14, y);
  y += 8;

  if (options.dateRange) {
    doc.setFontSize(10);
    doc.text(`Period: ${options.dateRange}`, 14, y);
    y += 10;
  }

  doc.setTextColor(0);

  if (options.summary) {
    doc.setFontSize(10);
    Object.entries(options.summary).forEach(([key, value]) => {
      doc.text(`${key}: ${value}`, 14, y);
      y += 6;
    });
    y += 6;
  }

  if (options.columns && options.rows) {
    doc.autoTable({
      startY: y,
      head: [options.columns],
      body: options.rows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [26, 115, 232] },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  const pageHeight = doc.internal.pageSize.height;
  const sigY = Math.max(y + 20, pageHeight - 40);

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Generated: ' + new Date().toLocaleString(), 14, sigY);
  doc.text('Manager Signature: _______________________', 14, sigY + 15);
  doc.text('Date: _______________________', 14, sigY + 25);

  doc.save(`${options.filename || 'report'}.pdf`);
}

export function exportAttendancePDF(records, dateRange) {
  const settings = Storage.getSettings();
  const present = records.filter(r => (r.AttendanceStatus || '').toLowerCase() === 'present').length;
  const absent = records.filter(r => (r.AttendanceStatus || '').toLowerCase() === 'absent').length;

  generatePDF({
    title: 'Attendance Report',
    dateRange,
    filename: `attendance_report_${Date.now()}`,
    summary: {
      'Total Records': records.length,
      'Present': present,
      'Absent': absent
    },
    columns: ['Worker', 'Date', 'In', 'Out', 'Hours', 'OT', 'Status'],
    rows: records.map(r => [
      r.WorkerName,
      formatDisplayDate(r.Date),
      r.TimeIn || '-',
      r.TimeOut || '-',
      r.WorkedHours,
      r.OvertimeHours,
      r.AttendanceStatus
    ])
  });
}

export function exportPayrollPDF(records, month) {
  const settings = Storage.getSettings();
  const currency = settings.currency || 'INR';
  const total = records.reduce((sum, r) => sum + (parseFloat(r.TotalPay) || 0), 0);

  generatePDF({
    title: 'Payroll Report',
    dateRange: /^\d{4}-\d{2}$/.test(month) ? getMonthName(month) : month,
    filename: `payroll_report_${month}`,
    summary: {
      'Workers': records.length,
      'Total Payroll': formatCurrency(total, currency)
    },
    columns: ['Worker', 'Normal Hrs', 'OT Hrs', 'Rate', 'Normal Pay', 'OT Pay', 'Total'],
    rows: records.map(r => [
      r.WorkerName,
      r.RegularHours ?? r.TotalHours,
      r.OvertimeHours,
      formatCurrency(r.HourlyRate, currency),
      formatCurrency(r.RegularPay, currency),
      formatCurrency(r.OvertimePay, currency),
      formatCurrency(r.TotalPay, currency)
    ])
  });
}

export function exportMonthlyReportPDF(dashboardData, month) {
  const settings = Storage.getSettings();
  const currency = settings.currency || 'INR';

  generatePDF({
    title: 'Monthly Summary Report',
    dateRange: getMonthName(month),
    filename: `monthly_report_${month}`,
    summary: {
      'Total Workers': dashboardData.totalWorkers,
      'Present Today': dashboardData.presentToday,
      'Monthly Payroll': formatCurrency(dashboardData.monthlyPayrollCost, currency),
      'Hours Today': dashboardData.totalHoursToday,
      'OT Hours Today': dashboardData.overtimeHoursToday
    },
    columns: ['Metric', 'Value'],
    rows: [
      ['Active Workers', dashboardData.activeWorkers],
      ['Absent Today', dashboardData.absentToday],
      ['Monthly Present', dashboardData.monthlyStats?.present || 0],
      ['Monthly Absent', dashboardData.monthlyStats?.absent || 0],
      ['Overtime Days', dashboardData.monthlyStats?.overtimeDays || 0]
    ]
  });
}
