import { describe, it, expect, beforeEach } from 'vitest';
import {
  showLoading,
  hideLoading,
  showError,
  hideError,
  showSignalLost,
  hideSignalLost,
} from '../ui.js';

describe('ui.js', () => {
  let overlay;

  beforeEach(() => {
    // Reset the overlay container before each test
    overlay = document.getElementById('overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
  });

  // --- showLoading / hideLoading ---

  describe('showLoading', () => {
    it('creates and displays a loading element with the correct text', () => {
      showLoading('Locating you...');

      const indicator = overlay.querySelector('.loading-indicator');
      expect(indicator).not.toBeNull();

      const text = indicator.querySelector('.loading-text');
      expect(text).not.toBeNull();
      expect(text.textContent).toBe('Locating you...');
    });

    it('includes a spinner element', () => {
      showLoading('Please wait');

      const spinner = overlay.querySelector('.loading-indicator .spinner');
      expect(spinner).not.toBeNull();
      expect(spinner.getAttribute('role')).toBe('status');
      expect(spinner.getAttribute('aria-label')).toBe('Loading');
    });

    it('replaces any existing loading indicator when called again', () => {
      showLoading('First');
      showLoading('Second');

      const indicators = overlay.querySelectorAll('.loading-indicator');
      expect(indicators.length).toBe(1);
      expect(indicators[0].querySelector('.loading-text').textContent).toBe('Second');
    });
  });

  describe('hideLoading', () => {
    it('removes the loading element from the overlay', () => {
      showLoading('Locating you...');
      expect(overlay.querySelector('.loading-indicator')).not.toBeNull();

      hideLoading();
      expect(overlay.querySelector('.loading-indicator')).toBeNull();
    });

    it('does nothing when no loading element exists', () => {
      // Should not throw
      hideLoading();
      expect(overlay.children.length).toBe(0);
    });
  });

  // --- showError / hideError ---

  describe('showError', () => {
    it('displays an error message with the provided text', () => {
      showError('Permission denied');

      const errorEl = overlay.querySelector('.error-message');
      expect(errorEl).not.toBeNull();

      const errorText = errorEl.querySelector('.error-text');
      expect(errorText).not.toBeNull();
      expect(errorText.textContent).toBe('Permission denied');
    });

    it('sets role="alert" for accessibility', () => {
      showError('Something went wrong');

      const errorEl = overlay.querySelector('.error-message');
      expect(errorEl.getAttribute('role')).toBe('alert');
    });

    it('replaces any existing error message when called again', () => {
      showError('First error');
      showError('Second error');

      const errors = overlay.querySelectorAll('.error-message');
      expect(errors.length).toBe(1);
      expect(errors[0].querySelector('.error-text').textContent).toBe('Second error');
    });
  });

  describe('hideError', () => {
    it('removes the error message from the overlay', () => {
      showError('Oops');
      expect(overlay.querySelector('.error-message')).not.toBeNull();

      hideError();
      expect(overlay.querySelector('.error-message')).toBeNull();
    });

    it('does nothing when no error element exists', () => {
      hideError();
      expect(overlay.children.length).toBe(0);
    });
  });

  // --- showSignalLost / hideSignalLost ---

  describe('showSignalLost', () => {
    it('displays a signal-lost notification', () => {
      showSignalLost();

      const signalEl = overlay.querySelector('.signal-lost');
      expect(signalEl).not.toBeNull();
      expect(signalEl.textContent).toBe('Location signal lost');
    });

    it('sets role="status" for accessibility', () => {
      showSignalLost();

      const signalEl = overlay.querySelector('.signal-lost');
      expect(signalEl.getAttribute('role')).toBe('status');
    });

    it('replaces any existing signal-lost notification when called again', () => {
      showSignalLost();
      showSignalLost();

      const signals = overlay.querySelectorAll('.signal-lost');
      expect(signals.length).toBe(1);
    });
  });

  describe('hideSignalLost', () => {
    it('removes the signal-lost notification', () => {
      showSignalLost();
      expect(overlay.querySelector('.signal-lost')).not.toBeNull();

      hideSignalLost();
      expect(overlay.querySelector('.signal-lost')).toBeNull();
    });

    it('does nothing when no signal-lost element exists', () => {
      hideSignalLost();
      expect(overlay.children.length).toBe(0);
    });
  });

  // --- Coexistence ---

  describe('overlay coexistence', () => {
    it('allows loading, error, and signal-lost elements to coexist', () => {
      showLoading('Loading...');
      showError('An error occurred');
      showSignalLost();

      expect(overlay.querySelector('.loading-indicator')).not.toBeNull();
      expect(overlay.querySelector('.error-message')).not.toBeNull();
      expect(overlay.querySelector('.signal-lost')).not.toBeNull();
    });

    it('removing one element does not affect others', () => {
      showLoading('Loading...');
      showError('An error occurred');
      showSignalLost();

      hideLoading();
      expect(overlay.querySelector('.loading-indicator')).toBeNull();
      expect(overlay.querySelector('.error-message')).not.toBeNull();
      expect(overlay.querySelector('.signal-lost')).not.toBeNull();
    });
  });
});
