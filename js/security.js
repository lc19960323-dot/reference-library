/* js/security.js */

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function setSafeText(element, value) {
  element.textContent = String(value ?? '');
}

export function safeExternalUrl(rawUrl, allowedProtocols = ['https:', 'http:']) {
  try {
    const url = new URL(String(rawUrl), window.location.href);
    if (!allowedProtocols.includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function createElement(tag, options = {}) {
  const element = document.createElement(tag);

  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.type) element.type = options.type;
  if (options.id) element.id = options.id;
  if (options.name) element.name = options.name;

  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      if (value !== undefined && value !== null) {
        element.setAttribute(key, String(value));
      }
    }
  }

  return element;
}
