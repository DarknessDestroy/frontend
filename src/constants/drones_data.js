export const initialMapCenter = [44.605443, 33.522084];

export const dronesData = [
  {
    id: 1,
    name: "Дрон-1",
    type: "quadcopter",
    maxSpeed: 70,
    maxAltitude: 5000,
    maxFlightTime: 46,
    camera: "20MP",
    sensors: ["GPS", "GLONASS", "Vision"],
    description: "Профессиональный дрон для аэросъемки",
    isFlying: false,
    currentMission: null,
    speed: 0,
    altitude: 0,
    heading: 0,
    totalDistance: 0
  },
  {
    id: 2,
    name: "Дрон-2",
    type: "mini-quadcopter",
    maxSpeed: 57,
    maxAltitude: 4000,
    maxFlightTime: 38,
    camera: "12MP",
    sensors: ["GPS", "Vision"],
    description: "Компактный дрон для начинающих",
    isFlying: false,
    currentMission: null,
    speed: 0,
    altitude: 0,
    heading: 0,
    totalDistance: 0
  },
  {
    id: 3,
    name: "Дрон-3",
    type: "quadcopter",
    maxSpeed: 68,
    maxAltitude: 5000,
    maxFlightTime: 31,
    camera: "20MP",
    sensors: ["GPS", "GLONASS", "APAS 4.0"],
    description: "Дрон для продвинутых пользователей",
    isFlying: false,
    currentMission: null,
    speed: 0,
    altitude: 0,
    heading: 0,
    totalDistance: 0
  },
  {
    id: 4,
    name: "Дрон-4",
    type: "quadcopter",
    maxSpeed: 72,
    maxAltitude: 6000,
    maxFlightTime: 30,
    camera: "20MP",
    sensors: ["GPS", "GLONASS", "Obstacle Avoidance"],
    description: "Классический профессиональный дрон",
    isFlying: false,
    currentMission: null,
    speed: 0,
    altitude: 0,
    heading: 0,
    totalDistance: 0
  },
  {
    id: 5,
    name: "Дрон-5",
    type: "quadcopter",
    maxSpeed: 72,
    maxAltitude: 7000,
    maxFlightTime: 40,
    camera: "48MP",
    sensors: ["GPS", "Galileo", "Beidou"],
    description: "Дрон с камерой высокого разрешения",
    isFlying: false,
    currentMission: null,
    speed: 0,
    altitude: 0,
    heading: 0,
    totalDistance: 0
  }
];

export const missionTypes = [
  { id: 1, name: "Аэросъемка", icon: "📸", color: "blue" },
  { id: 2, name: "Инспекция", icon: "🔍", color: "green" },
  { id: 3, name: "Картография", icon: "🗺️", color: "purple" },
  { id: 4, name: "Поиск", icon: "🔎", color: "yellow" },
  { id: 5, name: "Доставка", icon: "📦", color: "orange" }
];

export const flightStatus = {
  IDLE: "ожидает",
  TAKEOFF: "взлет",
  FLYING: "в полете",
  LANDING: "посадка",
  COMPLETED: "завершено",
  PAUSED: "пауза",
  ERROR: "ошибка"
};