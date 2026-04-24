import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to dynamically import the module for tests that depend on module-level
// state (showConnectionStatus, updateNearbyCount) since they cache DOM references.
// For other functions that don't rely on module-level caching, static import is fine.

describe('proximity-ui.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function loadModule() {
    return await import('../proximity-ui.js');
  }

  // --- showDisplayNamePrompt ---

  describe('showDisplayNamePrompt', () => {
    it('creates a modal overlay with input and submit button', async () => {
      const { showDisplayNamePrompt } = await loadModule();
      const onSubmit = vi.fn();
      showDisplayNamePrompt(onSubmit);

      const overlay = document.querySelector('.proximity-name-prompt');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('role')).toBe('dialog');

      const input = overlay.querySelector('.proximity-name-input');
      expect(input).not.toBeNull();
      expect(input.type).toBe('text');

      const submitBtn = overlay.querySelector('.proximity-name-submit');
      expect(submitBtn).not.toBeNull();
      expect(submitBtn.textContent).toBe('Submit');
    });

    it('calls onSubmit with valid name and removes modal', async () => {
      const { showDisplayNamePrompt } = await loadModule();
      const onSubmit = vi.fn();
      showDisplayNamePrompt(onSubmit);

      const input = document.querySelector('.proximity-name-input');
      const submitBtn = document.querySelector('.proximity-name-submit');

      input.value = 'Alice';
      submitBtn.click();

      expect(onSubmit).toHaveBeenCalledWith('Alice');
      expect(document.querySelector('.proximity-name-prompt')).toBeNull();
    });

    it('shows error feedback for invalid name (too short)', async () => {
      const { showDisplayNamePrompt } = await loadModule();
      const onSubmit = vi.fn();
      showDisplayNamePrompt(onSubmit);

      const input = document.querySelector('.proximity-name-input');
      const submitBtn = document.querySelector('.proximity-name-submit');

      input.value = 'A';
      submitBtn.click();

      expect(onSubmit).not.toHaveBeenCalled();
      const feedback = document.querySelector('.proximity-name-feedback');
      expect(feedback.textContent).not.toBe('');
      expect(feedback.classList.contains('proximity-name-feedback-error')).toBe(true);
      // Modal should still be present
      expect(document.querySelector('.proximity-name-prompt')).not.toBeNull();
    });

    it('shows error feedback for invalid characters', async () => {
      const { showDisplayNamePrompt } = await loadModule();
      const onSubmit = vi.fn();
      showDisplayNamePrompt(onSubmit);

      const input = document.querySelector('.proximity-name-input');
      const submitBtn = document.querySelector('.proximity-name-submit');

      input.value = 'Al!ce@#';
      submitBtn.click();

      expect(onSubmit).not.toHaveBeenCalled();
      const feedback = document.querySelector('.proximity-name-feedback');
      expect(feedback.textContent).not.toBe('');
    });

    it('submits on Enter key press with valid name', async () => {
      const { showDisplayNamePrompt } = await loadModule();
      const onSubmit = vi.fn();
      showDisplayNamePrompt(onSubmit);

      const input = document.querySelector('.proximity-name-input');
      input.value = 'Bob';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSubmit).toHaveBeenCalledWith('Bob');
      expect(document.querySelector('.proximity-name-prompt')).toBeNull();
    });

    it('removes existing prompt before creating a new one', async () => {
      const { showDisplayNamePrompt } = await loadModule();
      const onSubmit = vi.fn();
      showDisplayNamePrompt(onSubmit);
      showDisplayNamePrompt(onSubmit);

      const prompts = document.querySelectorAll('.proximity-name-prompt');
      expect(prompts.length).toBe(1);
    });
  });

  // --- createVisibilityToggle ---

  describe('createVisibilityToggle', () => {
    it('creates a toggle button with initial hidden state', async () => {
      const { createVisibilityToggle } = await loadModule();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const onChange = vi.fn();

      createVisibilityToggle(container, onChange);

      const toggle = container.querySelector('.proximity-visibility-toggle');
      expect(toggle).not.toBeNull();
      expect(toggle.dataset.visible).toBe('false');
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
    });

    it('toggles state on click and calls onChange', async () => {
      const { createVisibilityToggle } = await loadModule();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const onChange = vi.fn();

      createVisibilityToggle(container, onChange);

      const toggle = container.querySelector('.proximity-visibility-toggle');

      // Click to become visible
      toggle.click();
      expect(onChange).toHaveBeenCalledWith(true);
      expect(toggle.dataset.visible).toBe('true');

      // Click to become hidden again
      toggle.click();
      expect(onChange).toHaveBeenCalledWith(false);
      expect(toggle.dataset.visible).toBe('false');
    });

    it('has hidden visual class initially', async () => {
      const { createVisibilityToggle } = await loadModule();
      const container = document.createElement('div');
      document.body.appendChild(container);

      createVisibilityToggle(container, vi.fn());

      const toggle = container.querySelector('.proximity-visibility-toggle');
      expect(toggle.classList.contains('proximity-toggle-hidden')).toBe(true);
      expect(toggle.classList.contains('proximity-toggle-visible')).toBe(false);
    });
  });

  // --- setToggleState ---

  describe('setToggleState', () => {
    it('updates toggle visual state to visible', async () => {
      const { createVisibilityToggle, setToggleState } = await loadModule();
      const container = document.createElement('div');
      document.body.appendChild(container);

      createVisibilityToggle(container, vi.fn());
      setToggleState(true);

      const toggle = container.querySelector('.proximity-visibility-toggle');
      expect(toggle.dataset.visible).toBe('true');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(toggle.classList.contains('proximity-toggle-visible')).toBe(true);
      expect(toggle.classList.contains('proximity-toggle-hidden')).toBe(false);
    });

    it('updates toggle visual state to hidden', async () => {
      const { createVisibilityToggle, setToggleState } = await loadModule();
      const container = document.createElement('div');
      document.body.appendChild(container);

      createVisibilityToggle(container, vi.fn());
      setToggleState(true);
      setToggleState(false);

      const toggle = container.querySelector('.proximity-visibility-toggle');
      expect(toggle.dataset.visible).toBe('false');
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect(toggle.classList.contains('proximity-toggle-hidden')).toBe(true);
      expect(toggle.classList.contains('proximity-toggle-visible')).toBe(false);
    });
  });

  // --- showConnectionStatus ---

  describe('showConnectionStatus', () => {
    it('creates a status element on first call', async () => {
      const { showConnectionStatus } = await loadModule();
      showConnectionStatus('connecting');

      const status = document.querySelector('.proximity-connection-status');
      expect(status).not.toBeNull();
      expect(status.getAttribute('role')).toBe('status');
    });

    it('shows "Connecting…" for connecting status', async () => {
      const { showConnectionStatus } = await loadModule();
      showConnectionStatus('connecting');

      const status = document.querySelector('.proximity-connection-status');
      expect(status.textContent).toBe('Connecting…');
      expect(status.dataset.status).toBe('connecting');
      expect(status.classList.contains('proximity-status-connecting')).toBe(true);
    });

    it('shows "Connected" for connected status', async () => {
      const { showConnectionStatus } = await loadModule();
      showConnectionStatus('connected');

      const status = document.querySelector('.proximity-connection-status');
      expect(status.textContent).toBe('Connected');
      expect(status.dataset.status).toBe('connected');
      expect(status.classList.contains('proximity-status-connected')).toBe(true);
    });

    it('shows "Reconnecting…" for reconnecting status', async () => {
      const { showConnectionStatus } = await loadModule();
      showConnectionStatus('reconnecting');

      const status = document.querySelector('.proximity-connection-status');
      expect(status.textContent).toBe('Reconnecting…');
      expect(status.dataset.status).toBe('reconnecting');
      expect(status.classList.contains('proximity-status-reconnecting')).toBe(true);
    });

    it('shows "Disconnected" for disconnected status', async () => {
      const { showConnectionStatus } = await loadModule();
      showConnectionStatus('disconnected');

      const status = document.querySelector('.proximity-connection-status');
      expect(status.textContent).toBe('Disconnected');
      expect(status.dataset.status).toBe('disconnected');
      expect(status.classList.contains('proximity-status-disconnected')).toBe(true);
    });

    it('reuses the same element and updates status class on subsequent calls', async () => {
      const { showConnectionStatus } = await loadModule();
      showConnectionStatus('connecting');
      showConnectionStatus('connected');

      const elements = document.querySelectorAll('.proximity-connection-status');
      expect(elements.length).toBe(1);

      const status = elements[0];
      expect(status.textContent).toBe('Connected');
      expect(status.classList.contains('proximity-status-connected')).toBe(true);
      expect(status.classList.contains('proximity-status-connecting')).toBe(false);
    });
  });

  // --- updateNearbyCount ---

  describe('updateNearbyCount', () => {
    it('creates a badge element on first call', async () => {
      const { updateNearbyCount } = await loadModule();
      updateNearbyCount(3);

      const badge = document.querySelector('.proximity-nearby-count');
      expect(badge).not.toBeNull();
      expect(badge.getAttribute('role')).toBe('status');
    });

    it('displays correct text and data-count for a given count', async () => {
      const { updateNearbyCount } = await loadModule();
      updateNearbyCount(5);

      const badge = document.querySelector('.proximity-nearby-count');
      expect(badge.textContent).toBe('5 nearby');
      expect(badge.dataset.count).toBe('5');
      expect(badge.getAttribute('aria-label')).toBe('5 nearby users');
    });

    it('updates correctly when count changes', async () => {
      const { updateNearbyCount } = await loadModule();
      updateNearbyCount(2);
      updateNearbyCount(7);

      const badges = document.querySelectorAll('.proximity-nearby-count');
      expect(badges.length).toBe(1);

      expect(badges[0].textContent).toBe('7 nearby');
      expect(badges[0].dataset.count).toBe('7');
    });

    it('displays zero count correctly', async () => {
      const { updateNearbyCount } = await loadModule();
      updateNearbyCount(0);

      const badge = document.querySelector('.proximity-nearby-count');
      expect(badge.textContent).toBe('0 nearby');
      expect(badge.dataset.count).toBe('0');
    });
  });

  // --- showPrivacyNotice ---

  describe('showPrivacyNotice', () => {
    it('creates a privacy notice modal', async () => {
      const { showPrivacyNotice } = await loadModule();
      showPrivacyNotice();

      const overlay = document.querySelector('.proximity-privacy-notice');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('role')).toBe('dialog');

      const title = overlay.querySelector('.proximity-privacy-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toBe('Privacy Notice');
    });

    it('contains privacy content text', async () => {
      const { showPrivacyNotice } = await loadModule();
      showPrivacyNotice();

      const content = document.querySelector('.proximity-privacy-content');
      expect(content).not.toBeNull();
      expect(content.textContent.length).toBeGreaterThan(0);
    });

    it('dismisses when dismiss button is clicked', async () => {
      const { showPrivacyNotice } = await loadModule();
      showPrivacyNotice();

      const dismissBtn = document.querySelector('.proximity-privacy-dismiss');
      expect(dismissBtn).not.toBeNull();

      dismissBtn.click();

      expect(document.querySelector('.proximity-privacy-notice')).toBeNull();
    });

    it('removes existing notice before creating a new one', async () => {
      const { showPrivacyNotice } = await loadModule();
      showPrivacyNotice();
      showPrivacyNotice();

      const notices = document.querySelectorAll('.proximity-privacy-notice');
      expect(notices.length).toBe(1);
    });
  });

  // --- createSettingsButton ---

  describe('createSettingsButton', () => {
    it('creates a settings gear button in the container', async () => {
      const { createSettingsButton } = await loadModule();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const onChangeName = vi.fn();

      createSettingsButton(container, onChangeName);

      const btn = container.querySelector('.proximity-settings-button');
      expect(btn).not.toBeNull();
      expect(btn.getAttribute('aria-label')).toBe('Proximity settings');
      expect(btn.textContent).toBe('⚙');
    });

    it('shows display name prompt when clicked', async () => {
      const { createSettingsButton } = await loadModule();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const onChangeName = vi.fn();

      createSettingsButton(container, onChangeName);

      const btn = container.querySelector('.proximity-settings-button');
      btn.click();

      const prompt = document.querySelector('.proximity-name-prompt');
      expect(prompt).not.toBeNull();
    });
  });
});
