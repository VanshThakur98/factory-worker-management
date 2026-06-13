/** Simple AM/PM time picker — stores value as HH:mm (24h) in hidden input */

export function renderTimePicker(name, value24 = '08:00', label = 'Time') {
  const { hour12, minute, ampm } = to12Hour(value24);
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  return `
    <div class="form-group time-picker-wrap" data-time-picker="${name}">
      <label>${label}</label>
      <input type="hidden" name="${name}" value="${value24}">
      <div class="time-picker-simple">
        <select class="form-control time-select" data-part="hour" aria-label="${label} hour">
          ${hours.map(h => `<option value="${h}"${h === hour12 ? ' selected' : ''}>${parseInt(h, 10)}</option>`).join('')}
        </select>
        <span class="time-sep">:</span>
        <select class="form-control time-select" data-part="minute" aria-label="${label} minute">
          ${minutes.map(m => `<option value="${m}"${m === minute ? ' selected' : ''}>${m}</option>`).join('')}
        </select>
        <select class="form-control time-select ampm-select" data-part="ampm" aria-label="${label} AM/PM">
          <option value="AM"${ampm === 'AM' ? ' selected' : ''}>AM</option>
          <option value="PM"${ampm === 'PM' ? ' selected' : ''}>PM</option>
        </select>
      </div>
    </div>`;
}

function to12Hour(value24) {
  const [hStr, mStr] = String(value24 || '08:00').split(':');
  let h = parseInt(hStr, 10) || 0;
  const minute = String(parseInt(mStr, 10) || 0).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { hour12: String(h).padStart(2, '0'), minute, ampm };
}

function to24Hour(hour12, minute, ampm) {
  let h = parseInt(hour12, 10) || 12;
  if (ampm === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return `${String(h).padStart(2, '0')}:${minute}`;
}

export function initTimePickers(container) {
  container.querySelectorAll('[data-time-picker]').forEach(wrap => {
    const hidden = wrap.querySelector('input[type="hidden"]');

    const sync = () => {
      const hour = wrap.querySelector('[data-part="hour"]')?.value || '08';
      const minute = wrap.querySelector('[data-part="minute"]')?.value || '00';
      const ampm = wrap.querySelector('[data-part="ampm"]')?.value || 'AM';
      hidden.value = to24Hour(hour, minute, ampm);
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };

    wrap.querySelectorAll('.time-select').forEach(sel => {
      sel.addEventListener('change', sync);
    });
  });
}

export function getTimePickerValue(form, name) {
  return form.querySelector(`input[name="${name}"]`)?.value || '';
}
