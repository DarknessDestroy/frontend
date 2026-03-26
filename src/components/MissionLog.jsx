import { useState } from 'react';

export const MissionLog = ({ logs, activeFlight, onClearLogs }) => {
  const [expanded, setExpanded] = useState(false);

  if (logs.length === 0) {
    return (
      <div className="bg-gray-900/50 rounded-lg p-4">
        <h3 className="font-bold text-lg mb-3">Лог полетов</h3>
        <div className="text-center text-gray-400 py-4">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>Нет записей о полетах</p>
        </div>
      </div>
    );
  }

  const displayedLogs = expanded ? logs : logs.slice(0, 5);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getLogIcon = (message) => {
    if (message.includes('Старт')) return '🚀';
    if (message.includes('Взлет')) return '🛫';
    if (message.includes('Посадк')) return '🛬';
    if (message.includes('заверш')) return '✅';
    if (message.includes('останов')) return '⏸️';
    if (message.includes('возобнов')) return '▶️';
    if (message.includes('Ошибк')) return '❌';
    return '📝';
  };

  return (
    <div className="bg-gray-900/50 rounded-lg p-4">
      <div className="flex flex-col mb-3">
        <h3 className="font-bold text-lg mb-2">Лог полетов</h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs">
            {logs.length} записей
          </span>
          {logs.length > 0 && (
            <button
              onClick={onClearLogs}
              className="px-1 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
              title="Очистить лог"
            >
              🗑️
            </button>
          )}
          {activeFlight && (
            <span className="px-2 py-1 bg-green-700 text-white rounded text-xs animate-pulse">
              Активно
            </span>
          )}
        </div>
      </div>
      
      <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
        {displayedLogs.map((log) => (
          <div 
            key={log.id} 
            className="bg-gray-800 rounded p-3 border-l-4 border-blue-500"
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getLogIcon(log.message)}</span>
                <h4 className="font-semibold">{log.droneName}</h4>
              </div>
              <span className="text-xs text-gray-400">{formatTime(log.timestamp)}</span>
            </div>
            
            <p className="text-sm mb-1">{log.message}</p>
            
            {log.data && Object.keys(log.data).length > 0 && (
              <div className="text-xs text-gray-400 mt-2">
                {Object.entries(log.data).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span>{key}:</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {logs.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          {expanded ? 'Скрыть старые записи' : `Показать еще ${logs.length - 5} записей`}
        </button>
      )}
    </div>
  );
};