export const RouteControls = ({ 
  undoLastPoint, 
  clearRoute, 
  startFlight,
  pauseFlight,
  stopFlight,
  resumeFlight,
  disabled, 
  selectedDroneName,
  isDroneFlying,
  flightStatus,
  routePoints 
}) => {
  // Расчет примерной длины маршрута (в метрах)
  const calculateRouteLength = () => {
    // Простая заглушка - примерно 100м на точку
    return routePoints * 100;
  };

  return (
    <div className="bg-gray-800 p-3 rounded-lg mb-3">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-bold mb-1">Управление маршрутом</h3>
          {selectedDroneName ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-300">Дрон:</span>
              <span className="font-semibold text-blue-300">{selectedDroneName}</span>
              
              {routePoints > 0 && (
                <>
                  <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs">
                    {routePoints} точек
                  </span>
                  <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded text-xs">
                    ~{calculateRouteLength()}м
                  </span>
                </>
              )}
              
              {isDroneFlying && (
                <span className="px-2 py-1 bg-green-700 text-white rounded text-xs animate-pulse">
                  🛸 В полете
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Выберите дрон для управления маршрутом</p>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* Кнопки управления маршрутом */}
          <button
            onClick={undoLastPoint}
            disabled={disabled || routePoints === 0 || isDroneFlying}
            className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-yellow-600 hover:bg-yellow-700"
            title="Удалить последнюю точку маршрута"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span className="hidden md:inline">Отменить</span>
          </button>
          
          <button
            onClick={clearRoute}
            disabled={disabled || routePoints === 0 || isDroneFlying}
            className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700"
            title="Очистить весь маршрут"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="hidden md:inline">Очистить</span>
          </button>
          
          {/* Кнопки управления полетом */}
          {!isDroneFlying ? (
            <button
              onClick={startFlight}
              disabled={disabled || routePoints < 2}
              className="flex items-center gap-2 px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700"
              title="Запустить дрон по маршруту"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden md:inline">Запустить</span>
            </button>
          ) : (
            <>
              {flightStatus === 'в полете' ? (
                <button
                  onClick={pauseFlight}
                  className="flex items-center gap-2 px-4 py-2 rounded-md transition-colors bg-yellow-600 hover:bg-yellow-700"
                  title="Приостановить полет"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden md:inline">Пауза</span>
                </button>
              ) : (
                <button
                  onClick={resumeFlight}
                  className="flex items-center gap-2 px-4 py-2 rounded-md transition-colors bg-blue-600 hover:bg-blue-700"
                  title="Возобновить полет"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden md:inline">Продолжить</span>
                </button>
              )}
              
              <button
                onClick={stopFlight}
                className="flex items-center gap-2 px-4 py-2 rounded-md transition-colors bg-red-600 hover:bg-red-700"
                title="Экстренная остановка"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                <span className="hidden md:inline">Стоп</span>
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Подсказки */}
      <div className="text-xs text-gray-400 mt-2">
        {disabled ? (
          <p>• Выберите дрон для управления маршрутом</p>
        ) : routePoints < 2 ? (
          <p>• Добавьте минимум 2 точки маршрута для запуска полета</p>
        ) : isDroneFlying ? (
          <p>• Дрон в полете. Используйте кнопки для управления полетом</p>
        ) : (
          <p>• Для добавления точки маршрута кликните на карте</p>
        )}
      </div>
    </div>
  );
};