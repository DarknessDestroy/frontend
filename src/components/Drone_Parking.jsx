import React from 'react';

export const DroneParking = ({ 
  drones = [], 
  onPlaceDrone,
  onRemoveDrone,
  onCreateDrone,
  onBackToTemplates,
  onClose
}) => {
  const placedDrones = drones.filter(d => d.isVisible);
  const availableDrones = drones.filter(d => !d.isVisible);

  const getStatusColor = (drone) => {
    if (!drone.isVisible) return 'bg-gray-700';
    
    switch (drone.flightStatus) {
      case 'FLYING':
        return 'bg-green-900/30 border-green-500';
      case 'PAUSED':
        return 'bg-yellow-900/30 border-yellow-500';
      case 'TAKEOFF':
      case 'LANDING':
        return 'bg-blue-900/30 border-blue-500';
      case 'COMPLETED':
        return 'bg-green-900/30 border-green-700';
      default:
        return 'bg-gray-900/30 border-gray-500';
    }
  };

  const getStatusIcon = (drone) => {
    if (!drone.isVisible) return '📦';
    
    switch (drone.flightStatus) {
      case 'FLYING':
        return '🛫';
      case 'PAUSED':
        return '⏸️';
      case 'TAKEOFF':
      case 'LANDING':
        return '🚁';
      case 'COMPLETED':
        return '✅';
      default:
        return '🛸';
    }
  };

  const getStatusText = (drone) => {
    if (!drone.isVisible) return 'В ангаре';
    
    switch (drone.flightStatus) {
      case 'FLYING':
        return 'В полете';
      case 'PAUSED':
        return 'На паузе';
      case 'TAKEOFF':
        return 'Взлетает';
      case 'LANDING':
        return 'Садится';
      case 'COMPLETED':
        return 'Миссия завершена';
      default:
        return 'На земле';
    }
  };

  return (
    <div className="flex flex-shrink-0 w-72">
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden h-full flex flex-col w-full">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 p-4">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-xl font-bold text-white">Стоянка для дронов</h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
                <div className="bg-green-500 rounded-full w-2 h-2"></div>
                <span className="text-sm text-gray-300">
                  Размещено: {placedDrones.length} из {drones.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {placedDrones.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">
                    Размещенные дроны
                  </h3>
                  <div className="space-y-3">
                    {placedDrones.map(drone => (
                      <div
                        key={drone.id}
                        className={`border ${getStatusColor(drone)} rounded-lg p-3 transition-all duration-200 hover:scale-[1.01]`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{getStatusIcon(drone)}</span>
                            <div>
                              <h4 className="font-bold text-white">{drone.name}</h4>
                            </div>
                          </div>
                          <button
                            onClick={() => onRemoveDrone(drone.id)}
                            className="text-red-400 hover:text-red-300 transition-colors p-1 hover:bg-red-900/30 rounded"
                            title="Убрать дрон с карты"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-1 text-xs mt-2">
                          <div className="text-gray-400">Скорость:</div>
                          <div className="font-medium text-white">
                            {Math.round(drone.speed * 3.6)} км/ч
                          </div>
                          <div className="text-gray-400">Высота:</div>
                          <div className="font-medium text-white">
                            {Math.round(drone.altitude)} м
                          </div>
                          <div className="text-gray-400">Точки маршрута:</div>
                          <div className="font-medium text-white">
                            {drone.path?.length || 0}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Доступные дроны */}
              {availableDrones.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-white">
                      Доступные дроны
                    </h3>
                    {onCreateDrone && (
                      <button
                        type="button"
                        onClick={onCreateDrone}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 min-h-[44px] rounded text-sm transition-colors"
                        title="Создать дрона в backend и добавить в стоянку"
                      >
                        + Создать
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {availableDrones.map(drone => (
                      <div
                        key={drone.id}
                        className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 hover:bg-gray-800/50 transition-colors hover:border-gray-600"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl">📦</div>
                            <div>
                              <h4 className="font-bold text-gray-300">{drone.name}</h4>
                            </div>
                          
                          </div>
                          <button
                            onClick={() => onPlaceDrone(drone.id)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 min-h-[44px] rounded text-sm transition-colors hover:scale-105 flex items-center"
                            title="Разместить дрон на карте"
                          >
                            Разместить
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              )}
              {drones.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">🛸</div>
                  <p>Нет доступных дронов</p>
                  {onCreateDrone && (
                    <button
                      type="button"
                      onClick={onCreateDrone}
                      className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 min-h-[44px] rounded text-sm transition-colors"
                    >
                      + Создать дрона
                    </button>
                  )}
                </div>
              )}
            </div>
            {onBackToTemplates && (
              <div className="flex-shrink-0 p-4 pt-2 border-t border-gray-700 hidden lg:block">
                <button
                  type="button"
                  onClick={onBackToTemplates}
                  className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Вернуться к шаблонам
                </button>
              </div>
            )}
        </div>
      </div>
  );
};