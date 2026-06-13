/** AM/PM scroll-wheel time picker — stores value as HH:mm (24h) in hidden input */

export function renderTimePicker(name, value24 = '08:00', label = 'Time') {
  const { hour12, minute, ampm } = to12Hour(value24);
  const id = `tp_${name}_${Math.random().toString(36).slice(2, 7)}`;

  return `
    <div class="time-picker-wrap" data-time-picker="${name}">
      <label>${label}</label>
      <input type="hidden" name="${name}" value="${value24}">
      <div class="time-picker">
        <div class="time-wheel-col">
          <div class="time-wheel" data-part="hour" tabindex="0">${buildWheelOptions(
            Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
            hour12
          )}</div>
        </div>
        <span class="time-sep">:</span>
        <div class="time-wheel-col">
          <div class="time-wheel" data-part="minute" tabindex="0">${buildWheelOptions(
            Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')),
            minute
          )}</div>
        </div>
        <div class="time-wheel-col ampm-col">
          <div class="time-wheel" data-part="ampm" tabindex="0">${buildWheelOptions(['AM', 'PM'], ampm)}</div>
        </div>
      </div>
      <div class="time-display" id="${id}">${format12Display(hour12, minute, ampm)}</div>
    </div>
  `;
}

function buildWheelOptions(items, selected) {
  return items.map(item =>
    `<div class="time-wheel-item${item === selected ? ' selected' : ''}" data-value="${item}">${item}</div>`
  ).join('');
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

function format12Display(hour12, minute, ampm) {
  return `${parseInt(hour12, 10)}:${minute} ${ampm}`;
}

export function initTimePickers(container) {
  container.querySelectorAll('[data-time-picker]').forEach(wrap => {
    const hidden = wrap.querySelector('input[type="hidden"]');
    const display = wrap.querySelector('.time-display');

    const sync = () => {
      const hour = wrap.querySelector('[data-part="hour"] .selected')?.dataset.value || '08';
      const minute = wrap.querySelector('[data-part="minute"] .selected')?.dataset.value || '00';
      const ampm = wrap.querySelector('[data-part="ampm"] .selected')?.dataset.value || 'AM';
      hidden.value = to24Hour(hour, minute, ampm);
      if (display) display.textContent = format12Display(hour, minute, ampm);
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };

    wrap.querySelectorAll('.time-wheel').forEach(wheel => {
      wheel.addEventListener('click', (e) => {
        const item = e.target.closest('.time-wheel-item');
        if (!item) return;
        wheel.querySelectorAll('.time-wheel-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        item.scrollIntoView({ block: 'center', behavior: 'smooth' });
        sync();
      });

      wheel.addEventListener('scroll', () => {
        const items = wheel.querySelectorAll('.time-wheel-item');
        let closest = null;
        let closestDist = Infinity;
        const center = wheel.scrollTop + wheel.clientHeight / 2;
        items.forEach(item => {
          const itemCenter = item.offsetTop + item.offsetHeight / 2;
          const dist = Math.abs(center - itemCenter);
          if (dist < closestDist) {
            closestDist = dist;
            closest = item;
          }
        });
        if (closest) {
          items.forEach(el => el.classList.remove('selected'));
          closest.classList.add('selected');
          sync();
        }
      }, { passive: true });

      const selected = wheel.querySelector('.selected');
      if (selected) {
        requestAnimationFrame(() => selected.scrollIntoView({ block: 'center' }));
      }
    });
  });
}

export function getTimePickerValue(form, name) {
  return form.querySelector(`input[name="${name}"]`)?.value || '';
}
