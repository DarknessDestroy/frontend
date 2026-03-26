import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const createDroneIcon = () => {
  return L.icon({
    iconUrl: '/ico.png',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
    className: 'drone-icon'
  });
};

export function DroneMarker({ drone, onPositionChange }) {

  if (!drone.position) {
    return null;
  }

  const eventHandlers = {
    dragend: (e) => {
      const newPosition = e.target.getLatLng();
      console.log(`Дрон ${drone.id} перемещен на:`, newPosition);

      if (onPositionChange) {
        onPositionChange(drone.id, newPosition);
      }
    },
    click: (e) => {
      e.originalEvent.stopPropagation();
    }
  };

  return (
    <Marker
      position={drone.position}
      icon={createDroneIcon()}
      draggable={true}
      eventHandlers={eventHandlers}
    >
      <Popup>
        <div className="text-black min-w-[200px]">
          <div className="flex items-center mb-2">
            <div className={`w-3 h-3 rounded-full mr-2 ${drone.status === 'в полете' ? 'bg-green-500' : 'bg-gray-500'
              }`}></div>
            <strong className="text-lg">{drone.name}</strong>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Статус:</span>
              <span className="font-medium">{drone.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Батарея:</span>
              <span className={`font-medium ${drone.battery > 70 ? 'text-green-600' :
                drone.battery > 30 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                {drone.battery}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Скорость:</span>
              <span className="font-medium">{drone.speed} м/с</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Высота:</span>
              <span className="font-medium">{drone.altitude} м</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Координаты:</span>
              <span className="font-mono text-xs">
                {drone.position.lat.toFixed(6)}, {drone.position.lng.toFixed(6)}
              </span>
            </div>
            <div className="pt-2 mt-2 border-t border-gray-200">
              <p className="text-xs text-blue-600 font-medium">
                💡 Перетащите для перемещения дрона
              </p>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}