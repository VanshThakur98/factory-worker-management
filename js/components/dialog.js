export function showDialog({ title, content, footer, onClose }) {
  const container = document.getElementById('dialogContainer');

  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="dialog-header">
        <h2>${title}</h2>
        <button class="icon-btn dialog-close" aria-label="Close">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="dialog-body">${content}</div>
      ${footer ? `<div class="dialog-footer">${footer}</div>` : ''}
    </div>
  `;

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      if (onClose) onClose();
    }, 200);
  };

  overlay.querySelector('.dialog-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  container.appendChild(overlay);
  return { close, element: overlay };
}

export function getFormData(form) {
  const data = {};
  const elements = form.querySelectorAll('input, select, textarea');
  elements.forEach(el => {
    if (el.name) {
      data[el.name] = el.type === 'number' ? el.value : el.value;
    }
  });
  return data;
}

export function showFormErrors(form, errors) {
  form.querySelectorAll('.form-error').forEach(el => el.remove());
  form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));

  Object.entries(errors).forEach(([field, message]) => {
    const input = form.querySelector(`[name="${field}"]`);
    if (input) {
      input.classList.add('error');
      const error = document.createElement('div');
      error.className = 'form-error';
      error.textContent = message;
      input.parentNode.appendChild(error);
    }
  });
}
