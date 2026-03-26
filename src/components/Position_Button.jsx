import { useState } from 'react';

export function PositionButton({ drones, onSetPosition }) {
  const [selectedDrone, setSelectedDrone] = useState(null);
  const [isSettingPosition, setIsSettingPosition] = useState(false);

  const handleStartSetPosition = () => {
    if (selectedDrone) {
      setIsSettingPosition(true);
    }
  };

  const handleMapClick = (latlng) => {
    if (isSettingPosition && selectedDrone) {
      onSetPosition(selectedDrone.id, latlng);
      setIsSettingPosition(false);
      setSelectedDrone(null);
    }
  };

  return (
    <div className="mb-4">
      <h3 className="text-lg font-bold mb-2">Управление позициями дронов</h3>
      
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <select 
            className="flex-1 px-3 py-2 rounded border border-gray-300 text-black"
            value={selectedDrone?.id || ''}
            onChange={(e) => {
              const droneId = parseInt(e.target.value);
              const drone = drones.find(d => d.id === droneId);
              setSelectedDrone(drone);
            }}
          >
            <option value="">Выберите дрон</option>
            {drones.map(drone => (
              <option key={drone.id} value={drone.id}>
                {drone.name} (ID: {drone.id})
              </option>
            ))}
          </select>
          
          <button
            onClick={handleStartSetPosition}
            disabled={!selectedDrone || isSettingPosition}
            className={`px-4 py-2 rounded font-medium ${
              !selectedDrone || isSettingPosition
                ? 'bg-gray-500 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600'
            } text-white`}
          >
            {isSettingPosition ? 'Выберите место на карте...' : 'Задать позицию'}
          </button>
        </div>
        
        {selectedDrone && (
          <div className="bg-gray-900 p-3 rounded text-sm">
            <p className="mb-1">Выбран дрон: <span className="font-bold">{selectedDrone.name}</span></p>
            <p className="text-gray-400">
              Текущие координаты: {selectedDrone.position.lat.toFixed(6)}, {selectedDrone.position.lng.toFixed(6)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}