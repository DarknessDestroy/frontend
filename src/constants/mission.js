export const DRONE_STATUSES = {
  IDLE: 'на земле',
  FLYING: 'в полете',
  RETURNING: 'возвращается',
  CHARGING: 'заряжается',
  MAINTENANCE: 'на обслуживании'
};

export const MISSION_STATUSES = {
  ACTIVE: 'активна',
  COMPLETED: 'завершена',
  CANCELLED: 'отменена',
  PENDING: 'ожидает'
};

export const MISSION_TEMPLATES_STORAGE_KEY = 'missionTemplates';

/** Шаблон миссии — заранее построенный маршрут патрулирования (название + точки) */
/** @typedef {{ id: string, name: string, path: [number, number][] }} MissionTemplate */