const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const TOKEN_KEY = 'api_token';
const USER_KEY = 'api_user';

export function clearApiSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const trimmed = t.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Старый Bearer на login ломает отладку и мешает при битом токене в storage. */
function shouldAttachAuth(path) {
  try {
    const pathname = path.startsWith('http') ? new URL(path).pathname : path.split('?')[0];
    return !pathname.includes('/auth/login');
  } catch {
    return true;
  }
}

function buildUrl(path) {
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function parseApiError(response) {
  try {
    const payload = await response.json();
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      return payload.errors.join(', ');
    }
    if (typeof payload?.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }
  } catch {
    // ignore JSON parse errors and fallback to status text
  }
  return `API ${response.status}: ${response.statusText}`;
}

/**
 * Request to Rails API. In dev with Vite proxy, use paths like '/api/...'.
 * @param {string} path - Path (e.g. '/api/drones')
 * @param {RequestInit} [options] - fetch options (method, body, headers, etc.)
 * @returns {Promise<Response>}
 */
export function apiRequest(path, options = {}) {
  const url = buildUrl(path);
  const headers = { ...options.headers };
  const hasJsonBody = options.body != null && !(options.body instanceof FormData);
  if (hasJsonBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = shouldAttachAuth(url) ? getStoredToken() : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 10000;
  const hasCallerSignal = options.signal instanceof AbortSignal;

  // Abort fetch if Rails doesn't respond (prevents infinite "Подключение..." state).
  let controller;
  if (!hasCallerSignal) controller = new AbortController();
  const signal = hasCallerSignal ? options.signal : controller?.signal;

  let timeoutId;
  if (!hasCallerSignal) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  const fetchOptions = { ...options, headers, signal };
  return fetch(url, fetchOptions).finally(() => {
    if (!hasCallerSignal && timeoutId) clearTimeout(timeoutId);
  }).catch((err) => {
    if (err?.name === 'AbortError') {
      throw new Error(`Превышен таймаут запроса к API (${timeoutMs} мс): ${url}`);
    }
    throw err;
  });
}

async function handleJsonResponse(res, path) {
  if (!res.ok) {
    const detail = await parseApiError(res);
    if (res.status === 401 && shouldAttachAuth(path)) {
      clearApiSession();
      throw new Error(`Требуется авторизация или сессия устарела. ${detail} Обновите страницу.`);
    }
    throw new Error(detail);
  }
  return res.json();
}

/**
 * GET and parse JSON.
 * @param {string} path
 * @returns {Promise<unknown>}
 */
export async function apiGet(path) {
  const res = await apiRequest(path);
  return handleJsonResponse(res, path);
}

/**
 * POST with JSON body and parse JSON response.
 * @param {string} path
 * @param {object} body
 * @returns {Promise<unknown>}
 */
export async function apiPost(path, body) {
  const res = await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
  return handleJsonResponse(res, path);
}

/**
 * POST multipart (FormData). Не задавайте Content-Type вручную.
 * @param {string} path
 * @param {FormData} formData
 * @returns {Promise<unknown>}
 */
export async function apiPostForm(path, formData) {
  const res = await apiRequest(path, { method: 'POST', body: formData });
  return handleJsonResponse(res, path);
}

/**
 * PATCH multipart (FormData).
 * @param {string} path
 * @param {FormData} formData
 * @returns {Promise<unknown>}
 */
export async function apiPatchForm(path, formData) {
  const res = await apiRequest(path, { method: 'PATCH', body: formData });
  return handleJsonResponse(res, path);
}

/**
 * PATCH with JSON body and parse JSON response.
 * @param {string} path
 * @param {object} body
 * @returns {Promise<unknown>}
 */
export async function apiPatch(path, body) {
  const res = await apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) });
  return handleJsonResponse(res, path);
}

/**
 * DELETE request.
 * @param {string} path
 * @returns {Promise<void>}
 */
export async function apiDelete(path) {
  const res = await apiRequest(path);
  if (!res.ok) {
    const detail = await parseApiError(res);
    if (res.status === 401 && shouldAttachAuth(path)) {
      clearApiSession();
      throw new Error(`Требуется авторизация или сессия устарела. ${detail} Обновите страницу.`);
    }
    throw new Error(detail);
  }
}
