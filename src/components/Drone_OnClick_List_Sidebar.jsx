import { useState } from 'react';

export function DroneModal({ drone, onClose }) {
  const [showMissionDetails, setShowMissionDetails] = useState(false);

  const calculateRouteLength = () => {
    if (!drone.path || drone.path.length < 2) return 0;
    let total = 0;
    // Простая симуляция расчета длины (можно заменить на точный алгоритм)
    return (drone.path.length * 0.5).toFixed(2); // ~0.5 км на точку
  };

  const getMissionReadiness = () => {
    if (!drone.isVisible) return { status: 'hidden', text: 'Дрон не на карте', color: 'text-red-400' };
    if (drone.status === 'в полете') return { status: 'flying', text: 'На миссии', color: 'text-green-400' };
    if (drone.status === 'заряжается') return { status: 'charging', text: 'Заряжается', color: 'text-yellow-400' };
    if (drone.battery <= 20) return { status: 'low_battery', text: 'Низкий заряд', color: 'text-red-400' };
    if (drone.path.length === 0) return { status: 'no_route', text: 'Нет маршрута', color: 'text-orange-400' };
    return { status: 'ready', text: 'Готов к миссии', color: 'text-green-400' };
  };

  const missionReadiness = getMissionReadiness();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl border border-gray-700">
        {/* Заголовок */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Детальная информация о дроне</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            &times;
          </button>
        </div>

        <div className="p-4">
          {/* Основная информация */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-2">{drone.name}</h3>
              <p className="text-gray-400 mb-1">Модель: {drone.model}</p>
              <p className="text-gray-400 mb-1">ID: {drone.id}</p>
              <p className="text-gray-400">Серийный номер: {drone.serial || 'N/A'}</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Статус:</span>
                <span className={`font-medium ${missionReadiness.color}`}>
                  {drone.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Заряд батареи:</span>
                <span className={`font-bold ${
                  drone.battery > 50 ? 'text-green-400' :
                  drone.battery > 20 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {drone.battery}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">На карте:</span>
                <span className={drone.isVisible ? 'text-green-400' : 'text-red-400'}>
                  {drone.isVisible ? 'Да' : 'Нет'}
                </span>
              </div>
            </div>
          </div>

          {/* Информация о миссии */}
          <div className="mb-6 p-3 bg-gray-900 rounded">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-bold text-white">Готовность к миссии</h4>
              <span className={`px-3 py-1 rounded-full text-sm ${missionReadiness.color} bg-opacity-20 ${missionReadiness.color.replace('text-', 'bg-')}`}>
                {missionReadiness.text}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">Требования:</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={drone.isVisible ? 'text-green-400' : 'text-red-400'}>
                    {drone.isVisible ? '✓' : '✗'}
                  </span>
                  <span>Дрон на карте</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={drone.status !== 'в полете' ? 'text-green-400' : 'text-red-400'}>
                    {drone.status !== 'в полете' ? '✓' : '✗'}
                  </span>
                  <span>Не в полете</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={drone.battery > 20 ? 'text-green-400' : 'text-red-400'}>
                    {drone.battery > 20 ? '✓' : '✗'}
                  </span>
                  <span>Заряд {'>'} 20%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={drone.path.length > 0 ? 'text-green-400' : 'text-yellow-400'}>
                    {drone.path.length > 0 ? '✓' : '⚠'}
                  </span>
                  <span>Маршрут задан ({drone.path.length} точек)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Статистика маршрута */}
          <div className="mb-6">
            <h4 className="font-bold text-white mb-3">Статистика маршрута</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-900 p-3 rounded text-center">
                <div className="text-2xl font-bold text-blue-400">{drone.path?.length || 0}</div>
                <div className="text-xs text-gray-400">Точек маршрута</div>
              </div>
              <div className="bg-gray-900 p-3 rounded text-center">
                <div className="text-2xl font-bold text-green-400">{calculateRouteLength()}</div>
                <div className="text-xs text-gray-400">Примерная длина (км)</div>
              </div>
              <div className="bg-gray-900 p-3 rounded text-center">
                <div className="text-2xl font-bold text-yellow-400">{drone.speed || 0}</div>
                <div className="text-xs text-gray-400">Скорость (м/с)</div>
              </div>
              <div className="bg-gray-900 p-3 rounded text-center">
                <div className="text-2xl font-bold text-purple-400">{drone.altitude || 0}</div>
                <div className="text-xs text-gray-400">Высота (м)</div>
              </div>
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              onClick={() => setShowMissionDetails(!showMissionDetails)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
            >
              {showMissionDetails ? 'Скрыть детали' : 'Детали миссии'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            >
              Закрыть
            </button>
          </div>

          {/* Дополнительные детали миссии */}
          {showMissionDetails && (
            <div className="mt-4 p-3 bg-gray-900 rounded">
              <h5 className="font-bold text-white mb-2">Подробности миссии</h5>
              <div className="space-y-2 text-sm">
                <p className="text-gray-400">
                  <span className="text-white">Расчетное время полета:</span>{' '}
                  {drone.path.length > 0 ? `${(drone.path.length * 2).toFixed(0)} мин` : 'Не рассчитано'}
                </p>
                <p className="text-gray-400">
                  <span className="text-white">Расход батареи:</span>{' '}
                  {drone.path.length > 0 ? `${(drone.path.length * 0.5).toFixed(1)}%` : 'Не рассчитан'}
                </p>
                <p className="text-gray-400">
                  <span className="text-white">Текущая миссия:</span>{' '}
                  {drone.missionId ? `ID: ${drone.missionId}` : 'Нет активной миссии'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}