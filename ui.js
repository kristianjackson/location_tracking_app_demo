/**
 * UI Overlay Module
 * Manages loading indicator, error messages, and signal-lost notification
 * displayed in the #overlay container.
 */

function getOverlay() {
  return document.getElementById('overlay');
}

/**
 * Display a loading indicator with the provided message text.
 * @param {string} message - Text to show below the spinner
 */
export function showLoading(message) {
  hideLoading();
  const el = document.createElement('div');
  el.className = 'loading-indicator';
  el.innerHTML = `
    <div class="spinner" role="status" aria-label="Loading"></div>
    <span class="loading-text">${message}</span>
  `;
  getOverlay().appendChild(el);
}

/**
 * Remove the loading indicator from the overlay.
 */
export function hideLoading() {
  const el = getOverlay().querySelector('.loading-indicator');
  if (el) {
    el.remove();
  }
}

/**
 * Display an error message overlay.
 * @param {string} message - The error text to show
 */
export function showError(message) {
  hideError();
  const el = document.createElement('div');
  el.className = 'error-message';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="error-icon" aria-hidden="true">⚠️</div>
    <p class="error-text">${message}</p>
  `;
  getOverlay().appendChild(el);
}

/**
 * Remove the error message from the overlay.
 */
export function hideError() {
  const el = getOverlay().querySelector('.error-message');
  if (el) {
    el.remove();
  }
}

/**
 * Display a signal-lost notification banner.
 */
export function showSignalLost() {
  hideSignalLost();
  const el = document.createElement('div');
  el.className = 'signal-lost';
  el.setAttribute('role', 'status');
  el.textContent = 'Location signal lost';
  getOverlay().appendChild(el);
}

/**
 * Remove the signal-lost notification.
 */
export function hideSignalLost() {
  const el = getOverlay().querySelector('.signal-lost');
  if (el) {
    el.remove();
  }
}
