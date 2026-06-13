/** Global and inline loading indicators */

let processingCount = 0;

export function showProcessing(message = 'Loading...') {
  processingCount++;
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  const text = overlay.querySelector('.loading-message');
  if (text) text.textContent = message;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-busy', 'true');
}

export function hideProcessing() {
  processingCount = Math.max(0, processingCount - 1);
  if (processingCount > 0) return;
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-busy', 'false');
}

export function renderInlineLoader(message = 'Loading...') {
  return `
    <div class="loader-inline" role="status" aria-live="polite">
      <div class="loader-spinner"></div>
      <span class="loader-text">${message}</span>
    </div>`;
}

export function renderProcessingBlock(message = 'Calculating...') {
  return `
    <div class="processing-block" role="status" aria-live="polite">
      <div class="processing-dots"><span></span><span></span><span></span></div>
      <span class="loader-text">${message}</span>
    </div>`;
}
