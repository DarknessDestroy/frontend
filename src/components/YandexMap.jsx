import { useEffect, useRef, useState } from 'react';

if (typeof window !== 'undefined') {
  if (!window.yandexMapsLoading) window.yandexMapsLoading = false;
  if (!window.yandexMapsLoaded) window.yandexMapsLoaded = false;
}

/** boundary с API: [[lng, lat], ...] — замкнутый полигон. */
function boundaryToYandexRing(boundary) {
  if (!Array.isArray(boundary) || boundary.length < 4) return null;
  return boundary.map(([lng, lat]) => [lat, lng]);
}

/** Кольцо Яндекс-карт [[lat, lng], ...] -> boundary API [[lng, lat], ...]. */
function yandexRingToBoundary(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const normalized = ring.map((pair) => [pair?.[1], pair?.[0]]);
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (!first || !last) return null;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    normalized.push([first[0], first[1]]);
  }
  return normalized;
}

function rectCornersToBoundary(cornerA, cornerB) {
  if (!cornerA || !cornerB) return null;
  const minLat = Math.min(cornerA.lat, cornerB.lat);
  const maxLat = Math.max(cornerA.lat, cornerB.lat);
  const minLng = Math.min(cornerA.lng, cornerB.lng);
  const maxLng = Math.max(cornerA.lng, cornerB.lng);
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

function isPointInsideBoundary(boundary, point) {
  if (!Array.isArray(boundary) || boundary.length < 4 || !point) return false;
  const vertices = boundary.slice(0, -1);
  if (vertices.length < 3) return false;

  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i]?.[0];
    const yi = vertices[i]?.[1];
    const xj = vertices[j]?.[0];
    const yj = vertices[j]?.[1];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }

  return inside;
}

export function YandexMap({
  drones,
  mapCenter,
  mapZoom = 13,
  onMapClick,
  onDraftRectBoundaryChange,
  onRectDrawComplete,
  onZoneClick,
  onMapCenterChange,
  onDronePositionChange,
  placementMode = false,
  selectedDroneId = null,
  forceResize = false,
  editingPath = null,
  previewPath = null,
  routeEditMode = false,
  /** Полигон активной зоны (boundary из backend, [lng, lat]). */
  zoneBoundary = null,
  /** Увеличивайте после загрузки KML / смены зоны — карта подгонит вид под полигон. */
  zoneFitNonce = 0,
  /** Превью прямоугольника до сохранения зоны (тот же формат boundary). */
  draftRectBoundary = null,
  /** Режим рисования прямоугольника мышью (зажал-потянул-отпустил). */
  drawRectZoneMode = false,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const droneMarkersRef = useRef({});
  const routePolylinesRef = useRef({});
  const editingPolylineRef = useRef(null);
  const previewPolylineRef = useRef(null);
  const zonePolygonRef = useRef(null);
  const draftRectPolygonRef = useRef(null);
  const draftRectGeometryChangeHandlerRef = useRef(null);
  const isSyncingDraftRectRef = useRef(false);
  const rectDrawStateRef = useRef({ active: false, start: null, last: null });
  const lastZoneFitNonceRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState(null);
  const lastMapCenterRef = useRef(mapCenter);
  const lastMapZoomRef = useRef(mapZoom);

  const API_KEY = '2b39244b-bae4-482a-b3a8-d4b21860b4e8';

  useEffect(() => {
    if (window.ymaps && window.yandexMapsLoaded) {
      setTimeout(initMap, 100);
      return;
    }
    if (window.yandexMapsLoading) {
      const interval = setInterval(() => {
        if (window.ymaps && window.yandexMapsLoaded) {
          clearInterval(interval);
          initMap();
        }
      }, 100);
      return;
    }

    window.yandexMapsLoading = true;
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${API_KEY}&lang=ru_RU`;
    script.async = true;

    script.onload = () => {
      if (!window.ymaps) {
        setError('API Яндекс.Карт не загрузилось');
        return;
      }
      window.ymaps.ready(() => {
        window.yandexMapsLoaded = true;
        window.yandexMapsLoading = false;
        initMap();
      });
    };

    script.onerror = () => {
      yandexMapsLoading = false;
      setError('Не удалось загрузить API Яндекс.Карт');
    };

    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (!mapContainerRef.current || !window.ymaps) return;
    if (mapInstanceRef.current) return;

    const map = new window.ymaps.Map(mapContainerRef.current, {
      center: mapCenter || [55.751244, 37.618423],
      zoom: mapZoom,
      controls: [],
    });

    mapInstanceRef.current = map;
    lastMapCenterRef.current = mapCenter;
    lastMapZoomRef.current = mapZoom;
    setMapLoaded(true);
    drones.forEach(drone => {
      if (!drone.position) return;
      createDroneMarker(map, drone);
    });
    drones.forEach(drone => {
      if (drone.path && drone.path.length > 1) {
        createDroneRoute(map, drone);
      }
    });
  };

  const createDroneMarker = (map, drone) => {
    if (!drone.position || !drone.isVisible) return;

    const placemark = new window.ymaps.Placemark(
      [drone.position.lat, drone.position.lng],
      {
        balloonContent: `
          <div style="padding: 10px; font-family: Arial;">
            <strong>${drone.name}</strong><br/>
            Статус: ${drone.status}<br/>
            Батарея: ${drone.battery}%
          </div>
        `,
        hintContent: drone.name
      },
      {
        iconLayout: 'default#image',
        iconImageHref: '/ico.png',
        iconImageSize: [35, 35],
        iconImageOffset: [-17, -17],
        draggable: drone.status !== 'в полете',
        balloonOffset: [0, -50],
        balloonAutoPan: false,
        hideIconOnBalloonOpen: false
      }
    );
    if (drone.status !== 'в полете') {
      placemark.events.add('dragend', (e) => {
        const coords = e.get('target').geometry.getCoordinates();
        if (onDronePositionChange) {
          onDronePositionChange(drone.id, { lat: coords[0], lng: coords[1] });
        }
      });
    }

    map.geoObjects.add(placemark);
    droneMarkersRef.current[drone.id] = placemark;
  };

  const createDroneRoute = (map, drone) => {
    if (!drone.path || drone.path.length < 2) return;
    if (routePolylinesRef.current[drone.id]) {
      map.geoObjects.remove(routePolylinesRef.current[drone.id]);
    }

    const polyline = new window.ymaps.Polyline(
      drone.path.map(p => [p[0], p[1]]),
      {},
      {
        strokeColor: drone.id === selectedDroneId ? '#FF0000' : '#3b82f6',
        strokeWidth: 3,
        strokeOpacity: 0.7
      }
    );

    map.geoObjects.add(polyline);
    routePolylinesRef.current[drone.id] = polyline;
  };

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    drones.forEach(drone => {
      const existingMarker = droneMarkersRef.current[drone.id];

      if (drone.isVisible && drone.position) {
        if (existingMarker) {
          existingMarker.geometry.setCoordinates([drone.position.lat, drone.position.lng]);
        } else {
          createDroneMarker(map, drone);
        }
      } else if (existingMarker) {
        map.geoObjects.remove(existingMarker);
        delete droneMarkersRef.current[drone.id];
      }
      if (drone.path && drone.path.length > 1) {
        createDroneRoute(map, drone);
      } else if (routePolylinesRef.current[drone.id]) {
        map.geoObjects.remove(routePolylinesRef.current[drone.id]);
        delete routePolylinesRef.current[drone.id];
      }
    });
    Object.keys(droneMarkersRef.current).forEach(droneId => {
      if (!drones.some(d => d.id.toString() === droneId)) {
        map.geoObjects.remove(droneMarkersRef.current[droneId]);
        delete droneMarkersRef.current[droneId];
      }
    });
    Object.keys(routePolylinesRef.current).forEach(droneId => {
      if (!drones.some(d => d.id.toString() === droneId)) {
        map.geoObjects.remove(routePolylinesRef.current[droneId]);
        delete routePolylinesRef.current[droneId];
      }
    });

  }, [drones, selectedDroneId, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.ymaps) return;
    const map = mapInstanceRef.current;
    const path = editingPath && editingPath.length > 0 ? editingPath : null;

    if (editingPolylineRef.current) {
      map.geoObjects.remove(editingPolylineRef.current);
      editingPolylineRef.current = null;
    }
    if (path && path.length >= 2) {
      const polyline = new window.ymaps.Polyline(
        path.map(p => [p[0], p[1]]),
        {},
        { strokeColor: '#22c55e', strokeWidth: 4, strokeOpacity: 0.9 }
      );
      map.geoObjects.add(polyline);
      editingPolylineRef.current = polyline;
    }
    return () => {
      if (editingPolylineRef.current) {
        try { map.geoObjects.remove(editingPolylineRef.current); } catch { }
        editingPolylineRef.current = null;
      }
    };
  }, [mapLoaded, editingPath]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.ymaps) return;
    const map = mapInstanceRef.current;
    const path = previewPath && previewPath.length >= 2 ? previewPath : null;

    if (previewPolylineRef.current) {
      map.geoObjects.remove(previewPolylineRef.current);
      previewPolylineRef.current = null;
    }
    if (path) {
      const polyline = new window.ymaps.Polyline(
        path.map(p => [p[0], p[1]]),
        {},
        { strokeColor: '#22c55e', strokeWidth: 4, strokeOpacity: 0.8 }
      );
      map.geoObjects.add(polyline);
      previewPolylineRef.current = polyline;
    }
    return () => {
      if (previewPolylineRef.current) {
        try { map.geoObjects.remove(previewPolylineRef.current); } catch { }
        previewPolylineRef.current = null;
      }
    };
  }, [mapLoaded, previewPath]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.ymaps) return;
    const map = mapInstanceRef.current;

    if (zonePolygonRef.current) {
      try {
        map.geoObjects.remove(zonePolygonRef.current);
      } catch {
        /* ignore */
      }
      zonePolygonRef.current = null;
    }

    const ring = boundaryToYandexRing(zoneBoundary);
    if (!ring) {
      lastZoneFitNonceRef.current = null;
      return;
    }

    const polygon = new window.ymaps.Polygon(
      [ring],
      {},
      {
        fillColor: 'rgba(34, 197, 94, 0.18)',
        strokeColor: '#22c55e',
        strokeWidth: 2,
        strokeOpacity: 0.95,
        // Иначе полигон «съедает» клики: нельзя разместить дрон и поставить точки маршрута.
        interactivityModel: 'default#transparent',
      }
    );
    map.geoObjects.add(polygon);
    zonePolygonRef.current = polygon;

    const shouldFit =
      ring &&
      lastZoneFitNonceRef.current !== zoneFitNonce;
    if (shouldFit) {
      lastZoneFitNonceRef.current = zoneFitNonce;
      try {
        const bounds = polygon.geometry.getBounds();
        if (bounds) {
          map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24 });
        }
      } catch {
        /* ignore */
      }
    }

    return () => {
      if (zonePolygonRef.current) {
        try {
          map.geoObjects.remove(zonePolygonRef.current);
        } catch {
          /* ignore */
        }
        zonePolygonRef.current = null;
      }
    };
  }, [mapLoaded, zoneBoundary, zoneFitNonce]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.ymaps) return;
    const map = mapInstanceRef.current;

    const ring = boundaryToYandexRing(draftRectBoundary);
    if (!ring) {
      if (draftRectPolygonRef.current) {
        if (draftRectGeometryChangeHandlerRef.current) {
          try {
            draftRectPolygonRef.current.geometry.events.remove('change', draftRectGeometryChangeHandlerRef.current);
          } catch {
            /* ignore */
          }
          draftRectGeometryChangeHandlerRef.current = null;
        }
        try {
          map.geoObjects.remove(draftRectPolygonRef.current);
        } catch {
          /* ignore */
        }
        draftRectPolygonRef.current = null;
      }
      return;
    }

    if (!draftRectPolygonRef.current) {
      const polygon = new window.ymaps.Polygon(
        [ring],
        {},
        {
          fillColor: 'rgba(251, 191, 36, 0.22)',
          strokeColor: '#f59e0b',
          strokeWidth: 3,
          strokeOpacity: 0.95,
          strokeStyle: 'shortdash',
          interactivityModel: 'default#geoObject',
        }
      );
      map.geoObjects.add(polygon);
      draftRectPolygonRef.current = polygon;

      const handleDraftRectGeometryChange = () => {
        if (isSyncingDraftRectRef.current) return;
        if (typeof onDraftRectBoundaryChange !== 'function') return;
        const coords = polygon.geometry.getCoordinates();
        const nextRing = Array.isArray(coords) ? coords[0] : null;
        const nextBoundary = yandexRingToBoundary(nextRing);
        if (nextBoundary) onDraftRectBoundaryChange(nextBoundary);
      };
      draftRectGeometryChangeHandlerRef.current = handleDraftRectGeometryChange;
      polygon.geometry.events.add('change', handleDraftRectGeometryChange);
    } else {
      const polygon = draftRectPolygonRef.current;
      const currentCoords = polygon.geometry.getCoordinates();
      const currentRing = Array.isArray(currentCoords) ? currentCoords[0] : null;
      const currentBoundary = yandexRingToBoundary(currentRing);
      const normalizedTargetBoundary = yandexRingToBoundary(ring);
      if (JSON.stringify(currentBoundary) !== JSON.stringify(normalizedTargetBoundary)) {
        isSyncingDraftRectRef.current = true;
        try {
          polygon.geometry.setCoordinates([ring]);
        } finally {
          isSyncingDraftRectRef.current = false;
        }
      }
    }

    try {
      draftRectPolygonRef.current.editor.startEditing();
    } catch {
      /* ignore */
    }
  }, [mapLoaded, draftRectBoundary, onDraftRectBoundaryChange]);

  const createDroneIcon = (drone, isActive = false) => {
    const color = getDroneColor(drone.id);
    const isFlying = drone.isFlying;

    return L.divIcon({
      html: `
      <div style="
        width: ${isFlying ? '40px' : '32px'};
        height: ${isFlying ? '40px' : '32px'};
        background: ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        transform: rotate(${drone.heading || 0}deg);
        ${isFlying ? 'animation: pulse 2s infinite;' : ''}
        ${isActive ? 'box-shadow: 0 0 0 3px #FFD700;' : ''}
      ">
        <div style="
          width: ${isFlying ? '16px' : '12px'};
          height: ${isFlying ? '16px' : '12px'};
          background: white;
          border-radius: 50%;
          transform: rotate(-${drone.heading || 0}deg);
        "></div>
        ${isFlying ? `
          <div style="
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255,255,255,0.9);
            color: ${color};
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: bold;
            white-space: nowrap;
          ">
            ${Math.round((drone.speed || 0) * 3.6)} км/ч
          </div>
        ` : ''}
      </div>
      ${isFlying ? `
        <div style="
          position: absolute;
          bottom: -25px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          white-space: nowrap;
        ">
          ${drone.altitude || 0} м
        </div>
      ` : ''}
    `,
      iconSize: isFlying ? [40, 60] : [32, 32],
      iconAnchor: isFlying ? [20, 40] : [16, 16],
      className: 'drone-marker'
    });
  };

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !mapCenter) return;
    const shouldUpdateCenter =
      lastMapCenterRef.current[0] !== mapCenter[0] ||
      lastMapCenterRef.current[1] !== mapCenter[1];

    const shouldUpdateZoom = lastMapZoomRef.current !== mapZoom;

    if (shouldUpdateCenter || shouldUpdateZoom) {
      if (shouldUpdateCenter) {
        mapInstanceRef.current.setCenter(mapCenter);
        lastMapCenterRef.current = mapCenter;
      }
      if (shouldUpdateZoom) {
        mapInstanceRef.current.setZoom(mapZoom);
        lastMapZoomRef.current = mapZoom;
      }
    }
  }, [mapCenter, mapZoom, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;
    if (drawRectZoneMode) return;

    const map = mapInstanceRef.current;
    const handleClick = (e) => {
      const coords = e.get('coords');
      if (!Array.isArray(coords) || coords.length < 2) return;
      const clickPoint = { lat: coords[0], lng: coords[1] };
      if (
        typeof onZoneClick === 'function' &&
        isPointInsideBoundary(zoneBoundary, clickPoint)
      ) {
        onZoneClick(zoneBoundary);
        return;
      }
      if (typeof onMapClick === 'function') {
        onMapClick(clickPoint);
      }
    };

    map.events.add('click', handleClick);

    return () => map.events.remove('click', handleClick);
  }, [onMapClick, onZoneClick, zoneBoundary, mapLoaded, drawRectZoneMode]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;
    if (!drawRectZoneMode) return;
    const map = mapInstanceRef.current;
    const MIN_RECT_SPAN = 1e-7;

    const finishRectDraw = (endPoint) => {
      if (!rectDrawStateRef.current.active || !rectDrawStateRef.current.start) return;

      const start = rectDrawStateRef.current.start;
      const end = endPoint || rectDrawStateRef.current.last;
      rectDrawStateRef.current = { active: false, start: null, last: null };

      try {
        map.behaviors.enable('drag');
      } catch {
        /* ignore */
      }

      if (!end) {
        if (typeof onDraftRectBoundaryChange === 'function') onDraftRectBoundaryChange(null);
        return;
      }

      const latSpan = Math.abs(end.lat - start.lat);
      const lngSpan = Math.abs(end.lng - start.lng);
      if (latSpan < MIN_RECT_SPAN || lngSpan < MIN_RECT_SPAN) {
        if (typeof onDraftRectBoundaryChange === 'function') onDraftRectBoundaryChange(null);
        return;
      }

      const boundary = rectCornersToBoundary(start, end);
      if (boundary && typeof onDraftRectBoundaryChange === 'function') {
        onDraftRectBoundaryChange(boundary);
      }
      if (typeof onRectDrawComplete === 'function') {
        onRectDrawComplete();
      }
    };

    const handleMouseDown = (e) => {
      const coords = e.get('coords');
      if (!Array.isArray(coords) || coords.length < 2) return;
      rectDrawStateRef.current = {
        active: true,
        start: { lat: coords[0], lng: coords[1] },
        last: { lat: coords[0], lng: coords[1] },
      };
      if (typeof onDraftRectBoundaryChange === 'function') {
        onDraftRectBoundaryChange(null);
      }
      try {
        map.behaviors.disable('drag');
      } catch {
        /* ignore */
      }
    };

    const handleMouseMove = (e) => {
      if (!rectDrawStateRef.current.active || !rectDrawStateRef.current.start) return;
      const coords = e.get('coords');
      if (!Array.isArray(coords) || coords.length < 2) return;
      const current = { lat: coords[0], lng: coords[1] };
      rectDrawStateRef.current.last = current;
      const boundary = rectCornersToBoundary(rectDrawStateRef.current.start, current);
      if (boundary && typeof onDraftRectBoundaryChange === 'function') {
        onDraftRectBoundaryChange(boundary);
      }
    };

    const handleMouseUp = (e) => {
      const coords = e.get('coords');
      const end =
        Array.isArray(coords) && coords.length >= 2 ? { lat: coords[0], lng: coords[1] } : null;
      finishRectDraw(end);
    };

    const handleWindowMouseUp = () => {
      finishRectDraw(null);
    };

    map.events.add('mousedown', handleMouseDown);
    map.events.add('mousemove', handleMouseMove);
    map.events.add('mouseup', handleMouseUp);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      map.events.remove('mousedown', handleMouseDown);
      map.events.remove('mousemove', handleMouseMove);
      map.events.remove('mouseup', handleMouseUp);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      rectDrawStateRef.current = { active: false, start: null, last: null };
      try {
        map.behaviors.enable('drag');
      } catch {
        /* ignore */
      }
    };
  }, [mapLoaded, drawRectZoneMode, onDraftRectBoundaryChange, onRectDrawComplete]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || typeof onMapCenterChange !== 'function') return;

    const map = mapInstanceRef.current;
    const handleMoveEnd = () => {
      const center = map.getCenter();
      if (center && Array.isArray(center) && center.length >= 2) {
        onMapCenterChange([center[0], center[1]]);
      }
    };

    map.events.add('actionend', handleMoveEnd);
    return () => map.events.remove('actionend', handleMoveEnd);
  }, [onMapCenterChange, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !mapContainerRef.current) return;

    const updateMapSize = () => {
      if (mapInstanceRef.current && mapContainerRef.current) {
        try {
          const map = mapInstanceRef.current;
          const container = mapContainerRef.current;
          const width = container.offsetWidth;
          const height = container.offsetHeight;
          
          if (width > 0 && height > 0) {
            map.container.fitToViewport();
          }
        } catch (error) {
          try {
            const map = mapInstanceRef.current;
            const container = mapContainerRef.current;
            if (map && container) {
              const width = container.offsetWidth;
              const height = container.offsetHeight;
              
              if (width > 0 && height > 0) {
                map.container.setSize([width, height]);
              }
            }
          } catch (e) {
            console.warn('Не удалось обновить размер карты:', e);
          }
        }
      }
    };
    window.addEventListener('resize', updateMapSize);
    let resizeObserver = null;
    if (mapContainerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        // Небольшая задержка для завершения CSS-анимаций
        setTimeout(updateMapSize, 100);
      });
      resizeObserver.observe(mapContainerRef.current);
    } else {
      const intervalId = setInterval(() => {
        if (mapContainerRef.current && mapInstanceRef.current) {
          updateMapSize();
        }
      }, 500);
      
      return () => {
        clearInterval(intervalId);
        window.removeEventListener('resize', updateMapSize);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
      };
    }

    return () => {
      window.removeEventListener('resize', updateMapSize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !mapContainerRef.current) return;
    const timeoutId = setTimeout(() => {
      if (mapInstanceRef.current && mapContainerRef.current) {
        try {
          const map = mapInstanceRef.current;
          const container = mapContainerRef.current;
          const width = container.offsetWidth;
          const height = container.offsetHeight;
          
          if (width > 0 && height > 0) {
            map.container.fitToViewport();
          }
        } catch (error) {
          try {
            const map = mapInstanceRef.current;
            const container = mapContainerRef.current;
            if (map && container) {
              const width = container.offsetWidth;
              const height = container.offsetHeight;
              if (width > 0 && height > 0) {
                map.container.setSize([width, height]);
              }
            }
          } catch (e) {
            console.warn('Не удалось обновить размер карты:', e);
          }
        }
      }
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [forceResize, mapLoaded]);


  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;

    const removeYandexElements = () => {
      const selectorsToRemove = [
        '.ymaps-2-1-79-gotoymaps__container',
        '.ymaps-2-1-79-gotoymaps__text-container',
        '.ymaps-2-1-79-gototech',
        '.ymaps-2-1-79-copyright__content',
        '.ymaps-2-1-79-copyright__agreement',
        '.ymaps-2-1-79-copyright__logo-cell'
      ];

      selectorsToRemove.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
          element.remove();
        });
      });
    };
    const timeoutId = setTimeout(removeYandexElements, 500); 

    return () => clearTimeout(timeoutId);
  }, [mapLoaded]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          Object.values(droneMarkersRef.current).forEach(marker => {
            try { mapInstanceRef.current.geoObjects.remove(marker); } catch { }
          });
          Object.values(routePolylinesRef.current).forEach(polyline => {
            try { mapInstanceRef.current.geoObjects.remove(polyline); } catch { }
          });
          if (editingPolylineRef.current) {
            try { mapInstanceRef.current.geoObjects.remove(editingPolylineRef.current); } catch { }
            editingPolylineRef.current = null;
          }
          if (previewPolylineRef.current) {
            try { mapInstanceRef.current.geoObjects.remove(previewPolylineRef.current); } catch { }
            previewPolylineRef.current = null;
          }
          if (zonePolygonRef.current) {
            try { mapInstanceRef.current.geoObjects.remove(zonePolygonRef.current); } catch { }
            zonePolygonRef.current = null;
          }
          if (draftRectPolygonRef.current) {
            if (draftRectGeometryChangeHandlerRef.current) {
              try {
                draftRectPolygonRef.current.geometry.events.remove('change', draftRectGeometryChangeHandlerRef.current);
              } catch { }
              draftRectGeometryChangeHandlerRef.current = null;
            }
            try { mapInstanceRef.current.geoObjects.remove(draftRectPolygonRef.current); } catch { }
            draftRectPolygonRef.current = null;
          }

          mapInstanceRef.current.destroy();
        } catch { }
        mapInstanceRef.current = null;
      }
      droneMarkersRef.current = {};
      routePolylinesRef.current = {};
      setMapLoaded(false);
    };
  }, []);

  if (error) {
    return (
      <div className="w-full h-[500px] bg-gray-800 rounded flex flex-col items-center justify-center p-4">
        <div className="text-red-500 text-2xl mb-2">⚠️</div>
        <h3 className="text-white font-bold mb-2">Ошибка загрузки карты</h3>
        <p className="text-gray-300 text-center mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null);
            yandexMapsLoaded = false;
            yandexMapsLoading = false;
            droneMarkersRef.current = {};
            routePolylinesRef.current = {};
            initMap();
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Перезагрузить карту
        </button>
      </div>
    );
  }

  const cursorAddPoint =
    placementMode ||
    routeEditMode ||
    drawRectZoneMode ||
    (editingPath && editingPath.length >= 0);

  return (
    <div className={`w-full h-full bg-gray-900 rounded overflow-hidden relative ${cursorAddPoint ? 'cursor-route-edit' : ''}`}>
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{
          height: '100%',
          width: '100%',
          cursor: cursorAddPoint ? 'crosshair' : 'grab',
        }}
      />
    </div>
  );
}