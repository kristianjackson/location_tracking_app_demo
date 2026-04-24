/**
 * Proximity UI Module
 * Manages the visibility toggle, display name prompt/settings,
 * connection status indicator, nearby user count badge, and privacy notice.
 */

import { validateDisplayName } from './session.js';

// Module-level references for elements that persist across calls
let toggleButton = null;
let statusElement = null;
let countBadge = null;

/**
 * Show a modal overlay prompting the user to enter a display name.
 * Validates input using session.js validateDisplayName.
 * Calls onSubmit(name) when a valid name is submitted, then removes the modal.
 * @param {function} onSubmit - Callback receiving the validated display name
 */
export function showDisplayNamePrompt(onSubmit) {
  // Remove any existing prompt
  const existing = document.querySelector('.proximity-name-prompt');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'proximity-name-prompt';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Enter display name');

  const dialog = document.createElement('div');
  dialog.className = 'proximity-name-dialog';

  const title = document.createElement('h2');
  title.className = 'proximity-name-title';
  title.textContent = 'Choose a Display Name';

  const description = document.createElement('p');
  description.className = 'proximity-name-description';
  description.textContent = '2–20 characters: letters, numbers, spaces, hyphens, underscores.';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'proximity-name-input';
  input.placeholder = 'Enter your name';
  input.maxLength = 20;
  input.setAttribute('aria-label', 'Display name');

  const feedback = document.createElement('p');
  feedback.className = 'proximity-name-feedback';
  feedback.setAttribute('role', 'alert');
  feedback.setAttribute('aria-live', 'polite');
  feedback.textContent = '';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'proximity-name-submit';
  submitBtn.textContent = 'Submit';

  function handleSubmit() {
    const name = input.value.trim();
    const result = validateDisplayName(name);
    if (!result.valid) {
      feedback.textContent = result.error;
      feedback.classList.add('proximity-name-feedback-error');
      return;
    }
    feedback.textContent = '';
    feedback.classList.remove('proximity-name-feedback-error');
    overlay.remove();
    onSubmit(name);
  }

  submitBtn.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });

  dialog.appendChild(title);
  dialog.appendChild(description);
  dialog.appendChild(input);
  dialog.appendChild(feedback);
  dialog.appendChild(submitBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  input.focus();
}

/**
 * Create a visibility toggle button and append it to the given container.
 * Defaults to hidden (off). Uses distinct visual states for visible/hidden.
 * Calls onChange(visible) when toggled.
 * @param {HTMLElement} container - DOM element to append the toggle to
 * @param {function} onChange - Callback receiving the new visibility boolean
 */
export function createVisibilityToggle(container, onChange) {
  toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'proximity-visibility-toggle';
  toggleButton.setAttribute('aria-label', 'Toggle visibility');
  toggleButton.setAttribute('aria-pressed', 'false');
  toggleButton.dataset.visible = 'false';

  // Set initial hidden state
  updateToggleVisual(false);

  toggleButton.addEventListener('click', () => {
    const isVisible = toggleButton.dataset.visible === 'true';
    const newState = !isVisible;
    setToggleState(newState);
    onChange(newState);
  });

  container.appendChild(toggleButton);
}

/**
 * Update the toggle's visual state programmatically.
 * Used for restoring state from localStorage.
 * @param {boolean} visible - Whether the user is visible
 */
export function setToggleState(visible) {
  if (!toggleButton) return;
  toggleButton.dataset.visible = String(visible);
  toggleButton.setAttribute('aria-pressed', String(visible));
  updateToggleVisual(visible);
}

/**
 * Internal helper to update toggle button content and styling.
 * @param {boolean} visible
 */
function updateToggleVisual(visible) {
  if (!toggleButton) return;
  if (visible) {
    toggleButton.textContent = '👁';
    toggleButton.classList.add('proximity-toggle-visible');
    toggleButton.classList.remove('proximity-toggle-hidden');
    toggleButton.title = 'You are visible – click to hide';
  } else {
    toggleButton.textContent = '👁‍🗨';
    toggleButton.classList.add('proximity-toggle-hidden');
    toggleButton.classList.remove('proximity-toggle-visible');
    toggleButton.title = 'You are hidden – click to show';
  }
}

/**
 * Display or update a connection status indicator.
 * Status values: 'connecting', 'connected', 'reconnecting', 'disconnected'.
 * @param {string} status - One of the four status strings
 */
export function showConnectionStatus(status) {
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.className = 'proximity-connection-status';
    statusElement.setAttribute('role', 'status');
    statusElement.setAttribute('aria-live', 'polite');
    document.body.appendChild(statusElement);
  }

  // Remove all previous status classes
  statusElement.classList.remove(
    'proximity-status-connecting',
    'proximity-status-connected',
    'proximity-status-reconnecting',
    'proximity-status-disconnected'
  );

  const labels = {
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
    disconnected: 'Disconnected',
  };

  statusElement.textContent = labels[status] || status;
  statusElement.classList.add(`proximity-status-${status}`);
  statusElement.dataset.status = status;
}

/**
 * Update the nearby user count badge.
 * Creates the badge element on first call.
 * @param {number} count - Number of nearby users
 */
export function updateNearbyCount(count) {
  if (!countBadge) {
    countBadge = document.createElement('div');
    countBadge.className = 'proximity-nearby-count';
    countBadge.setAttribute('role', 'status');
    countBadge.setAttribute('aria-live', 'polite');
    document.body.appendChild(countBadge);
  }

  countBadge.textContent = `${count} nearby`;
  countBadge.dataset.count = String(count);
  countBadge.setAttribute('aria-label', `${count} nearby users`);
}

/**
 * Display a privacy notice modal explaining what location data is shared
 * and how it is used. Includes a dismiss button.
 */
export function showPrivacyNotice() {
  // Remove any existing notice
  const existing = document.querySelector('.proximity-privacy-notice');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'proximity-privacy-notice';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Privacy notice');

  const dialog = document.createElement('div');
  dialog.className = 'proximity-privacy-dialog';

  const title = document.createElement('h2');
  title.className = 'proximity-privacy-title';
  title.textContent = 'Privacy Notice';

  const content = document.createElement('div');
  content.className = 'proximity-privacy-content';
  content.innerHTML =
    '<p>When visibility is turned on, your approximate location (latitude and longitude) ' +
    'is shared with nearby users within a 5 km radius.</p>' +
    '<p>Your location data is held in memory only and is never stored permanently. ' +
    'When you close the app or turn off visibility, your location is removed immediately.</p>' +
    '<p>Only your display name and position are shared — no other personal information is transmitted.</p>';

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'proximity-privacy-dismiss';
  dismissBtn.textContent = 'Got it';
  dismissBtn.addEventListener('click', () => {
    overlay.remove();
  });

  dialog.appendChild(title);
  dialog.appendChild(content);
  dialog.appendChild(dismissBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  dismissBtn.focus();
}

/**
 * Create a settings gear button for changing the display name.
 * When clicked, shows the display name prompt. Calls onChangeName(newName)
 * when a new name is submitted.
 * @param {HTMLElement} container - DOM element to append the button to
 * @param {function} onChangeName - Callback receiving the new display name
 */
export function createSettingsButton(container, onChangeName) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'proximity-settings-button';
  btn.setAttribute('aria-label', 'Proximity settings');
  btn.title = 'Change display name';
  btn.textContent = '⚙';

  btn.addEventListener('click', () => {
    showDisplayNamePrompt(onChangeName);
  });

  container.appendChild(btn);
}
