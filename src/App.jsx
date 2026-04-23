import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SearchBox } from './components/Search_Box';
import { Sidebar } from './components/Sidebar';
import { ShabloneScreen } from './components/Shablone_Screen';
import { YandexMap } from './components/YandexMap';
import { DroneModal } from './components/Drone_OnClick_List_Sidebar';
import { DroneParking } from './components/Drone_Parking';
import { WeatherWidget } from './components/WeatherWidget';
import { AuthScreen } from './components/AuthScreen';
import { dronesData, initialMapCenter, flightStatus } from './constants/drones_data';
import { MISSION_TEMPLATES_STORAGE_KEY } from './constants/mission';
import {
  fetchDronesFromBackend,
  fetchUsersFromBackend,
  fetchZonesFromBackend,
  createDroneInBackend,
  createZoneWithKml,
  createZoneWithBoundary,
  updateZoneWithBoundary,
  deleteZoneInBackend,
  updateZoneWithKml,
  syncDroneStateToBackend,
  createMissionInBackend,
  addRoutePointToMissionInBackend,
  approveMissionInBackend,
  startMissionInBackend,
  completeMissionInBackend,
  cancelMissionInBackend,
  fetchActiveMissionsForDrone,
  postTelemetryToBackend,
  multipartInitForVideo,
  multipartPresignPart,
  multipartCompleteForVideo,
  multipartListParts,
  clearApiSession,
} from './api/backend';
import {
  calculateDistance,
  calculateFlightTime,
  calculateOptimalSpeed,
  calculateBearing
} from './utils/flightCalculator';

const VIEW_TRANSITION_MS = 300;
const EXIT_PANELS_MS = VIEW_TRANSITION_MS;
/** Минимальная дистанция (м): если дрон ближе к первой точке — перелёт до неё не добавляется */
const FIRST_WAYPOINT_TRANSIT_THRESHOLD_M = 10;
const TELEMETRY_SEND_EVERY_MS = 1000;

// Видео-логирование (для multipart upload после завершения миссии).
// ВАЖНО: backend допускает только content_type ровно 'video/webm' или 'video/mp4'.
const VIDEO_CANVAS_WIDTH = 640;
const VIDEO_CANVAS_HEIGHT = 360;
const VIDEO_RECORDING_FPS = 15;
const VIDEO_BACKEND_CONTENT_TYPE = 'video/webm';
const VIDEO_RECORDER_MIME_CANDIDATES = ['video/webm;codecs=vp8', 'video/webm'];
const VIDEO_MULTIPART_CHUNK_SIZE_BYTES = 1024 * 1024; // >= 1MB (минимум в backend)

function hasStoredApiToken() {
  if (typeof window === 'undefined') return false;
  const t = localStorage.getItem('api_token');
  return Boolean(t && t.trim().length > 0);
}

function getStoredApiUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('api_user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

function withRuntimeState(drone) {
  return {
    ...drone,
    position: null,
    path: [],
    isVisible: false,
    battery: drone.battery ?? 100,
    status: 'на земле',
    flightStatus: flightStatus.IDLE,
    speed: 0,
    altitude: 0,
    heading: 0,
    totalDistance: 0,
    currentMission: null,
    flightProgress: 0,
    remainingBattery: 5,
    estimatedFlightTime: 0,
    currentWaypointIndex: 0,
    missionTimerId: null,
    missionStartTime: null,
    missionElapsedTime: 0,
    missionParameters: null,
    flightLog: []
  };
}

function createLocalDrones() {
  return dronesData.map((drone) => withRuntimeState({ ...drone }));
}

function mapBackendDroneToFrontend(drone, index) {
  const fallback = dronesData[index % dronesData.length] ?? {};
  const batteryValue = Number(drone?.battery);
  return withRuntimeState({
    ...fallback,
    id: drone?.id ?? fallback.id ?? index + 1,
    name: drone?.name ?? fallback.name ?? `Дрон-${index + 1}`,
    model: drone?.model ?? fallback.model ?? 'Generic',
    battery: Number.isFinite(batteryValue) ? batteryValue : (fallback.battery ?? 100),
    backendStatus: drone?.status ?? 'idle'
  });
}

function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [exitingToTemplates, setExitingToTemplates] = useState(false);
  const [missionTemplates, setMissionTemplates] = useState(() => {
    try {
      const raw = localStorage.getItem(MISSION_TEMPLATES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((t) => ({
        id: t.id,
        name: t.name || 'Без названия',
        path: Array.isArray(t.path) ? t.path : []
      }));
    } catch {
      return [];
    }
  });

  const [templateEditMode, setTemplateEditMode] = useState(null);
  const [templateDraftPath, setTemplateDraftPath] = useState([]);
  const [templateDraftName, setTemplateDraftName] = useState('');
  const [noTransitionTemplateSwitch, setNoTransitionTemplateSwitch] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(MISSION_TEMPLATES_STORAGE_KEY, JSON.stringify(missionTemplates));
    } catch (e) {
      console.warn('Failed to save mission templates', e);
    }
  }, [missionTemplates]);

  useEffect(() => {
    if (!noTransitionTemplateSwitch) return;
    const id = requestAnimationFrame(() => {
      setNoTransitionTemplateSwitch(false);
    });
    return () => cancelAnimationFrame(id);
  }, [noTransitionTemplateSwitch]);

  const addMissionTemplate = useCallback((template) => {
    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setMissionTemplates((prev) => [...prev, { id, name: template.name || 'Шаблон', path: template.path || [] }]);
  }, []);
  const updateMissionTemplate = useCallback((id, template) => {
    setMissionTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: template.name ?? t.name, path: template.path ?? t.path } : t))
    );
  }, []);
  const deleteMissionTemplate = useCallback((id) => {
    setMissionTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startCreateTemplate = useCallback(() => {
    setTemplateEditMode('create');
    setTemplateDraftPath([]);
    setTemplateDraftName('');
  }, []);
  const startEditTemplateRoute = useCallback((id) => {
    const t = missionTemplates.find((x) => x.id === id);
    if (!t) return;
    setTemplateEditMode({ type: 'edit', id });
    setTemplateDraftPath([...(t.path || [])]);
    setTemplateDraftName(t.name || '');
  }, [missionTemplates]);
  const cancelTemplateEdit = useCallback(() => {
    setNoTransitionTemplateSwitch(true);
    setTemplateEditMode(null);
    setTemplateDraftPath([]);
    setTemplateDraftName('');
  }, []);
  const saveTemplateDraft = useCallback(() => {
    const name = templateDraftName.trim() || 'Маршрут патрулирования';
    if (templateEditMode === 'create') {
      addMissionTemplate({ name, path: [...templateDraftPath] });
    } else if (templateEditMode && templateEditMode.type === 'edit') {
      updateMissionTemplate(templateEditMode.id, { name, path: [...templateDraftPath] });
    }
    setNoTransitionTemplateSwitch(true);
    setTemplateEditMode(null);
    setTemplateDraftPath([]);
    setTemplateDraftName('');
  }, [templateEditMode, templateDraftName, templateDraftPath, addMissionTemplate, updateMissionTemplate]);
  const addTemplateDraftPoint = useCallback((latlng) => {
    setTemplateDraftPath((prev) => [...prev, [latlng.lat, latlng.lng]]);
  }, []);
  const undoTemplateDraftPoint = useCallback(() => {
    setTemplateDraftPath((prev) => (prev.length ? prev.slice(0, -1) : []));
  }, []);

  const [templateToApplyId, setTemplateToApplyId] = useState(null);
  const computeMissionParamsFromPath = useCallback((path, maxSpeed = 70, battery = 100) => {
    if (!path || path.length < 2) return null;
    let totalDistance = 0;
    const distances = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [lat1, lng1] = path[i];
      const [lat2, lng2] = path[i + 1];
      const distance = calculateDistance(lat1, lng1, lat2, lng2);
      totalDistance += distance;
      distances.push(distance);
    }
    const optimalSpeed = calculateOptimalSpeed(totalDistance, maxSpeed / 3.6);
    const flightTime = calculateFlightTime(totalDistance, optimalSpeed);
    const batteryConsumption = Math.min(totalDistance / 100, battery - 10);
    const missionParams = {
      totalDistance: Math.round(totalDistance),
      optimalSpeed: Math.round(optimalSpeed * 3.6),
      estimatedTime: Math.round(flightTime),
      batteryConsumption: Math.round(batteryConsumption),
      waypoints: path.length,
      distances,
      segmentTimes: distances.map((d) => Math.max(1000, (d / optimalSpeed) * 1000)),
      totalTime: 0
    };
    missionParams.totalTime = missionParams.segmentTimes.reduce((sum, t) => sum + t, 0);
    return missionParams;
  }, []);

  const applyTemplateToDrone = useCallback((droneId, tplId) => {
    const tpl = missionTemplates.find((t) => t.id === tplId);
    if (!tpl || !tpl.path || !tpl.path.length) return;
    setDrones((prev) => {
      const path = tpl.path.map((p) => [p[0], p[1]]);
      const next = prev.map((d) =>
        d.id === droneId ? { ...d, path } : d
      );
      const drone = next.find((d) => d.id === droneId);
      if (drone && path.length >= 2) {
        const params = computeMissionParamsFromPath(path, drone.maxSpeed, drone.battery);
        return next.map((d) =>
          d.id === droneId ? { ...d, path, missionParameters: params } : d
        );
      }
      return next;
    });
    setTemplateToApplyId(null);
  }, [missionTemplates, computeMissionParamsFromPath]);

  const [drones, setDrones] = useState(() => createLocalDrones());
  const [backendSync, setBackendSync] = useState({ status: 'idle', message: '' });
  const [authReady, setAuthReady] = useState(hasStoredApiToken);
  const authUser = useMemo(() => getStoredApiUser(), [authReady]);
  const authUserLabel = useMemo(() => {
    if (authUser?.name && String(authUser.name).trim()) return String(authUser.name).trim();
    if (authUser?.email && String(authUser.email).trim()) return String(authUser.email).trim();
    if (authUser?.id != null) return `ID ${authUser.id}`;
    return 'пользователь';
  }, [authUser]);
  const backendContextRef = useRef({ userId: null, zoneId: null });
  const backendMissionIdsRef = useRef(new Map());

  const [backendZones, setBackendZones] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const activeZoneIdRef = useRef(null);
  const [zoneFitNonce, setZoneFitNonce] = useState(0);
  const [newZoneKmlName, setNewZoneKmlName] = useState('Полигон из KML');
  const [zoneKmlBusy, setZoneKmlBusy] = useState(false);
  const [zoneKmlMessage, setZoneKmlMessage] = useState(null);
  const [zoneKmlIsError, setZoneKmlIsError] = useState(false);
  const zoneKmlInputRef = useRef(null);

  const [drawRectZoneMode, setDrawRectZoneMode] = useState(false);
  const [draftRectBoundary, setDraftRectBoundary] = useState(null);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [newRectZoneName, setNewRectZoneName] = useState('Зона (прямоугольник)');
  const [rectZoneBusy, setRectZoneBusy] = useState(false);

  useEffect(() => {
    activeZoneIdRef.current = activeZoneId;
  }, [activeZoneId]);

  useEffect(() => {
    if (!templateEditMode) return;
    setDrawRectZoneMode(false);
    setEditingZoneId(null);
    setDraftRectBoundary(null);
  }, [templateEditMode]);

  const activeZoneBoundary = useMemo(() => {
    const z = backendZones.find((x) => x.id === activeZoneId);
    return Array.isArray(z?.boundary) ? z.boundary : null;
  }, [backendZones, activeZoneId]);

  const dronesRef = useRef(drones);
  useEffect(() => {
    dronesRef.current = drones;
  }, [drones]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    let cancelled = false;

    const bootstrapBackend = async () => {
      setBackendSync({ status: 'loading', message: '' });
      try {
        const backendDrones = await fetchDronesFromBackend();
        try {
          const zones = await fetchZonesFromBackend();
          setBackendZones(zones);
          let userId = null;
          try {
            const raw = localStorage.getItem('api_user');
            if (raw) {
              const me = JSON.parse(raw);
              if (me?.id != null) userId = me.id;
            }
          } catch {
            /* ignore */
          }
          if (userId == null) {
            const users = await fetchUsersFromBackend();
            if (users.length > 0) userId = users[0].id;
          }
          if (userId != null && zones.length > 0) {
            setActiveZoneId((prev) => {
              const next =
                prev != null && zones.some((z) => z.id === prev) ? prev : zones[0].id;
              backendContextRef.current = { userId, zoneId: next };
              return next;
            });
            setZoneFitNonce((n) => n + 1);
          } else {
            setActiveZoneId(null);
            backendContextRef.current = {
              ...backendContextRef.current,
              zoneId: null,
            };
          }
        } catch (e) {
          console.warn('Backend user/zone контекст недоступен:', e?.message ?? e);
        }
        if (cancelled) return;

        if (backendDrones.length > 0) {
          setDrones(backendDrones.map(mapBackendDroneToFrontend));
          setBackendSync({
            status: 'connected',
            message: ''
          });
        } else {
          setBackendSync({
            status: 'connected-empty',
            message: ''
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (!localStorage.getItem('api_token')) {
          setAuthReady(false);
        }
        setBackendSync({
          status: 'error',
          message: ''
        });
      }
    };

    bootstrapBackend();
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  const [mapCenter, setMapCenter] = useState(initialMapCenter);
  const [selectedDroneForModal, setSelectedDroneForModal] = useState(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [globalMissionLog, setGlobalMissionLog] = useState([]);
  const [weatherFlightSafe, setWeatherFlightSafe] = useState(true);
  const [weatherFlightReasons, setWeatherFlightReasons] = useState([]);
  const activeTimersRef = useRef(new Map());

  // throttle: не шлём телеметрию чаще чем раз в TELEMETRY_SEND_EVERY_MS
  const telemetryLastSentAtRef = useRef(new Map());
  // защита от параллельных запросов
  const telemetrySendingRef = useRef(new Map());

  const videoRecordingByDroneRef = useRef(new Map());
  const videoUploadInProgressRef = useRef(new Map());

  const stopVideoRecordingForDrone = async (droneId) => {
    const rec = videoRecordingByDroneRef.current.get(droneId);
    if (!rec) return null;

    videoRecordingByDroneRef.current.delete(droneId);

    try {
      if (rec?.recorder && rec.recorder.state !== 'inactive') {
        rec.recorder.stop();
      }
    } catch (e) {
      // ignore
    }

    try {
      return await rec.blobPromise;
    } catch (e) {
      console.warn('stopVideoRecordingForDrone blob error:', e?.message ?? e);
      return null;
    }
  };

  const uploadVideoMultipartForMission = async ({ missionId, droneId, blob }) => {
    if (missionId == null) return;
    if (!blob || blob.size <= 0) return;
    if (videoUploadInProgressRef.current.get(droneId)) return;

    videoUploadInProgressRef.current.set(droneId, true);
    try {
      const filename = `mission_${missionId}_drone_${droneId}_${Date.now()}.webm`;
      const init = await multipartInitForVideo({
        missionId,
        filename,
        byteSize: blob.size,
        contentType: VIDEO_BACKEND_CONTENT_TYPE,
        chunkSizeBytes: VIDEO_MULTIPART_CHUNK_SIZE_BYTES,
      });

      const uploadSessionId = init?.upload_session_id;
      const totalParts = init?.total_parts;
      const chunkSizeBytes = init?.chunk_size_bytes;
      if (!uploadSessionId || !Number.isFinite(totalParts) || !Number.isFinite(chunkSizeBytes)) {
        throw new Error('multipart_init returned unexpected data');
      }

      for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
        const presign = await multipartPresignPart({
          uploadSessionId,
          partNumber,
        });

        const start = (partNumber - 1) * chunkSizeBytes;
        const end = Math.min(start + chunkSizeBytes, blob.size);
        const partBlob = blob.slice(start, end);

        const headers = presign?.headers ?? {};
        const putRes = await fetch(presign.url, {
          method: 'PUT',
          headers,
          body: partBlob,
        });
        if (!putRes.ok) {
          throw new Error(`PUT part ${partNumber} failed with ${putRes.status}`);
        }
      }

      const list = await multipartListParts({ uploadSessionId });
      const uploadedParts = Array.isArray(list?.uploaded_parts) ? list.uploaded_parts : [];
      const parts = uploadedParts
        .map((p) => ({
          part_number: p.part_number,
          etag: p.etag,
        }))
        .filter((p) => Number.isFinite(p.part_number) && typeof p.etag === 'string')
        .sort((a, b) => a.part_number - b.part_number);

      if (!parts.length) {
        throw new Error('multipart_list_parts returned empty uploaded_parts');
      }

      await multipartCompleteForVideo({
        uploadSessionId,
        parts,
      });
    } finally {
      videoUploadInProgressRef.current.delete(droneId);
    }
  };

  const handleWeatherFlightConditions = useCallback((conditions) => {
    setWeatherFlightSafe(conditions.safe);
    setWeatherFlightReasons(conditions.reasons || []);
  }, []);

  const [placementMode, setPlacementMode] = useState(false);
  const [droneToPlace, setDroneToPlace] = useState(null);
  const [isRouteEditMode, setIsRouteEditMode] = useState(false);
  const [selectedDroneForSidebar, setSelectedDroneForSidebar] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [parkingOpen, setParkingOpen] = useState(false);

  const createDroneFromParking = useCallback(async () => {
    try {
      const suffix = `${Date.now()}`.slice(-6);
      await createDroneInBackend({ name: `Дрон ${suffix}`, model: 'DJI Mavic 3', battery: 100, status: 'idle' });
      const backendDrones = await fetchDronesFromBackend();
      if (backendDrones.length > 0) {
        setDrones(backendDrones.map(mapBackendDroneToFrontend));
        setBackendSync({
          status: 'connected',
          message: ''
        });
      }
    } catch (e) {
      console.warn('createDroneFromParking failed:', e?.message ?? e);
    }
  }, []);

  useEffect(() => {
    if (!templateToApplyId || selectedDroneForSidebar == null) return;
    const drone = drones.find((d) => d.id === selectedDroneForSidebar);
    if (!drone || !drone.isVisible) return;
    if (drone.isFlying) return;
    applyTemplateToDrone(selectedDroneForSidebar, templateToApplyId);
  }, [templateToApplyId, selectedDroneForSidebar, drones, applyTemplateToDrone]);

  const startDronePlacement = (droneId) => {
    setDroneToPlace(droneId);
    setPlacementMode(true);
  };

  const placeDroneOnMap = (latlng) => {
    if (!droneToPlace || !placementMode) return;
    const drone = drones.find(d => d.id === droneToPlace);
    if (!drone) return;

    const positionToSet = {
      lat: latlng.lat,
      lng: latlng.lng
    };

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneToPlace) return d;
        return {
          ...d,
          position: positionToSet,
          isVisible: true,
          battery: 100,
          status: 'на земле',
          flightStatus: flightStatus.IDLE,
          speed: 0,
          altitude: 0,
          path: [],
          missionParameters: null,
          flightProgress: 0,
          currentWaypointIndex: 0,
          flightLog: []
        };
      })
    );
    setSelectedDroneForSidebar(droneToPlace);
    setMapCenter([positionToSet.lat, positionToSet.lng]);
    setPlacementMode(false);
    setDroneToPlace(null);
    addToGlobalLog(droneToPlace, `🛸 Дрон "${drone.name}" размещен на карте`, {
      coordinates: `lat: ${positionToSet.lat.toFixed(6)}, lng: ${positionToSet.lng.toFixed(6)}`
    });
    void syncDroneStateToBackend(droneToPlace, { status: 'idle', battery: 100 }).catch((e) =>
      console.warn('PATCH drone (размещение):', e?.message ?? e)
    );
  };

  const cancelDronePlacement = () => {
    setPlacementMode(false);
    setDroneToPlace(null);
  };

  const removeDroneFromMap = (droneId) => {
    if (drones.find(d => d.id === droneId)?.flightStatus === flightStatus.FLYING) {
      stopDroneFlight(droneId);
    }

    const timerId = activeTimersRef.current.get(droneId);
    if (timerId) {
      clearInterval(timerId);
      activeTimersRef.current.delete(droneId);
    }

    const drone = drones.find(d => d.id === droneId);

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          isVisible: false,
          path: [],
          flightStatus: flightStatus.IDLE,
          isFlying: false,
          missionParameters: null,
          missionTimerId: null,
          missionStartTime: null,
          missionElapsedTime: 0,
          flightLog: []
        };
      })
    );
    if (selectedDroneForSidebar === droneId) {
      setSelectedDroneForSidebar(null);
      setIsRouteEditMode(false);
    }
    if (drone) {
      addToGlobalLog(droneId, `🗑️ Дрон "${drone.name}" убран с карты`);
    }
    void syncDroneStateToBackend(droneId, { status: 'offline' }).catch((e) =>
      console.warn('PATCH drone (убрать с карты):', e?.message ?? e)
    );
  };

  const handleMapClick = (latlng) => {
    if (templateEditMode) {
      addTemplateDraftPoint(latlng);
      return;
    }
    if (placementMode && droneToPlace) {
      placeDroneOnMap(latlng);
      return;
    }
    if (selectedDroneForSidebar !== null && isRouteEditMode) {
      const drone = drones.find(d => d.id === selectedDroneForSidebar);
      if (drone && !drone.isFlying) {
        addRoutePoint(selectedDroneForSidebar, latlng);
      }
    }
  };

  const addRoutePoint = (droneId, latlng) => {
    setDrones(prev =>
      prev.map(d =>
        d.id === droneId ? {
          ...d,
          path: [...d.path, [latlng.lat, latlng.lng]]
        } : d
      )
    );
    setTimeout(() => {
      const missionParams = calculateMissionParameters(droneId);
      if (missionParams) {
        setDrones(prev =>
          prev.map(d => {
            if (d.id !== droneId) return d;
            return {
              ...d,
              missionParameters: missionParams
            };
          })
        );
        addToDroneLog(droneId, '📍 Добавлена точка маршрута', {
          pointNumber: drones.find(d => d.id === droneId)?.path?.length || 0,
          coordinates: `lat: ${latlng.lat.toFixed(6)}, lng: ${latlng.lng.toFixed(6)}`
        });
      }
    }, 0);
  };

  const undoLastPoint = (droneId) => {
    if (!droneId) droneId = selectedDroneForSidebar;
    if (!droneId) return;

    const drone = drones.find(d => d.id === droneId);
    if (!drone || !drone.path || drone.path.length === 0) return;

    setDrones(prev =>
      prev.map(d =>
        d.id === droneId ? { ...d, path: d.path.slice(0, -1) } : d
      )
    );

    addToDroneLog(droneId, '↩️ Отменена последняя точка маршрута');
  };

  const clearRoute = (droneId) => {
    if (!droneId) droneId = selectedDroneForSidebar;
    if (!droneId) return;

    const drone = drones.find(d => d.id === droneId);
    if (!drone || !drone.path || drone.path.length === 0) return;

    setDrones(prev =>
      prev.map(d =>
        d.id === droneId ? {
          ...d,
          path: [],
          missionParameters: null
        } : d
      )
    );
    addToDroneLog(droneId, '🗑️ Маршрут очищен');
  };

  const calculateMissionParameters = (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (!drone || !drone.path || drone.path.length < 2) return null;

    let totalDistance = 0;
    const distances = [];

    for (let i = 0; i < drone.path.length - 1; i++) {
      const [lat1, lng1] = drone.path[i];
      const [lat2, lng2] = drone.path[i + 1];
      const distance = calculateDistance(lat1, lng1, lat2, lng2);
      totalDistance += distance;
      distances.push(distance);
    }

    const optimalSpeed = calculateOptimalSpeed(totalDistance, drone.maxSpeed / 3.6);
    const flightTime = calculateFlightTime(totalDistance, optimalSpeed);
    const batteryConsumption = Math.min(totalDistance / 100, drone.battery - 10);

    const missionParams = {
      totalDistance: Math.round(totalDistance),
      optimalSpeed: Math.round(optimalSpeed * 3.6),
      estimatedTime: Math.round(flightTime),
      batteryConsumption: Math.round(batteryConsumption),
      waypoints: drone.path.length,
      distances,
      segmentTimes: distances.map(distance =>
        Math.max(1000, (distance / optimalSpeed) * 1000)
      ),
      totalTime: 0
    };

    missionParams.totalTime = missionParams.segmentTimes.reduce((sum, time) => sum + time, 0);
    return missionParams;
  };

  const addToDroneLog = (droneId, message, data = {}) => {
    const drone = drones.find(d => d.id === droneId);
    const logEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      message,
      data
    };

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          flightLog: [logEntry, ...d.flightLog].slice(0, 20)
        };
      })
    );
    const safeData = {};
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'object' && data[key] !== null) {
        safeData[key] = JSON.stringify(data[key]);
      } else {
        safeData[key] = data[key];
      }
    });

    addToGlobalLog(droneId, message, safeData);
  };

  const addToGlobalLog = (droneId, message, data = {}) => {
    const drone = drones.find(d => d.id === droneId);
    const safeData = {};
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'object' && data[key] !== null) {
        safeData[key] = JSON.stringify(data[key]);
      } else {
        safeData[key] = data[key];
      }
    });

    const globalLogEntry = {
      id: Date.now(),
      droneId,
      droneName: drone?.name || 'Неизвестный дрон',
      timestamp: new Date().toISOString(),
      message,
      data: safeData
    };

    setGlobalMissionLog(prev => [globalLogEntry, ...prev].slice(0, 100));
  };

  const hydrateBackendContext = useCallback(async () => {
    const zones = await fetchZonesFromBackend();
    setBackendZones(zones);
    if (!zones.length) {
      throw new Error('В backend нет зон (нужна zone с boundary для маршрутов)');
    }
    let userId = null;
    try {
      const raw = localStorage.getItem('api_user');
      if (raw) {
        const me = JSON.parse(raw);
        if (me?.id != null) userId = me.id;
      }
    } catch {
      /* ignore */
    }
    if (userId == null) {
      const users = await fetchUsersFromBackend();
      if (!users.length) {
        throw new Error('В backend нет пользователей');
      }
      userId = users[0].id;
    }
    let zoneId = activeZoneIdRef.current;
    if (zoneId == null || !zones.some((z) => z.id === zoneId)) {
      zoneId = zones[0].id;
      setActiveZoneId(zoneId);
      setZoneFitNonce((n) => n + 1);
    }
    const ctx = { userId, zoneId };
    backendContextRef.current = ctx;
    return ctx;
  }, []);

  const createAndStartBackendMission = useCallback(async (drone, routePath) => {
    try {
      let ctx = backendContextRef.current;
      if (!ctx?.userId || !ctx?.zoneId) {
        ctx = await hydrateBackendContext();
      }
      const createOnce = async () => createMissionInBackend({
        userId: ctx.userId,
        zoneId: ctx.zoneId,
        droneId: drone.id,
        missionType: 'monitoring',
      });

      let mission;
      try {
        mission = await createOnce();
      } catch (e) {
        const msg = String(e?.message ?? e);
        // Если на бэке осталась активная/запланированная миссия — отменяем и пробуем ещё раз.
        if (msg.includes('уже назначен')) {
          try {
            const active = await fetchActiveMissionsForDrone(drone.id);
            for (const m of active) {
              if (m?.id != null) {
                try {
                  await cancelMissionInBackend(m.id);
                } catch (cancelErr) {
                  console.warn('auto-cancel active mission failed:', cancelErr?.message ?? cancelErr);
                }
              }
            }
          } catch (listErr) {
            console.warn('fetchActiveMissionsForDrone failed:', listErr?.message ?? listErr);
          }
          mission = await createOnce();
        } else {
          throw e;
        }
      }
      const missionId = mission?.id;
      if (!missionId) {
        throw new Error('Backend не вернул id миссии');
      }
      const speedMps = Math.max(0, Number(drone.maxSpeed ?? 0) / 3.6);
      for (let i = 0; i < routePath.length; i += 1) {
        await addRoutePointToMissionInBackend(missionId, routePath[i], i, speedMps);
      }
      await approveMissionInBackend(missionId);
      await startMissionInBackend(missionId);
      backendMissionIdsRef.current.set(drone.id, missionId);
      void syncDroneStateToBackend(drone.id, { battery: drone.battery }).catch((e) =>
        console.warn('PATCH drone (battery после start):', e?.message ?? e)
      );
    } catch (error) {
      console.warn('Синхронизация миссии с backend:', error?.message ?? error);
      addToGlobalLog(drone.id, '⚠️ Миссия не синхронизирована с backend', {
        error: String(error?.message ?? error),
      });
    }
  }, [hydrateBackendContext, addToGlobalLog, fetchActiveMissionsForDrone]);

  const completeBackendMissionForDrone = useCallback(async (droneId) => {
    const missionId = backendMissionIdsRef.current.get(droneId);
    if (!missionId) return;
    try {
      await completeMissionInBackend(missionId);
      backendMissionIdsRef.current.delete(droneId);
    } catch (e) {
      console.warn('complete mission:', e?.message ?? e);
    }
  }, []);

  const cancelBackendMissionForDrone = useCallback(async (droneId) => {
    const missionId = backendMissionIdsRef.current.get(droneId);
    if (!missionId) return;
    try {
      await cancelMissionInBackend(missionId);
      backendMissionIdsRef.current.delete(droneId);
    } catch (e) {
      console.warn('cancel mission:', e?.message ?? e);
    }
  }, []);

  const startDroneFlight = useCallback((droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (!drone || !drone.path || drone.path.length < 2) {
      console.warn('Start flight blocked: route needs >= 2 points');
      return;
    }

    if (drone.flightStatus === flightStatus.FLYING || drone.flightStatus === flightStatus.TAKEOFF || drone.flightStatus === flightStatus.LANDING) {
      console.warn('Start flight blocked: already flying');
      return;
    }

    const firstWaypoint = drone.path[0];
    const needTransitToFirst =
      drone.position &&
      firstWaypoint &&
      calculateDistance(
        drone.position.lat,
        drone.position.lng,
        firstWaypoint[0],
        firstWaypoint[1]
      ) > FIRST_WAYPOINT_TRANSIT_THRESHOLD_M;

    const flightPath = needTransitToFirst
      ? [[drone.position.lat, drone.position.lng], ...drone.path]
      : drone.path;

    const missionParams = computeMissionParamsFromPath(
      flightPath,
      drone.maxSpeed,
      drone.battery
    );
    if (!missionParams) return;

    if (drone.battery < missionParams.batteryConsumption + 10) {
      console.warn('Start flight blocked: low battery', {
        requiredMin: missionParams.batteryConsumption + 10,
        available: drone.battery
      });
      return;
    }
    if (selectedDroneForSidebar === droneId && isRouteEditMode) {
      setIsRouteEditMode(false);
    }

    const alreadyAtFirstPoint = !needTransitToFirst;

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          flightStatus: alreadyAtFirstPoint ? flightStatus.FLYING : flightStatus.TAKEOFF,
          isFlying: true,
          altitude: alreadyAtFirstPoint ? 100 : 50,
          currentMission: {
            startTime: new Date().toISOString(),
            totalWaypoints: d.path.length,
            totalDistance: missionParams.totalDistance,
            estimatedTime: missionParams.estimatedTime,
            missionParams,
            flightPath
          },
          currentWaypointIndex: 0,
          flightProgress: 0,
          speed: missionParams.optimalSpeed / 3.6,
          heading: 0,
          missionParameters: missionParams,
          missionStartTime: Date.now(),
          missionElapsedTime: 0
        };
      })
    );

    addToDroneLog(droneId, '🚀 Старт миссии', {
      waypoints: drone.path.length,
      totalDistance: missionParams.totalDistance,
      estimatedTime: missionParams.estimatedTime
    });
    // Не PATCH в in_mission до POST /missions: backend требует idle при создании миссии;
    // in_mission выставляет start! на сервере.
    void createAndStartBackendMission(drone, drone.path);
    if (needTransitToFirst) {
      const transitDist = Math.round(
        calculateDistance(
          drone.position.lat,
          drone.position.lng,
          firstWaypoint[0],
          firstWaypoint[1]
        )
      );
      addToDroneLog(droneId, '📍 Перелёт до первой точки миссии', {
        distance: `${transitDist} м`
      });
    }

    if (alreadyAtFirstPoint) {
      addToDroneLog(droneId, '🛸 Дрон уже в воздухе — начало маршрута');
      setTimeout(() => startFlightMovement(droneId), 0);
    } else {
      setTimeout(() => {
        setDrones(prev =>
          prev.map(d => {
            if (d.id !== droneId) return d;
            return {
              ...d,
              flightStatus: flightStatus.FLYING,
              altitude: 100
            };
          })
        );
        addToDroneLog(droneId, '🛫 Взлет выполнен', { altitude: 100 });
        startFlightMovement(droneId);
      }, 2000);
    }
  }, [
    drones,
    selectedDroneForSidebar,
    isRouteEditMode,
    addToDroneLog,
    computeMissionParamsFromPath,
    createAndStartBackendMission,
  ]);

  const startFlightMovement = (droneId) => {
    const drone = dronesRef.current.find(d => d.id === droneId);
    if (!drone || !drone.missionParameters) return;

    const missionParams = drone.missionParameters;
    let startTime;

    if (drone.missionElapsedTime > 0) {
      startTime = Date.now() - drone.missionElapsedTime;
    } else {
      startTime = Date.now();
    }

    const existingTimer = activeTimersRef.current.get(droneId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    telemetryLastSentAtRef.current.set(droneId, 0);
    telemetrySendingRef.current.set(droneId, false);

    // Запуск видеозаписи "полного видео" миссии (синтетический HUD на canvas),
    // чтобы затем прогнать multipart upload.
    let videoCtx = null;
    try {
      if (typeof document !== 'undefined' && typeof MediaRecorder !== 'undefined' && document.createElement) {
        const canvas = document.createElement('canvas');
        canvas.width = VIDEO_CANVAS_WIDTH;
        canvas.height = VIDEO_CANVAS_HEIGHT;

        const ctx = canvas.getContext('2d');
        if (ctx && canvas.captureStream) {
          videoCtx = ctx;
          const stream = canvas.captureStream(VIDEO_RECORDING_FPS);

          const recorderMimeType = VIDEO_RECORDER_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
          const options = recorderMimeType ? { mimeType: recorderMimeType } : undefined;

          const recorder = new MediaRecorder(stream, options);
          const chunks = [];

          let resolveBlob;
          const blobPromise = new Promise((resolve) => {
            resolveBlob = resolve;
          });

          recorder.ondataavailable = (e) => {
            if (e?.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = () => {
            const blobType = VIDEO_BACKEND_CONTENT_TYPE;
            const blob = new Blob(chunks, { type: blobType });
            resolveBlob(blob);
          };

          recorder.start(1000); // chunks every 1s
          videoRecordingByDroneRef.current.set(droneId, {
            recorder,
            blobPromise,
          });
        }
      }
    } catch (e) {
      // recording is optional; don't break flight sim
      console.warn('Video recording init failed:', e?.message ?? e);
    }

    const timerId = setInterval(() => {
      const currentDrone = dronesRef.current.find(d => d.id === droneId);
      if (!currentDrone || currentDrone.flightStatus !== flightStatus.FLYING) {
        clearInterval(timerId);
        activeTimersRef.current.delete(droneId);
        return;
      }

      const nowMs = Date.now();
      const elapsedTime = nowMs - startTime;

      if (elapsedTime >= missionParams.totalTime) {
        completeDroneFlight(droneId);
        return;
      }

      let accumulatedTime = 0;
      let currentSegment = 0;

      for (let i = 0; i < missionParams.segmentTimes.length; i++) {
        if (elapsedTime <= accumulatedTime + missionParams.segmentTimes[i]) {
          currentSegment = i;
          break;
        }
        accumulatedTime += missionParams.segmentTimes[i];
      }

      const segmentProgress = (elapsedTime - accumulatedTime) / missionParams.segmentTimes[currentSegment];
      const clampedProgress = Math.min(1, Math.max(0, segmentProgress));

      if (currentSegment === missionParams.segmentTimes.length - 1 && clampedProgress >= 0.99) {
        completeDroneFlight(droneId);
        return;
      }

      const pathForFlight = currentDrone.currentMission?.flightPath ?? currentDrone.path;
      const startPoint = pathForFlight[currentSegment];
      const endPoint = pathForFlight[currentSegment + 1];

      const currentLat = startPoint[0] + (endPoint[0] - startPoint[0]) * clampedProgress;
      const currentLng = startPoint[1] + (endPoint[1] - startPoint[1]) * clampedProgress;

      const segmentCount = pathForFlight.length - 1;

      const missionId = backendMissionIdsRef.current.get(droneId);
      const batteryDrain = (missionParams.batteryConsumption * elapsedTime) / missionParams.totalTime;
      const remainingBattery = Math.max(0, 100 - batteryDrain);

      const totalProgressForVideo = segmentCount > 0
        ? ((currentSegment + clampedProgress) / segmentCount) * 100
        : 100;

      if (videoCtx) {
        try {
          videoCtx.clearRect(0, 0, VIDEO_CANVAS_WIDTH, VIDEO_CANVAS_HEIGHT);
          videoCtx.fillStyle = 'black';
          videoCtx.fillRect(0, 0, VIDEO_CANVAS_WIDTH, VIDEO_CANVAS_HEIGHT);
          videoCtx.fillStyle = 'white';
          videoCtx.font = '16px Arial';
          videoCtx.fillText(`Drone: ${drone?.name ?? droneId}`, 20, 28);
          videoCtx.font = '13px Arial';
          videoCtx.fillText(`Coords: ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`, 20, 52);
          videoCtx.fillText(`Battery: ${Math.round(remainingBattery)}%`, 20, 72);
          videoCtx.fillText(`Progress: ${totalProgressForVideo.toFixed(1)}%`, 20, 92);

          const barX = 20;
          const barY = 120;
          const barW = VIDEO_CANVAS_WIDTH - 40;
          const barH = 12;
          const pct = Math.min(1, Math.max(0, totalProgressForVideo / 100));
          videoCtx.fillStyle = 'rgba(255,255,255,0.25)';
          videoCtx.fillRect(barX, barY, barW, barH);
          videoCtx.fillStyle = 'rgba(34, 197, 94, 0.9)';
          videoCtx.fillRect(barX, barY, barW * pct, barH);
        } catch {
          // ignore
        }
      }

      const lastSentAt = telemetryLastSentAtRef.current.get(droneId) ?? 0;
      const sending = telemetrySendingRef.current.get(droneId) ?? false;
      const shouldSendTelemetry =
        missionId != null &&
        !sending &&
        nowMs - lastSentAt >= TELEMETRY_SEND_EVERY_MS;

      if (shouldSendTelemetry) {
        telemetrySendingRef.current.set(droneId, true);
        telemetryLastSentAtRef.current.set(droneId, nowMs);
        void postTelemetryToBackend({
          missionId,
          recordedAt: new Date().toISOString(),
          latitude: currentLat,
          longitude: currentLng,
          altitude: Math.round(currentDrone.altitude ?? 50),
          speed: Math.max(0, Number(missionParams.optimalSpeed ?? 0) / 3.6),
          battery: Math.round(remainingBattery),
        }).catch((e) => {
          console.warn('POST telemetry:', e?.message ?? e);
        }).finally(() => {
          telemetrySendingRef.current.set(droneId, false);
        });
      }

      setDrones(prev =>
        prev.map(d => {
          if (d.id !== droneId) return d;

          const totalProgress = segmentCount > 0
            ? ((currentSegment + clampedProgress) / segmentCount) * 100
            : 100;
          const batteryDrain = (missionParams.batteryConsumption * elapsedTime) / missionParams.totalTime;
          const remainingBattery = Math.max(0, 100 - batteryDrain);

          if (remainingBattery <= 1) {
            addToDroneLog(droneId, '🔋 Критически низкий заряд батареи! Аварийная посадка');
            completeDroneFlight(droneId);
            return d;
          }

          return {
            ...d,
            position: { lat: currentLat, lng: currentLng },
            currentWaypointIndex: currentSegment,
            flightProgress: totalProgress,
            battery: Math.round(remainingBattery),
            heading: calculateBearing(startPoint[0], startPoint[1], endPoint[0], endPoint[1]),
            missionElapsedTime: elapsedTime
          };
        })
      );

    }, 100);

    activeTimersRef.current.set(droneId, timerId);

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          missionTimerId: timerId
        };
      })
    );
  };

  const completeDroneFlight = (droneId) => {
    const timerId = activeTimersRef.current.get(droneId);
    if (timerId) {
      clearInterval(timerId);
      activeTimersRef.current.delete(droneId);
    }

    const drone = dronesRef.current.find(d => d.id === droneId);
    const isFlyToFirstOnly = drone?.currentMission?.flyToFirstOnly;

    if (isFlyToFirstOnly) {
      const flightPath = drone?.currentMission?.flightPath;
      const lastPoint = flightPath?.length ? flightPath[flightPath.length - 1] : null;
      setDrones(prev =>
        prev.map(d => {
          if (d.id !== droneId) return d;
          return {
            ...d,
            flightStatus: flightStatus.IDLE,
            isFlying: false,
            status: 'на земле',
            speed: 0,
            altitude: 100,
            position: lastPoint ? { lat: lastPoint[0], lng: lastPoint[1] } : d.position,
            currentWaypointIndex: 0,
            flightProgress: 0,
            missionTimerId: null,
            missionStartTime: null,
            missionElapsedTime: 0,
            currentMission: null
          };
        })
      );
      addToDroneLog(droneId, '📍 Дрон завис над первой точкой. Нажмите «Запустить миссию».');
      // Останавливаем видео, но не загружаем (миссия ещё не завершена).
      void stopVideoRecordingForDrone(droneId).catch(() => {});
      return;
    }

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          flightStatus: flightStatus.LANDING,
          speed: 5,
          altitude: 50
        };
      })
    );

    addToDroneLog(droneId, '🛬 Начинается посадка');

    setTimeout(async () => {
      setDrones(prev =>
        prev.map(d => {
          if (d.id !== droneId) return d;
          const path = d.currentMission?.flightPath;
          const lastPoint = path?.length ? path[path.length - 1] : null;
          return {
            ...d,
            flightStatus: flightStatus.COMPLETED,
            isFlying: false,
            status: 'на земле',
            speed: 0,
            altitude: 0,
            position: lastPoint ? { lat: lastPoint[0], lng: lastPoint[1] } : d.position,
            currentWaypointIndex: 0,
            flightProgress: 100,
            missionTimerId: null,
            missionStartTime: null,
            missionElapsedTime: 0,
            currentMission: {
              ...d.currentMission,
              endTime: new Date().toISOString(),
              completed: true
            }
          };
        })
      );

      addToDroneLog(droneId, '✅ Миссия завершена успешно');

      // Видео multipart: сервер примет media только когда миссия in_progress/completed.
      const missionIdForUpload = backendMissionIdsRef.current.get(droneId);
      const blob = await stopVideoRecordingForDrone(droneId);

      void syncDroneStateToBackend(droneId, { status: 'idle' }).catch((e) =>
        console.warn('PATCH drone (завершение):', e?.message ?? e)
      );

      await completeBackendMissionForDrone(droneId);
      if (missionIdForUpload && blob) {
        try {
          await uploadVideoMultipartForMission({
            missionId: missionIdForUpload,
            droneId,
            blob,
          });
        } catch (e) {
          console.warn('Video multipart upload failed:', e?.message ?? e);
        }
      }
    }, 3000);
  };

  const stopDroneFlight = (droneId) => {
    const timerId = activeTimersRef.current.get(droneId);
    if (timerId) {
      clearInterval(timerId);
      activeTimersRef.current.delete(droneId);
    }

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          flightStatus: flightStatus.IDLE,
          isFlying: false,
          status: 'на земле',
          speed: 0,
          altitude: 0,
          missionTimerId: null,
          missionStartTime: null,
          missionElapsedTime: 0,
          flightProgress: 0,
          currentWaypointIndex: 0
        };
      })
    );

    addToDroneLog(droneId, '⏹️ Полёт принудительно остановлен');
    void syncDroneStateToBackend(droneId, { status: 'idle' }).catch((e) =>
      console.warn('PATCH drone (стоп):', e?.message ?? e)
    );
    void cancelBackendMissionForDrone(droneId);

    // В случае принудительной остановки видео не загружаем (медиа допускается только для in_progress/completed).
    void stopVideoRecordingForDrone(droneId).catch(() => {});
  };

  const pauseDroneFlight = (droneId) => {
    const timerId = activeTimersRef.current.get(droneId);
    if (timerId) {
      clearInterval(timerId);
      activeTimersRef.current.delete(droneId);
    }

    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          flightStatus: flightStatus.PAUSED,
          missionTimerId: null
        };
      })
    );

    addToDroneLog(droneId, '⏸️ Полёт приостановлен');
  };

  const resumeDroneFlight = (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (drone && drone.flightStatus === flightStatus.PAUSED) {
      setDrones(prev =>
        prev.map(d => {
          if (d.id !== droneId) return d;
          return {
            ...d,
            flightStatus: flightStatus.FLYING
          };
        })
      );

      startFlightMovement(droneId);
      addToDroneLog(droneId, '▶️ Полёт возобновлён');
    }
  };

  const getActiveFlights = () => {
    return drones.filter(d => d.flightStatus === flightStatus.FLYING || d.flightStatus === flightStatus.TAKEOFF);
  };

  const centerMapToFirstWaypoint = useCallback(() => {
    if (selectedDroneForSidebar == null) return;
    const drone = drones.find(d => d.id === selectedDroneForSidebar);
    if (!drone?.path?.length) return;
    const first = drone.path[0];
    setMapCenter([first[0], first[1]]);
  }, [drones, selectedDroneForSidebar]);

  const flyDroneToFirstWaypoint = useCallback((droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (!drone?.path?.length) {
      return;
    }
    if (drone.flightStatus === flightStatus.FLYING || drone.flightStatus === flightStatus.TAKEOFF || drone.flightStatus === flightStatus.LANDING) {
      return;
    }
    const firstWaypoint = drone.path[0];
    if (!drone.position) {
      setDrones(prev =>
        prev.map(d =>
          d.id !== droneId ? d : { ...d, position: { lat: firstWaypoint[0], lng: firstWaypoint[1] } }
        )
      );
      setMapCenter([firstWaypoint[0], firstWaypoint[1]]);
      addToDroneLog(droneId, '📍 Дрон размещён на первой точке миссии');
      return;
    }
    const distToFirst = calculateDistance(
      drone.position.lat,
      drone.position.lng,
      firstWaypoint[0],
      firstWaypoint[1]
    );
    if (distToFirst <= FIRST_WAYPOINT_TRANSIT_THRESHOLD_M) {
      setDrones(prev =>
        prev.map(d =>
          d.id !== droneId ? d : { ...d, position: { lat: firstWaypoint[0], lng: firstWaypoint[1] } }
        )
      );
      setMapCenter([firstWaypoint[0], firstWaypoint[1]]);
      addToDroneLog(droneId, '📍 Дрон уже у первой точки миссии');
      return;
    }
    const flightPath = [[drone.position.lat, drone.position.lng], [firstWaypoint[0], firstWaypoint[1]]];
    const missionParams = computeMissionParamsFromPath(flightPath, drone.maxSpeed, drone.battery);
    if (!missionParams || drone.battery < missionParams.batteryConsumption + 10) {
      return;
    }
    setMapCenter([firstWaypoint[0], firstWaypoint[1]]);
    setDrones(prev =>
      prev.map(d => {
        if (d.id !== droneId) return d;
        return {
          ...d,
          flightStatus: flightStatus.TAKEOFF,
          isFlying: true,
          currentMission: {
            startTime: new Date().toISOString(),
            totalWaypoints: 1,
            totalDistance: missionParams.totalDistance,
            estimatedTime: missionParams.estimatedTime,
            missionParams,
            flightPath,
            flyToFirstOnly: true
          },
          currentWaypointIndex: 0,
          flightProgress: 0,
          speed: missionParams.optimalSpeed / 3.6,
          altitude: 50,
          heading: 0,
          missionParameters: missionParams,
          missionStartTime: Date.now(),
          missionElapsedTime: 0
        };
      })
    );
    addToDroneLog(droneId, '📍 Перелёт к первой точке миссии', {
      distance: `${Math.round(distToFirst)} м`
    });
    setTimeout(() => {
      setDrones(prev =>
        prev.map(d => {
          if (d.id !== droneId) return d;
          return { ...d, flightStatus: flightStatus.FLYING, altitude: 100 };
        })
      );
      addToDroneLog(droneId, '🛫 Взлёт выполнен');
      startFlightMovement(droneId);
    }, 2000);
  }, [drones]);

  const stopAllFlights = () => {
    drones.forEach(drone => {
      if (drone.isFlying) {
        stopDroneFlight(drone.id);
      }
    });
  };

  useEffect(() => {
    return () => {
      activeTimersRef.current.forEach(timerId => {
        clearInterval(timerId);
      });
      activeTimersRef.current.clear();
    };
  }, []);

  const handleStart = (templateId = null) => {
    setHasStarted(true);
    setTemplateToApplyId(templateId || null);
  };

  const handleLogout = useCallback(() => {
    clearApiSession();
    backendMissionIdsRef.current = new Map();
    backendContextRef.current = { userId: null, zoneId: null };
    activeTimersRef.current.forEach((id) => clearInterval(id));
    activeTimersRef.current.clear();
    setDrones(createLocalDrones());
    setBackendSync({ status: 'idle', message: '' });
    setHasStarted(false);
    setAuthReady(false);
    setSidebarOpen(false);
    setParkingOpen(false);
    setSelectedDroneForSidebar(null);
    setSelectedDroneForModal(null);
    setBackendZones([]);
    setActiveZoneId(null);
    setZoneFitNonce(0);
    setZoneKmlMessage(null);
    setZoneKmlIsError(false);
    setDrawRectZoneMode(false);
    setDraftRectBoundary(null);
    setRectZoneBusy(false);

    telemetryLastSentAtRef.current = new Map();
    telemetrySendingRef.current = new Map();

    videoRecordingByDroneRef.current = new Map();
    videoUploadInProgressRef.current = new Map();
  }, []);

  const toggleDrawRectZoneMode = useCallback(() => {
    setIsRouteEditMode(false);
    if (drawRectZoneMode) {
      setDrawRectZoneMode(false);
      return;
    }
    setEditingZoneId(null);
    setDraftRectBoundary(null);
    setDrawRectZoneMode(true);
  }, [drawRectZoneMode]);

  const cancelDraftRectZone = useCallback(() => {
    setEditingZoneId(null);
    setDraftRectBoundary(null);
    setDrawRectZoneMode(false);
  }, []);

  const handleDraftRectBoundaryChange = useCallback((nextBoundary) => {
    setDraftRectBoundary(nextBoundary ?? null);
  }, []);

  const handleRectDrawComplete = useCallback(() => {
    setDrawRectZoneMode(false);
  }, []);

  const handleZoneClickToEdit = useCallback((boundary) => {
    if (activeZoneId == null) return;
    if (drawRectZoneMode || templateEditMode || placementMode || isRouteEditMode) return;
    if (!Array.isArray(boundary) || boundary.length < 4) return;
    setEditingZoneId(activeZoneId);
    setDraftRectBoundary(boundary.map(([lng, lat]) => [lng, lat]));
  }, [activeZoneId, drawRectZoneMode, templateEditMode, placementMode, isRouteEditMode]);

  const saveDraftRectZone = useCallback(async () => {
    if (!draftRectBoundary?.length) return;
    setRectZoneBusy(true);
    try {
      if (editingZoneId != null) {
        await updateZoneWithBoundary(editingZoneId, draftRectBoundary);
        const zones = await fetchZonesFromBackend();
        setBackendZones(zones);
        setActiveZoneId(editingZoneId);
        setEditingZoneId(null);
        setDraftRectBoundary(null);
        return;
      }

      const name = newRectZoneName.trim() || 'Зона (прямоугольник)';
      const created = await createZoneWithBoundary({ name, boundary: draftRectBoundary });
      const zones = await fetchZonesFromBackend();
      setBackendZones(zones);
      const newId = created?.id;
      if (newId != null) {
        setActiveZoneId(newId);
        const u = backendContextRef.current.userId;
        if (u != null) {
          backendContextRef.current = { userId: u, zoneId: newId };
        }
      }
      setEditingZoneId(null);
      setDraftRectBoundary(null);
    } catch (err) {
      setZoneKmlMessage(String(err?.message ?? err));
      setZoneKmlIsError(true);
    } finally {
      setRectZoneBusy(false);
    }
  }, [draftRectBoundary, newRectZoneName, editingZoneId]);

  const handleDeleteActiveZone = useCallback(async () => {
    if (activeZoneId == null) return;
    const targetZone = backendZones.find((z) => z.id === activeZoneId);
    const title = targetZone?.name ? `«${targetZone.name}»` : `ID ${activeZoneId}`;
    const confirmed = window.confirm(`Удалить зону ${title}? Это действие нельзя отменить.`);
    if (!confirmed) return;

    setRectZoneBusy(true);
    try {
      await deleteZoneInBackend(activeZoneId);
      const zones = await fetchZonesFromBackend();
      setBackendZones(zones);

      const nextActiveZoneId = zones.length > 0 ? zones[0].id : null;
      setActiveZoneId(nextActiveZoneId);
      const userId = backendContextRef.current.userId ?? null;
      backendContextRef.current = { userId, zoneId: nextActiveZoneId };

      setEditingZoneId(null);
      setDrawRectZoneMode(false);
      setDraftRectBoundary(null);
    } catch (err) {
      setZoneKmlMessage(String(err?.message ?? err));
      setZoneKmlIsError(true);
    } finally {
      setRectZoneBusy(false);
    }
  }, [activeZoneId, backendZones]);

  const pendingKmlActionRef = useRef('create');

  const handleActiveZoneSelect = useCallback((e) => {
    const id = Number(e.target.value);
    if (!Number.isFinite(id)) return;
    setActiveZoneId(id);
    setZoneFitNonce((n) => n + 1);
    const u = backendContextRef.current.userId;
    if (u != null) {
      backendContextRef.current = { userId: u, zoneId: id };
    }
  }, []);

  const openKmlPicker = useCallback((action) => {
    pendingKmlActionRef.current = action;
    zoneKmlInputRef.current?.click();
  }, []);

  const handleZoneKmlFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const action = pendingKmlActionRef.current;
      setZoneKmlBusy(true);
      setZoneKmlMessage(null);
      setZoneKmlIsError(false);
      try {
        if (action === 'create') {
          const baseName = newZoneKmlName.trim() || file.name.replace(/\.kml$/i, '') || 'Зона из KML';
          const created = await createZoneWithKml({ name: baseName, description: '', file });
          const zones = await fetchZonesFromBackend();
          setBackendZones(zones);
          const newId = created?.id;
          if (newId != null) {
            setActiveZoneId(newId);
            const u = backendContextRef.current.userId;
            if (u != null) {
              backendContextRef.current = { userId: u, zoneId: newId };
            }
            setZoneFitNonce((n) => n + 1);
          }
          setZoneKmlMessage(`Зона «${created?.name ?? baseName}» создана.`);
          setZoneKmlIsError(false);
        } else {
          if (activeZoneId == null) {
            throw new Error('Сначала выберите зону в списке');
          }
          await updateZoneWithKml(activeZoneId, file);
          const zones = await fetchZonesFromBackend();
          setBackendZones(zones);
          setZoneFitNonce((n) => n + 1);
          setZoneKmlMessage('Контур выбранной зоны обновлён из KML.');
          setZoneKmlIsError(false);
        }
      } catch (err) {
        setZoneKmlMessage(String(err?.message ?? err));
        setZoneKmlIsError(true);
      } finally {
        setZoneKmlBusy(false);
      }
    },
    [activeZoneId, newZoneKmlName]
  );

  const handleDroneClick = (drone) => {
    setSelectedDroneForModal(drone);
  };

  if (!authReady) {
    return <AuthScreen onLoggedIn={() => setAuthReady(true)} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-transparent text-white px-2 sm:px-3 py-2 sm:py-3">
      {/* Backdrop for mobile overlays */}
      {(sidebarOpen || parkingOpen) && (
        <button
          type="button"
          aria-label="Закрыть"
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => { setSidebarOpen(false); setParkingOpen(false); }}
        />
      )}
      {authUserLabel && (
        <div className="fixed top-2 right-2 sm:top-3 sm:right-3 z-[1200]">
          <div className="w-[300px] rounded-2xl border border-[rgba(0,188,125,0.4)] bg-emerald-900/30 px-3 py-2 text-sm text-emerald-100 shadow-lg shadow-emerald-900/20 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-950/70 text-2xl leading-none">
                  👤
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-300/90">Статус аккаунта</p>
                  <p className="truncate">
                    Вы вошли: <strong>{authUserLabel}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-red-500/60 bg-red-900/30 px-3 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-800/50 hover:text-white"
              >
                <span className="text-base leading-none">↩</span>
                <span>Выход</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-2 lg:gap-3 min-h-0 overflow-hidden flex-col lg:flex-row">
        {hasStarted && (
          <div
            className={`fixed left-0 top-0 bottom-0 z-50 w-[85%] max-w-sm transform transition-transform duration-300 ease-out lg:relative lg:translate-x-0 lg:w-72 lg:max-w-none lg:flex-shrink-0 ${
              exitingToTemplates ? 'opacity-0 pointer-events-none -translate-x-full' : ''
            } ${parkingOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
            style={{
              transitionDuration: exitingToTemplates ? `${EXIT_PANELS_MS}ms` : undefined,
              paddingTop: 'env(safe-area-inset-top, 0px)',
            }}
          >
            <DroneParking
              drones={drones}
              onPlaceDrone={startDronePlacement}
              onRemoveDrone={removeDroneFromMap}
              onCreateDrone={createDroneFromParking}
              onBackToTemplates={() => {
                setExitingToTemplates(true);
                setParkingOpen(false);
                setTimeout(() => {
                  setHasStarted(false);
                  setExitingToTemplates(false);
                }, EXIT_PANELS_MS);
              }}
              onClose={() => setParkingOpen(false)}
            />
          </div>
        )}
        <main className="flex-1 bg-transparent p-2 sm:p-3 rounded flex flex-col min-w-0 min-h-0">
          {templateEditMode ? (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className="flex-1 min-h-0">
                <YandexMap
                  drones={[]}
                  mapCenter={mapCenter}
                  mapZoom={mapZoom}
                  onMapClick={handleMapClick}
                  onZoneClick={handleZoneClickToEdit}
                  onDraftRectBoundaryChange={handleDraftRectBoundaryChange}
                  onRectDrawComplete={handleRectDrawComplete}
                  editingPath={templateDraftPath}
                  forceResize={false}
                  zoneBoundary={activeZoneBoundary}
                  zoneFitNonce={zoneFitNonce}
                  draftRectBoundary={draftRectBoundary}
                  drawRectZoneMode={drawRectZoneMode}
                />
              </div>
              <div className="absolute bottom-4 left-4 right-4 z-10 bg-gray-800/95 border border-gray-600 rounded-xl p-4 shadow-xl max-w-md">
                <h3 className="font-semibold text-white mb-2">
                  {templateEditMode === 'create' ? 'Создание шаблона маршрута' : 'Редактирование маршрута'}
                </h3>
                <p className="text-gray-400 text-sm mb-3">
                  Кликайте по карте, чтобы добавить точки маршрута патрулирования.
                </p>
                <p className="text-white/80 text-sm mb-3">Точек: <strong>{templateDraftPath.length}</strong></p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    onClick={undoTemplateDraftPoint}
                    disabled={!templateDraftPath.length}
                    className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                  >
                    Отменить последнюю
                  </button>
                </div>
                <div className="mb-3">
                  <label className="block text-sm text-gray-400 mb-1">Название шаблона</label>
                  <input
                    type="text"
                    value={templateDraftName}
                    onChange={(e) => setTemplateDraftName(e.target.value)}
                    placeholder="Например: Облёт периметра"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveTemplateDraft}
                    disabled={templateDraftPath.length < 2}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                  >
                    Сохранить шаблон
                  </button>
                  <button
                    type="button"
                    onClick={cancelTemplateEdit}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative min-h-0 overflow-hidden">
              <div
                className={`absolute inset-0 flex items-center justify-center transition-all ease-in-out ${
                  hasStarted ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
                style={{ transitionDuration: noTransitionTemplateSwitch ? '0ms' : `${VIEW_TRANSITION_MS}ms` }}
              >
                <ShabloneScreen
                  onStart={handleStart}
                  templates={missionTemplates}
                  onStartCreateTemplate={startCreateTemplate}
                  onEditTemplateRoute={startEditTemplateRoute}
                  onDeleteTemplate={deleteMissionTemplate}
                />
              </div>
              <div
                className={`absolute inset-0 flex flex-col min-h-0 transition-all ease-in-out ${
                  hasStarted && !exitingToTemplates ? 'opacity-100 translate-x-0' : 'opacity-0 pointer-events-none translate-x-full'
                }`}
                style={{ transitionDuration: noTransitionTemplateSwitch ? '0ms' : `${VIEW_TRANSITION_MS}ms` }}
              >
            <div className="w-full flex flex-col gap-2 flex-1 min-h-0">
              {placementMode && droneToPlace && (
                <div className="bg-yellow-900/70 border border-yellow-500 rounded-lg p-3 mb-2 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm text-yellow-200">
                          Кликните на карте, чтобы разместить дрон
                          {(() => {
                            const d = drones.find(d => d.id === droneToPlace);
                            return d ? ` "${d.name}"` : '';
                          })()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={cancelDronePlacement}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2 mb-2 relative z-[1100]">
                <div className="flex flex-col lg:flex-row gap-2 lg:items-start">
                  <div className="flex-1 min-w-0">
                    <SearchBox
                      setMapCenter={setMapCenter}
                      setMapZoom={setMapZoom}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 lg:shrink-0">
                    <button
                      type="button"
                      onClick={toggleDrawRectZoneMode}
                      className={`px-3 py-2 min-h-[52px] rounded-lg text-white text-base whitespace-nowrap border ${
                        drawRectZoneMode
                          ? 'bg-amber-900 border-amber-500 ring-2 ring-amber-400/70'
                          : 'bg-amber-950/90 border-amber-800 hover:bg-amber-900'
                      }`}
                    >
                      {drawRectZoneMode ? 'Отменить рисование' : 'Прямоугольник'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 relative min-h-0">
                {(drawRectZoneMode || draftRectBoundary) && (
                  <div className="absolute top-2 left-2 z-[130] w-[min(92vw,510px)] rounded-xl border border-amber-600/40 bg-gray-900/80 p-3 backdrop-blur-sm">
                    {drawRectZoneMode && !draftRectBoundary && (
                      <p className="text-xs text-amber-200">
                        Зажмите кнопку мыши на карте, потяните и отпустите, чтобы нарисовать прямоугольник.
                      </p>
                    )}
                    {draftRectBoundary && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
                          {editingZoneId == null && (
                            <input
                              type="text"
                              value={newRectZoneName}
                              onChange={(e) => setNewRectZoneName(e.target.value)}
                              placeholder="Имя зоны"
                              className="px-3 py-2 bg-gray-800 border border-amber-700/60 rounded-lg text-white text-sm min-h-[42px] w-full sm:w-52"
                            />
                          )}
                          <button
                            type="button"
                            onClick={saveDraftRectZone}
                            disabled={rectZoneBusy || zoneKmlBusy}
                            className="px-3 py-2 min-h-[42px] bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
                          >
                            {editingZoneId != null ? 'Сохранить изменения' : 'Сохранить зону'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelDraftRectZone}
                            disabled={rectZoneBusy}
                            className="px-3 py-2 min-h-[42px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm"
                          >
                            Отмена редактирования
                          </button>
                          {editingZoneId != null && (
                            <button
                              type="button"
                              onClick={handleDeleteActiveZone}
                              disabled={activeZoneId == null || rectZoneBusy || zoneKmlBusy}
                              className="px-3 py-2 min-h-[42px] bg-red-900/80 hover:bg-red-800 border border-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm"
                            >
                              Удалить зону
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="absolute top-2 right-2 z-[100] flex justify-end">
                  <div className="relative">
                    <WeatherWidget
                      latitude={mapCenter[0]}
                      longitude={mapCenter[1]}
                      onFlightConditionsChange={handleWeatherFlightConditions}
                    />
                  </div>
                </div>
                <YandexMap
                  drones={drones.filter(d => d.isVisible)}
                  mapCenter={mapCenter}
                  mapZoom={mapZoom}
                  onMapClick={handleMapClick}
                  onZoneClick={handleZoneClickToEdit}
                  onDraftRectBoundaryChange={handleDraftRectBoundaryChange}
                  onRectDrawComplete={handleRectDrawComplete}
                  onMapCenterChange={setMapCenter}
                  selectedDroneId={selectedDroneForSidebar}
                  forceResize={true}
                  routeEditMode={isRouteEditMode}
                  previewPath={templateToApplyId ? (missionTemplates.find(t => t.id === templateToApplyId)?.path) ?? null : null}
                  zoneBoundary={activeZoneBoundary}
                  zoneFitNonce={zoneFitNonce}
                  draftRectBoundary={draftRectBoundary}
                  drawRectZoneMode={drawRectZoneMode}
                />
              </div>

              {/* Кнопки управления под картой (мобильные), в потоке — карта сжимается */}
              <div
                className="flex-shrink-0 flex justify-between items-center gap-2 lg:hidden pt-2"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.5rem)' }}
              >
                <button
                  type="button"
                  onClick={() => { setParkingOpen(true); setSidebarOpen(false); }}
                  className="min-h-[48px] flex-1 min-w-0 px-3 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl shadow-lg text-white font-medium flex items-center justify-center gap-1.5"
                >
                  <span>🛸</span>
                  <span>Стоянка</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExitingToTemplates(true);
                    setParkingOpen(false);
                    setSidebarOpen(false);
                    setTimeout(() => {
                      setHasStarted(false);
                      setExitingToTemplates(false);
                    }, EXIT_PANELS_MS);
                  }}
                  className="min-h-[48px] flex-1 min-w-0 px-3 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl shadow-lg text-white font-medium flex items-center justify-center gap-1.5"
                >
                  <span>←</span>
                  <span className="truncate">Назад</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setSidebarOpen(true); setParkingOpen(false); }}
                  className="min-h-[48px] flex-1 min-w-0 px-3 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg text-white font-medium flex items-center justify-center gap-1.5"
                >
                  <span>⚙️</span>
                  <span>Панель</span>
                </button>
              </div>
            </div>
              </div>
            </div>
          )}
        </main>

        {hasStarted && (
          <div
            className={`fixed right-0 top-0 bottom-0 z-50 w-[85%] max-w-sm transform transition-transform duration-300 ease-out lg:relative lg:translate-x-0 lg:w-80 lg:max-w-none lg:flex-shrink-0 ${
              exitingToTemplates ? 'opacity-0 pointer-events-none translate-x-full' : ''
            } ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
            style={{
              transitionDuration: exitingToTemplates ? `${EXIT_PANELS_MS}ms` : undefined,
              paddingTop: 'env(safe-area-inset-top, 0px)',
            }}
          >
            <div className="flex h-full min-h-0 flex-col pt-[72px]">
              <div className="min-h-0 flex-1">
                <Sidebar
                  dronesData={drones}
                  selectedDroneId={selectedDroneForSidebar}
                  onSelectDrone={setSelectedDroneForSidebar}
                  missionLog={globalMissionLog}
                  activeFlights={getActiveFlights()}
                  onStartFlight={startDroneFlight}
                  onPauseFlight={pauseDroneFlight}
                  onResumeFlight={resumeDroneFlight}
                  onStopFlight={stopDroneFlight}
                  onStopAllFlights={stopAllFlights}
                  onAddRoutePoint={addRoutePoint}
                  onUndoLastPoint={undoLastPoint}
                  onClearRoute={clearRoute}
                  onClearLogs={() => setGlobalMissionLog([])}
                  onDroneClick={handleDroneClick}
                  isRouteEditMode={isRouteEditMode}
                  onToggleRouteMode={() => setIsRouteEditMode(prev => !prev)}
                  onCenterToFirstWaypoint={centerMapToFirstWaypoint}
                  onFlyToFirstWaypoint={flyDroneToFirstWaypoint}
                  flightAllowedByWeather={weatherFlightSafe}
                  weatherFlightReasons={weatherFlightReasons}
                  onClose={() => setSidebarOpen(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedDroneForModal && (
        <DroneModal
          drone={selectedDroneForModal}
          onClose={() => setSelectedDroneForModal(null)}
        />
      )}

      {false && hasStarted && (
        <footer
          className={`mt-2 bg-gradient-to-r from-gray-700 to-gray-800 p-3 rounded text-center text-white transition-all ease-in-out ${
            exitingToTemplates ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-100 translate-y-0'
          }`}
          style={{ transitionDuration: exitingToTemplates ? `${EXIT_PANELS_MS}ms` : `${VIEW_TRANSITION_MS}ms` }}
        >
          <div className="md:flex-row justify-between items-center">
            <div>
              © 2026 Система управления дронами.
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;