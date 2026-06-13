import { formatDate, getDaysInMonth } from '../utils/helpers.js';

export function renderCalendar(container, year, month, attendanceMap, onDateClick) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month);
  const today = formatDate(new Date());
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let html = '<div class="calendar-grid">';
  dayLabels.forEach(d => {
    html += `<div class="calendar-day-label">${d}</div>`;
  });

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day other-month"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const record = attendanceMap[dateStr];
    let statusClass = '';

    if (record) {
      const status = (record.status || '').toLowerCase();
      if (status === 'overtime') {
        statusClass = 'overtime';
      } else if (status === 'present' || status === 'half day') {
        statusClass = record.overtime > 0 ? 'overtime' : 'present';
      } else if (status === 'absent') {
        statusClass = 'absent';
      } else if (status === 'leave') {
        statusClass = 'absent';
      }
    }

    const isToday = dateStr === today ? 'today' : '';
    html += `<div class="calendar-day ${statusClass} ${isToday}" data-date="${dateStr}">${day}</div>`;
  }

  html += '</div>';

  html += `
    <div class="calendar-legend">
      <div class="legend-item"><span class="legend-dot" style="background:var(--color-present)"></span> Present</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--color-absent)"></span> Absent</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--color-overtime)"></span> Overtime</div>
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.calendar-day[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      if (onDateClick) onDateClick(el.dataset.date);
    });
  });
}

export function buildAttendanceMap(records) {
  const map = {};
  records.forEach(r => {
    const date = String(r.Date || '').substring(0, 10);
    if (!date) return;
    if (!map[date]) {
      map[date] = { status: r.AttendanceStatus, overtime: 0, records: [] };
    }
    map[date].records.push(r);
    if (parseFloat(r.OvertimeHours) > 0) {
      map[date].overtime = parseFloat(r.OvertimeHours);
      map[date].status = r.AttendanceStatus;
    }
  });
  return map;
}
