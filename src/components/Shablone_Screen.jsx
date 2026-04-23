import { useState } from 'react';

/**
 * Shablone Screen — управление шаблонами маршрутов патрулирования.
 * Шаблон = заранее построенный маршрут (название + точки на карте).
 * @param {{
 *   onStart: (templateId?: string) => void;
 *   templates: { id: string; name: string; path: [number, number][] }[];
 *   onStartCreateTemplate: () => void;
 *   onEditTemplateRoute: (id: string) => void;
 *   onDeleteTemplate: (id: string) => void;
 * }} props
 */
export function ShabloneScreen({
  onStart,
  templates,
  onStartCreateTemplate,
  onEditTemplateRoute,
  onDeleteTemplate
}) {
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const handleDelete = (id) => {
    onDeleteTemplate(id);
    setDeleteConfirmId(null);
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="w-full max-w-2xl mx-auto bg-gray-800/85 border border-gray-700/70 rounded-2xl shadow-2xl backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-700/80 bg-gradient-to-r from-gray-800 to-gray-900">
          <h2 className="text-2xl font-bold text-white">Шаблоны маршрутов патрулирования</h2>
          <p className="text-gray-400 text-sm mt-1">
            Создайте маршрут по карте, сохраните его как шаблон и используйте для дронов.
          </p>
        </div>
        <div className="px-6 py-4 flex flex-wrap gap-3 justify-between items-center bg-gray-800/70">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onStartCreateTemplate}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all shadow-sm ring-1 ring-blue-400/40"
            >
              + Создать шаблон
            </button>
            <button
              type="button"
              onClick={() => onStart()}
              className="group relative overflow-hidden px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-lg font-medium transition-all duration-300 ease-out border border-gray-600/80 shadow-sm ring-1 ring-gray-500/30 hover:ring-green-400/40 hover:shadow-md"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
              />
              <span className="relative z-10">Начать работу</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <h3 className="text-lg font-semibold text-white mb-3">Сохранённые шаблоны ({templates.length})</h3>
          {templates.length === 0 ? (
            <p className="text-gray-500 py-6 text-center">
              Нет шаблонов. Нажмите «Создать шаблон», чтобы нарисовать маршрут на карте и сохранить его.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 px-4 bg-gray-700/40 rounded-lg border border-gray-600/80 hover:border-blue-500/50 hover:bg-gray-700/70 transition-all"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{t.name}</p>
                    <p className="text-sm text-gray-400">
                      {(t.path && t.path.length) || 0} точек маршрута
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEditTemplateRoute(t.id)}
                      className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium"
                      title="Редактировать маршрут на карте"
                    >
                      Редактировать маршрут
                    </button>
                    <button
                      type="button"
                      onClick={() => onStart(t.id)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                      title="Начать работу и применить шаблон к дрону"
                    >
                      Использовать
                    </button>
                    {deleteConfirmId === t.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                        >
                          Да
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1 bg-gray-500 hover:bg-gray-400 text-white rounded text-sm"
                        >
                          Нет
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(t.id)}
                        className="px-3 py-1.5 bg-red-900/70 hover:bg-red-800 text-red-200 rounded-lg text-sm font-medium"
                        title="Удалить"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
