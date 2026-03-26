import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { DroneMarker } from './Drone_Marker';

function AddMarkerOnClick({ addPoint, placementMode }) {
  useMapEvents({
    click(e) {
      if (addPoint) {
        addPoint(e.latlng);
        if (placementMode) {
          console.log('Дрон размещен по координатам:', e.latlng);
        }
      }
    },
  });
  return null;
}

function MapCenterUpdater({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center && Array.isArray(center) && center.length === 2) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);

  return null;
}

const createUserLocationIcon = () => {
  return L.divIcon({
    html: `
      <div class="relative">
        <div class="w-8 h-8 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
        <div class="absolute inset-0 animate-ping bg-blue-400 rounded-full"></div>
      </div>
    `,
    className: 'user-location-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

function UserLocationMarker({ position }) {
  if (!position || !Array.isArray(position) || position.length !== 2) {
    return null;
  }

  return (
    <Marker
      position={position}
      icon={createUserLocationIcon()}
    >
      <Popup>
        <div className="text-black">
          <div className="font-bold mb-1">Местоположение</div>
          <div className="text-sm">
            <div>Широта: {position[0].toFixed(6)}°</div>
            <div>Долгота: {position[1].toFixed(6)}°</div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

export function DroneMap({
  drones,
  mapCenter,
  addRoutePoint,
  onDronePositionChange,
  placementMode = false
}) {
  const isUserLocation = mapCenter && mapCenter.length === 2;

  return (
    <div className="w-full h-[800px] bg-gray-900 rounded overflow-hidden relative">
      <MapContainer
        center={mapCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <MapCenterUpdater center={mapCenter} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <AddMarkerOnClick
          addPoint={addRoutePoint}
          placementMode={placementMode}
        />

        {isUserLocation && <UserLocationMarker position={mapCenter} />}

        {drones.map(drone => (
          drone.path && drone.path.length > 0 && (
            <Polyline
              key={`route-${drone.id}`}
              positions={drone.path}
              color="#3b82f6"
              weight={3}
              opacity={0.7}
            />
          )
        ))}

        {drones.map(drone => (
          drone.position && (
            <DroneMarker
              key={`drone-${drone.id}-${drone.position.lat}-${drone.position.lng}`}
              drone={drone}
              onPositionChange={onDronePositionChange}
            />
          )
        ))}
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[1000] bg-gray-800 bg-opacity-90 text-white p-3 rounded-lg border border-gray-700 text-xs">
        <p className="font-bold mb-1">Инструкция:</p>
        <div className="space-y-1">
          {placementMode ? (
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              <span className="font-medium">Кликните на карте - разместить дрон</span>
            </div>
          ) : (
            <>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                <span>Кликните на карте - добавить точку маршрута</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                <span>Перетащите дрона - измените его позицию</span>
              </div>
            </>
          )}
        </div>
        {isUserLocation && (
          <div className="mt-2 pt-2 border-t border-gray-600">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
              <span>Синий круг - ваше текущее местоположение</span>
            </div>
          </div>
        )}
      </div>

      {placementMode && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-600 text-white p-3 rounded-lg border border-yellow-700">
          <p className="font-bold">Режим размещения дрона</p>
          <p className="text-sm">Выберите место на карте для размещения дрона</p>
        </div>
      )}
    </div>
  );
}