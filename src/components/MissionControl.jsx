import { useState } from 'react';

export function MissionControl({ 
  drones, 
  selectedDroneId, 
  onCreateMission,
  onSwitchMission,
  activeMissions 
}) {
  const [missionName, setMissionName] = useState('');
  const [missionDescription, setMissionDescription] = useState('');

  const selectedDrone = drones.find(d => d.id === selectedDroneId);
  const canCreateMission = selectedDrone && 
                          selectedDrone.isVisible && 
                          selectedDrone.status !== 'в полете' && 
                          selectedDrone.battery > 20;

  const handleCreateMission = () => {
    if (!canCreateMission || !missionName.trim()) return;
    
    onCreateMission({
      name: missionName.trim(),
      description: missionDescription.trim(),
      droneId: selectedDroneId,
      droneName: selectedDrone.name,
      timestamp: new Date().toISOString(),
      path: [...selectedDrone.path] // Копируем текущий маршрут
    });
    
    setMissionName('');
    setMissionDescription('');
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">🎯 Центр управления миссиями</h3>
      
      {/* Создание миссии */}
      <div className="mb-6 p-3 bg-gray-900 rounded">
        <h4 className="font-bold mb-3 text-blue-300">Создать новую миссию</h4>
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Название миссии *</label>
            <input
              type="text"
              value={missionName}
              onChange={(e) => setMissionName(e.target.value)}
              placeholder="Например: Облет периметра"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Описание</label>
            <textarea
              value={missionDescription}
              onChange={(e) => setMissionDescription(e.target.value)}
              placeholder="Дополнительная информация о миссии..."
              rows="2"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          
          <button
            onClick={handleCreateMission}
            disabled={!canCreateMission || !missionName.trim()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
          >
            {!selectedDrone ? 'Выберите дрон для миссии' : 
             selectedDrone.status === 'в полете' ? 'Дрон уже в полете' :
             selectedDrone.battery <= 20 ? 'Низкий заряд батареи (<20%)' :
             '🚀 Создать и запустить миссию'}
          </button>
        </div>
      </div>

      {/* Активные миссии */}
      <div>
        <h4 className="font-bold mb-3 text-green-300">Активные миссии ({activeMissions.length})</h4>
        
        {activeMissions.length === 0 ? (
          <div className="text-gray-500 text-center py-4">
            Нет активных миссий
          </div>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {activeMissions.map((mission, index) => {
              const missionDrone = drones.find(d => d.id === mission.droneId);
              return (
                <div 
                  key={index} 
                  className="bg-gray-900 p-3 rounded border border-gray-700 hover:border-green-500 cursor-pointer"
                  onClick={() => onSwitchMission?.(mission)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-bold text-white">{mission.name}</h5>
                      <p className="text-sm text-gray-400">{mission.description}</p>
                    </div>
                    <button className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded">
                      Перейти
                    </button>
                  </div>
                  
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-gray-400">
                      Дрон: <span className="text-white">{mission.droneName}</span>
                    </span>
                    <span className={`px-2 py-1 rounded ${
                      missionDrone?.status === 'в полете' 
                        ? 'bg-green-900 text-green-300' 
                        : 'bg-yellow-900 text-yellow-300'
                    }`}>
                      {missionDrone?.status || 'ожидает'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}