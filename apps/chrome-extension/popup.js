// Default API URL
const DEFAULT_API_URL = 'https://www.archivvve.com';

// DOM Elements
const urlPreview = document.getElementById('url-preview');
const notesInput = document.getElementById('notes');
const saveBtn = document.getElementById('save-btn');
const messageDiv = document.getElementById('message');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const apiUrlInput = document.getElementById('api-url');
const saveSettingsBtn = document.getElementById('save-settings');

let currentUrl = '';
let currentTitle = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings
  const settings = await chrome.storage.sync.get(['apiUrl']);
  apiUrlInput.value = settings.apiUrl || DEFAULT_API_URL;

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentUrl = tab.url;
    currentTitle = tab.title;
    urlPreview.textContent = currentUrl;
  }
});

// Save button click
saveBtn.addEventListener('click', async () => {
  if (!currentUrl) {
    showMessage('No URL to save', 'error');
    return;
  }

  // Validate URL
  if (currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://')) {
    showMessage('Cannot save browser internal pages', 'error');
    return;
  }

  setLoading(true);
  hideMessage();

  try {
    const settings = await chrome.storage.sync.get(['apiUrl']);
    const apiUrl = settings.apiUrl || DEFAULT_API_URL;
    const notes = notesInput.value.trim();

    const response = await fetch(`${apiUrl}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: currentUrl,
        notes: notes || undefined,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('Saved! Processing in background...', 'success');
      notesInput.value = '';

      // Close popup after short delay
      setTimeout(() => {
        window.close();
      }, 1500);
    } else if (response.status === 409) {
      showMessage('Already in your archive', 'info');
    } else {
      showMessage(data.error || 'Failed to save', 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    showMessage('Could not connect to server. Check settings.', 'error');
  } finally {
    setLoading(false);
  }
});

// Settings toggle
settingsToggle.addEventListener('click', () => {
  const isVisible = settingsPanel.style.display !== 'none';
  settingsPanel.style.display = isVisible ? 'none' : 'block';
});

// Save settings
saveSettingsBtn.addEventListener('click', async () => {
  const apiUrl = apiUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash

  if (!apiUrl) {
    showMessage('API URL is required', 'error');
    return;
  }

  await chrome.storage.sync.set({ apiUrl });
  showMessage('Settings saved', 'success');
  settingsPanel.style.display = 'none';
});

// Keyboard shortcut - Enter to save
notesInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.metaKey) {
    saveBtn.click();
  }
});

// Helper functions
function setLoading(loading) {
  saveBtn.disabled = loading;
  saveBtn.classList.toggle('loading', loading);
}

function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
}

function hideMessage() {
  messageDiv.className = 'message';
  messageDiv.textContent = '';
}
