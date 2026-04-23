import { apiGet, apiPost, apiPatch, apiDelete, apiPostForm, apiPatchForm, clearApiSession } from './client';

const DEFAULT_DEV_EMAIL = import.meta.env.VITE_API_EMAIL ?? 'operator@drones.local';
const DEFAULT_DEV_PASSWORD = import.meta.env.VITE_API_PASSWORD ?? 'password123';
const DEFAULT_DEV_NAME = import.meta.env.VITE_API_NAME ?? 'Drone Operator';

function extractData(payload) {
  return payload?.data ?? payload;
}

async function login(email, password) {
  const result = await apiPost('/api/v1/auth/login', { email, password });
  const data = extractData(result);
  const token = typeof data?.token === 'string' ? data.token.trim() : data?.token;
  if (!token) {
    throw new Error('Backend не вернул JWT токен при авторизации');
  }
  localStorage.setItem('api_token', token);
  if (data.user) {
    localStorage.setItem('api_user', JSON.stringify(data.user));
  }
  return data;
}

/** Вход: POST /api/v1/auth/login → токен в localStorage. */
export async function loginWithCredentials(email, password) {
  return login(email.trim(), password);
}

/**
 * Регистрация: POST /api/v1/users (без JWT). Перед запросом сбрасываем старую сессию,
 * чтобы не отправлять лишний Bearer.
 */
export async function registerUser({ name, email, password, passwordConfirmation }) {
  clearApiSession();
  await apiPost('/api/v1/users', {
    user: {
      name: name.trim(),
      email: email.trim(),
      password,
      password_confirmation: passwordConfirmation,
    },
  });
}

async function registerDevUser(email, password, name) {
  return apiPost('/api/v1/users', {
    user: {
      name,
      email,
      password,
      password_confirmation: password,
    },
  });
}

/** Автовход dev-пользователя из Vite env (для скриптов / старых сценариев). */
export async function ensureApiSession() {
  const email = DEFAULT_DEV_EMAIL;
  const password = DEFAULT_DEV_PASSWORD;
  const name = DEFAULT_DEV_NAME;

  try {
    return await login(email, password);
  } catch {
    // Для первого запуска поднимаем dev-пользователя автоматически.
  }

  try {
    await registerDevUser(email, password, name);
  } catch (error) {
    const message = String(error?.message ?? '');
    if (!message.includes('уже используется')) {
      throw error;
    }
  }

  return login(email, password);
}

/** Сброс JWT в storage (например перед новым логином или из UI «Выйти»). */
export { clearApiSession };

export async function fetchDronesFromBackend() {
  const response = await apiGet('/api/v1/drones');
  const drones = extractData(response);
  return Array.isArray(drones) ? drones : [];
}

/** POST /api/v1/drones — создать дрона в БД. */
export async function createDroneInBackend({ name, model, battery = 100, status = 'idle' } = {}) {
  if (!name || !String(name).trim()) throw new Error('Укажите имя дрона');
  if (!model || !String(model).trim()) throw new Error('Укажите модель дрона');
  const response = await apiPost('/api/v1/drones', {
    drone: {
      name: String(name).trim(),
      model: String(model).trim(),
      battery,
      status,
    },
  });
  return extractData(response);
}

export async function fetchUsersFromBackend() {
  const response = await apiGet('/api/v1/users');
  const users = extractData(response);
  return Array.isArray(users) ? users : [];
}

export async function fetchZonesFromBackend() {
  const response = await apiGet('/api/v1/zones');
  const zones = extractData(response);
  return Array.isArray(zones) ? zones : [];
}

/** POST /api/v1/zones с KML → в ответе { data: zone }. */
export async function createZoneWithKml({ name, description = '', file }) {
  if (!file) {
    throw new Error('Выберите KML-файл');
  }
  const fd = new FormData();
  fd.append('zone[name]', name.trim());
  if (description) {
    fd.append('zone[description]', description);
  }
  fd.append('zone[kml_file]', file, file.name);
  const response = await apiPostForm('/api/v1/zones', fd);
  return extractData(response);
}

/** POST /api/v1/zones с JSON boundary [[lng, lat], ...] (замкнутый полигон). */
export async function createZoneWithBoundary({ name, description = '', boundary }) {
  if (!Array.isArray(boundary) || boundary.length < 4) {
    throw new Error('Некорректный контур зоны');
  }
  const zone = {
    name: name.trim(),
    boundary,
  };
  if (description) {
    zone.description = description;
  }
  const response = await apiPost('/api/v1/zones', { zone });
  return extractData(response);
}

/** PATCH /api/v1/zones/:id — новый контур из KML. */
export async function updateZoneWithKml(zoneId, file) {
  if (zoneId == null || !file) {
    throw new Error('Выберите зону и KML-файл');
  }
  const fd = new FormData();
  fd.append('zone[kml_file]', file, file.name);
  const response = await apiPatchForm(`/api/v1/zones/${zoneId}`, fd);
  return extractData(response);
}

/** PATCH /api/v1/zones/:id — обновить boundary [[lng, lat], ...]. */
export async function updateZoneWithBoundary(zoneId, boundary) {
  if (zoneId == null) {
    throw new Error('Выберите зону для редактирования');
  }
  if (!Array.isArray(boundary) || boundary.length < 4) {
    throw new Error('Некорректный контур зоны');
  }
  const response = await apiPatch(`/api/v1/zones/${zoneId}`, {
    zone: { boundary },
  });
  return extractData(response);
}

/** DELETE /api/v1/zones/:id — удалить зону. */
export async function deleteZoneInBackend(zoneId) {
  if (zoneId == null) {
    throw new Error('Выберите зону для удаления');
  }
  await apiDelete(`/api/v1/zones/${zoneId}`);
}

export async function syncDroneStateToBackend(droneId, dronePatch) {
  if (droneId == null) return null;
  const response = await apiPatch(`/api/v1/drones/${droneId}`, {
    drone: dronePatch,
  });
  return extractData(response);
}

export async function createMissionInBackend({ userId, zoneId, droneId, missionType = 'monitoring' }) {
  const response = await apiPost('/api/v1/missions', {
    mission: {
      user_id: userId,
      zone_id: zoneId,
      drone_id: droneId,
      mission_type: missionType,
    },
  });
  return extractData(response);
}

export async function addRoutePointToMissionInBackend(missionId, point, sequenceNumber, speedMps = 0) {
  const response = await apiPost('/api/v1/routes', {
    route: {
      mission_id: missionId,
      latitude: point[0],
      longitude: point[1],
      altitude: 3,
      max_altitude: 5,
      speed: speedMps,
      sequence_number: sequenceNumber,
    },
  });
  return extractData(response);
}

export async function approveMissionInBackend(missionId) {
  const response = await apiPatch(`/api/v1/missions/${missionId}`, {
    mission: { status: 'approved' },
  });
  return extractData(response);
}

export async function startMissionInBackend(missionId) {
  const response = await apiPost(`/api/v1/missions/${missionId}/start`, {});
  return extractData(response);
}

export async function completeMissionInBackend(missionId) {
  const response = await apiPost(`/api/v1/missions/${missionId}/complete`, {});
  return extractData(response);
}

export async function cancelMissionInBackend(missionId) {
  const response = await apiPatch(`/api/v1/missions/${missionId}`, {
    mission: { status: 'cancelled' },
  });
  return extractData(response);
}

/** GET /api/v1/missions?drone_id=...&active=1 — активные миссии дрона (planned/approved/in_progress). */
export async function fetchActiveMissionsForDrone(droneId) {
  if (droneId == null) return [];
  const response = await apiGet(`/api/v1/missions?drone_id=${encodeURIComponent(droneId)}&active=1`);
  const missions = extractData(response);
  return Array.isArray(missions) ? missions : [];
}

/**
 * multipart_init для video.
 * POST /api/v1/media_uploads/multipart_init
 */
export async function multipartInitForVideo({
  missionId,
  filename,
  byteSize,
  contentType = 'video/webm',
  chunkSizeBytes = 5 * 1024 * 1024,
} = {}) {
  if (missionId == null) throw new Error('missionId is required');
  if (!filename) throw new Error('filename is required');
  if (byteSize == null || !Number.isFinite(byteSize) || byteSize <= 0) {
    throw new Error('byteSize must be a positive number');
  }

  const response = await apiPost('/api/v1/media_uploads/multipart_init', {
    mission_id: missionId,
    media_type: 'video',
    filename,
    byte_size: byteSize,
    content_type: contentType,
    chunk_size_bytes: chunkSizeBytes,
  });
  return extractData(response);
}

/**
 * multipart_presign_part.
 * POST /api/v1/media_uploads/multipart_presign_part
 */
export async function multipartPresignPart({
  uploadSessionId,
  partNumber,
} = {}) {
  if (!uploadSessionId) throw new Error('uploadSessionId is required');
  if (!Number.isFinite(partNumber) || partNumber <= 0) {
    throw new Error('partNumber must be > 0');
  }

  const response = await apiPost('/api/v1/media_uploads/multipart_presign_part', {
    upload_session_id: uploadSessionId,
    part_number: partNumber,
  });
  return extractData(response);
}

/**
 * multipart_complete.
 * POST /api/v1/media_uploads/multipart_complete
 */
export async function multipartCompleteForVideo({
  uploadSessionId,
  parts,
} = {}) {
  if (!uploadSessionId) throw new Error('uploadSessionId is required');
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('parts must be a non-empty array');
  }

  const response = await apiPost('/api/v1/media_uploads/multipart_complete', {
    upload_session_id: uploadSessionId,
    parts,
  });
  return extractData(response);
}

/**
 * multipart_list_parts — получить etag/сведения по загруженным parts.
 * GET /api/v1/media_uploads/multipart_list_parts?upload_session_id=...
 */
export async function multipartListParts({ uploadSessionId } = {}) {
  if (!uploadSessionId) throw new Error('uploadSessionId is required');
  const response = await apiGet(
    `/api/v1/media_uploads/multipart_list_parts?upload_session_id=${encodeURIComponent(uploadSessionId)}`
  );
  return extractData(response);
}

/** POST /api/v1/telemetries — отправка телеметрии миссии. */
export async function postTelemetryToBackend({
  missionId,
  recordedAt,
  latitude,
  longitude,
  altitude = null,
  speed = null,
  battery = null,
} = {}) {
  if (missionId == null) return null;

  const response = await apiPost('/api/v1/telemetries', {
    telemetry: {
      mission_id: missionId,
      recorded_at: recordedAt ?? new Date().toISOString(),
      latitude,
      longitude,
      altitude,
      speed,
      battery,
    },
  });

  return extractData(response);
}
