import { useState, useEffect, useMemo, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import { Lexer, Parser, Generator, Linter, LinterError } from './compiler/compiler'

// FORCE MONACO TO LOAD FROM CLOUDFLARE CDN (More reliable in Electron)
loader.config({
  paths: {
    vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs'
  }
});

interface FileEntry {
  name: string;
  content: string;
  isLinked: boolean;
  isLibrary: boolean;
  bundleOrder: number;
  path?: string;
}

const ROBLOX_CLASSES = [
  'Instance', 'Vector3', 'CFrame', 'Color3', 'UDim2', 'UDim', 'Ray', 'Rect', 'Region3',
  'Part', 'Script', 'LocalScript', 'ModuleScript', 'RemoteEvent', 'RemoteFunction', 
  'Folder', 'Model', 'Tool', 'TextLabel', 'TextButton', 'TextBox', 'Frame', 
  'ScrollingFrame', 'ImageLabel', 'ImageButton', 'Sound', 'Animation', 
  'ParticleEmitter', 'PointLight', 'SurfaceLight', 'SpotLight',
  'TweenInfo', 'Humanoid', 'Player', 'Character', 'BindableEvent', 'BindableFunction',
  'TweenService', 'DataStoreService', 'RunService', 'UserInputService', 'Players',
  'ReplicatedStorage', 'ServerStorage', 'Workspace', 'Game', 'Enum'
];

const ROBLOX_PROPERTIES = [
  'new', 'Value',
  'Name', 'Parent', 'Position', 'Size', 'CFrame', 'Color', 'Transparency', 
  'Reflectance', 'Anchored', 'CanCollide', 'Visible', 'Text', 'Texture', 
  'Volume', 'Playing', 'Enabled', 'Brightness', 'Range',
  'Connect', 'Fire', 'Invoke', 'WaitForChild', 'FindFirstChild', 
  'GetService', 'Disabled', 'Touched', 'InputBegan', 'InputEnded'
];

type ViewMode = 'explorer' | 'search' | 'settings' | 'welcome' | 'tutorial'
type LanguageMode = 'RbxEasy' | 'Luau'

interface UserProgress {
  completed: {
    RbxEasy: number[];
    Luau: number[];
  };
  lastProject: string | null;
}

function Tutorial({ onBack, completedProgress, onComplete, fontSize, theme }: { 
  onBack: () => void, 
  completedProgress: { RbxEasy: number[], Luau: number[] }, 
  onComplete: (id: number, lang: LanguageMode) => void, 
  fontSize: number,
  theme: any,

}) {
  const [step, setStep] = useState(0);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [tutorialLang, setTutorialLang] = useState<LanguageMode>('RbxEasy');
  const [code, setCode] = useState("");
  const [compiled, setCompiled] = useState("");
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [tutorialSearch, setTutorialSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const completedIds = tutorialLang === 'RbxEasy' ? completedProgress.RbxEasy : completedProgress.Luau;

  const steps = [
    {
      id: 1,
      title: "Переменные (Variables)",
      descRbx: "В RbxEasy переменные объявляются через 'var'. Пишите код прямо в редакторе справа.",
      descLuau: "В Luau переменные объявляются с помощью 'local'. Пишите код прямо в редакторе справа.",
      task: "Создайте переменную 'speed' и присвойте ей значение 50.",
      hint: "// Пример:\nvar speed = 50",
      initialCodeRbx: "// Ваше задание\n",
      initialCodeLuau: "-- Ваше задание\n",
      validateRbx: (c: string) => /(var\s+)?speed\s*=\s*50/.test(c),
      validateLuau: (c: string) => /(local\s+)?speed\s*=\s*50/.test(c)
    },
    {
      id: 2,
      title: "Функции (Functions)",
      descRbx: "Функции объявляются через 'func'. Не забудьте скобки '()'. Пишите код в редакторе справа.",
      descLuau: "В Luau функции объявляются через 'local function'. Пишите код в редакторе справа.",
      task: "Создайте функцию 'init()' без параметров.",
      hint: "// Пример:\nfunc init() {\n\n}",
      initialCodeRbx: "func start() {\n    print(\"Поехали!\")\n}\n",
      initialCodeLuau: "local function start()\n    print(\"Поехали!\")\nend\n",
      validateRbx: (c: string) => /func\s+init\s*\(\s*\)/.test(c),
      validateLuau: (c: string) => /(local\s+)?function\s+init\s*\(\s*\)/.test(c)
    },
    {
      id: 3,
      title: "Библиотеки (Libraries)",
      descRbx: "Подключение файлов в RbxEasy: 'include \"Имя\"'. Пишите код в редакторе справа.",
      descLuau: "В Luau подключение модулей: 'require(Путь)'. Пишите код в редакторе справа.",
      task: "Подключите библиотеку 'Venyx'.",
      hint: "// Пример:\ninclude \"Venyx\"",
      initialCodeRbx: "// Подключите Venyx здесь\n",
      initialCodeLuau: "-- Используйте require() для Venyx\n",
      validateRbx: (c: string) => /include\s*\(?\s*["']?Venyx["']?\s*\)?/.test(c),
      validateLuau: (c: string) => /require\s*\(\s*["']?.*Venyx.*["']?\s*\)/.test(c)
    },
    {
      id: 4,
      title: "Создание объектов",
      descRbx: "Для создания объектов в Roblox используйте Instance.new(\"ClassName\").",
      descLuau: "Instance.new(\"ClassName\") создает новый объект в памяти. Пишите код справа.",
      task: "Создайте новую деталь (Part) и сохраните её в переменную 'p'.",
      hint: "// Пример:\nvar p = Instance.new(\"Part\")",
      initialCodeRbx: "// Создайте Part здесь\n",
      initialCodeLuau: "-- Создайте Part здесь\n",
      validateRbx: (c: string) => /(var\s+)?p\s*=\s*Instance\.new\s*\(\s*["']?Part["']?\s*\)/.test(c),
      validateLuau: (c: string) => /(local\s+)?p\s*=\s*Instance\.new\s*\(\s*["']?Part["']?\s*\)/.test(c)
    },
    {
      id: 5,
      title: "Свойства и циклы",
      descRbx: "Циклы 'while' повторяют код. Не забывайте task.wait()!",
      descLuau: "В Luau используйте 'while true do ... end'. Не забывайте task.wait()!",
      task: "В цикле while меняйте цвет (Color) объекта 'p' на красный: Color3.new(1, 0, 0). Используйте task.wait().",
      hint: "// Пример:\nwhile(true) {\n  p.Color = Color3.new(1,0,0)\n  task.wait()\n}",
      initialCodeRbx: "var p = Instance.new(\"Part\")\n\nwhile (true) {\n    \n}\n",
      initialCodeLuau: "local p = Instance.new(\"Part\")\n\nwhile true do\n    \n    task.wait()\nend\n",
      validateRbx: (c: string) => { const str = c.replace(/\s+/g, ''); return str.includes("while") && str.includes("p.Color") && str.includes("Color3.new(1,0,0)") && str.includes("task.wait"); },
      validateLuau: (c: string) => { const str = c.replace(/\s+/g, ''); return str.includes("while") && str.includes("p.Color") && str.includes("Color3.new(1,0,0)") && str.includes("task.wait"); }
    },
    {
      id: 6,
      title: "Безопасный доступ",
      descRbx: "Используйте :WaitForChild(), чтобы дождаться появления объекта.",
      descLuau: "WaitForChild() ждет появления объекта. Это база.",
      task: "Получите доступ к объекту 'BasePart' в workspace через :WaitForChild() и сохраните в переменную 'p'.",
      hint: "// Пример:\nvar p = workspace:WaitForChild(\"BasePart\")",
      initialCodeRbx: "// Используйте :WaitForChild()\n",
      initialCodeLuau: "-- Используйте :WaitForChild()\n",
      validateRbx: (c: string) => /workspace:WaitForChild\s*\(\s*["']?BasePart["']?\s*\)/.test(c),
      validateLuau: (c: string) => /workspace:WaitForChild\s*\(\s*["']?BasePart["']?\s*\)/.test(c)
    },
    {
      id: 7,
      title: "События (Events)",
      descRbx: "listen() подключает события в RbxEasy.",
      descLuau: "В Luau используйте :Connect() для событий.",
      task: "Создайте RemoteEvent через Instance.new, сохраните в 'event', и подключите функцию 'onTrigger' через listen (RbxEasy) или :Connect (Luau).",
      hint: "// Пример:\nvar event = Instance.new(\"RemoteEvent\")\nevent:listen(onTrigger)",
      initialCodeRbx: "func onTrigger() {\n    print(\"Сработало!\")\n}\n",
      initialCodeLuau: "local function onTrigger()\n    print(\"Сработало!\")\nend\n",
      validateRbx: (c: string) => /Instance\.new\s*\(\s*["']?RemoteEvent["']?\s*\)/.test(c) && /listen\s*\(/.test(c) && c.includes('onTrigger'),
      validateLuau: (c: string) => /Instance\.new\s*\(\s*["']?RemoteEvent["']?\s*\)/.test(c) && /:Connect\s*\(\s*onTrigger\s*\)/.test(c)
    },
    {
      id: 8,
      title: "Сервисы (Services)",
      descRbx: "game:GetService() позволяет получить доступ к API Roblox.",
      descLuau: "game:GetService() — единственный верный способ получения сервисов.",
      task: "Получите сервис DataStoreService и сохраните его в переменную 'dss'.",
      hint: "// Пример:\nvar dss = game:GetService(\"DataStoreService\")",
      initialCodeRbx: "// Получите сервис через game:GetService\n",
      initialCodeLuau: "-- Получите сервис через game:GetService\n",
      validateRbx: (c: string) => /(var\s+)?dss\s*=\s*game:GetService\s*\(\s*["']?DataStoreService["']?\s*\)/.test(c),
      validateLuau: (c: string) => /(local\s+)?dss\s*=\s*game:GetService\s*\(\s*["']?DataStoreService["']?\s*\)/.test(c)
    },
    {
      id: 9,
      title: "Лучи (Raycasting)",
      descRbx: "Raycasting проверяет наличие объектов на пути луча.",
      descLuau: "workspace:Raycast() — стандарт для лучей.",
      task: "Вызовите workspace:Raycast() с началом в Vector3.new(0, 10, 0) и направлением Vector3.new(0, -20, 0).",
      hint: "// Пример:\nworkspace:Raycast(Vector3.new(0,10,0), Vector3.new(0,-20,0))",
      initialCodeRbx: "// Пустите луч вниз\n",
      initialCodeLuau: "-- Пустите луч вниз\n",
      validateRbx: (c: string) => { const str = c.replace(/\s+/g, ''); return str.includes("Raycast") && str.includes("0,10,0") && str.includes("0,-20,0"); },
      validateLuau: (c: string) => { const str = c.replace(/\s+/g, ''); return str.includes("Raycast") && str.includes("0,10,0") && str.includes("0,-20,0"); }
    },
    {
      id: 10,
      title: "Анимации (TweenService)",
      descRbx: "TweenService позволяет плавно изменять свойства объектов.",
      descLuau: "Твины — мощный инструмент для анимаций.",
      task: "Получите TweenService и создайте твин для изменения Transparency детали 'p' до 1.",
      hint: "// Пример:\nvar ts = game:GetService(\"TweenService\")\nts:Create(p, TweenInfo.new(1), {Transparency = 1}):Play()",
      initialCodeRbx: "var ts = game:GetService(\"TweenService\")\nvar p = workspace:WaitForChild(\"Part\")\n",
      initialCodeLuau: "local ts = game:GetService(\"TweenService\")\nlocal p = workspace:WaitForChild(\"Part\")\n",
      validateRbx: (c: string) => c.includes("TweenService") && c.includes("Transparency") && c.includes("1"),
      validateLuau: (c: string) => c.includes("TweenService") && c.includes("Transparency") && c.includes("1")
    },
    {
      id: 11,
      title: "Клиент-Сервер",
      descRbx: "FireServer() отправляет сигнал от клиента к серверу через RemoteEvent.",
      descLuau: "RemoteEvents — это мосты между кодом игрока и кодом сервера.",
      task: "Вызовите :FireServer() у объекта 'event' с аргументом 'Click'.",
      initialCodeRbx: "var event = game:GetService(\"ReplicatedStorage\"):WaitForChild(\"MyEvent\")\n",
      initialCodeLuau: "local event = game:GetService(\"ReplicatedStorage\"):WaitForChild(\"MyEvent\")\n",
      validateRbx: (c: string) => c.includes("FireServer") && c.includes("Click"),
      validateLuau: (c: string) => c.includes("FireServer") && c.includes("Click")
    },
    {
      id: 12,
      title: "Модули (Modules)",
      descRbx: "ModuleScript позволяют разделять код на логические части. Используйте require() для загрузки.",
      descLuau: "Модули возвращают значения (обычно таблицы), которые можно использовать в других скриптах.",
      task: "Загрузите модуль script.Parent.Module и сохраните его в переменную 'mod'.",
      initialCodeRbx: "// Загрузите модуль через require\n",
      initialCodeLuau: "-- Загрузите модуль через require\n",
      validateRbx: (c: string) => /var\s+mod\s*=\s*require\s*\(.*Module.*\)/.test(c),
      validateLuau: (c: string) => /local\s+mod\s*=\s*require\s*\(.*Module.*\)/.test(c)
    },
    {
      id: 13,
      title: "Хитбоксы",
      descRbx: "Комбинируйте циклы и лучи для создания точных систем регистрации попаданий.",
      descLuau: "Проверка столкновений через Raycast в каждом кадре — профессиональный подход к боевке.",
      task: "Создайте цикл while, внутри которого вызывается Raycast. Не забудьте про task.wait().",
      initialCodeRbx: "func startHitbox() {\n    while(true) {\n        \n        task.wait()\n    }\n}\n",
      initialCodeLuau: "local function startHitbox()\n    while true do\n        \n        task.wait()\n    end\nend\n",
      validateRbx: (c: string) => c.includes("while") && c.includes("Raycast") && c.includes("task.wait"),
      validateLuau: (c: string) => c.includes("while") && c.includes("Raycast") && c.includes("task.wait")
    },
    {
      id: 14,
      title: "Метатаблицы (MetaTables)",
      descRbx: "Метатаблицы позволяют расширять функционал обычных таблиц. `__index` срабатывает при обращении к несуществующему ключу.",
      descLuau: "Метатаблицы — основа ООП в Lua. `setmetatable` связывает таблицу с её поведением.",
      task: "Создайте таблицу 'data' и установите ей метатаблицу с `__index`, возвращающим строку 'Unknown'.",
      initialCodeRbx: "var data = {}\n",
      initialCodeLuau: "local data = {}\n",
      validateRbx: (c: string) => c.includes("setmetatable") && c.includes("__index") && c.includes("Unknown"),
      validateLuau: (c: string) => c.includes("setmetatable") && c.includes("__index") && c.includes("Unknown")
    },
    {
      id: 15,
      title: "Оптимизация (task)",
      descRbx: "task.spawn — это современный и быстрый способ запуска кода в новом потоке.",
      descLuau: "Используйте библиотеку task вместо старых wait, spawn и delay для лучшей производительности.",
      task: "Запустите функцию 'fastTask' через task.spawn.",
      initialCodeRbx: "func fastTask() {\n    print(\"Параллельно!\")\n}\n",
      initialCodeLuau: "local function fastTask()\n    print(\"Параллельно!\")\nend\n",
      validateRbx: (c: string) => /task\.spawn\s*\(\s*fastTask\s*\)/.test(c),
      validateLuau: (c: string) => /task\.spawn\s*\(\s*fastTask\s*\)/.test(c)
    },
    {
      id: 16,
      title: "Звуки (Sounds)",
      descRbx: "Для воспроизведения аудио используйте метод :Play(). Звуки лучше искать через :WaitForChild().",
      descLuau: "В Luau звуки проигрываются через :Play(). Убедитесь, что ID звука корректен.",
      task: "Найдите звук 'Explosion' в workspace и проиграйте его методом :Play().",
      initialCodeRbx: "var sound = workspace:WaitForChild(\"Explosion\")\n",
      initialCodeLuau: "local sound = workspace:WaitForChild(\"Explosion\")\n",
      validateRbx: (c: string) => c.includes(":Play()") && c.includes("Explosion"),
      validateLuau: (c: string) => c.includes(":Play()") && c.includes("Explosion")
    },
    {
      id: 17,
      title: "Частицы (Particles)",
      descRbx: "Свойство Enabled у ParticleEmitter управляет визуальными эффектами.",
      descLuau: "Динамическое включение частиц через Enabled позволяет создавать яркие способности.",
      task: "Найдите 'Fire' в workspace и установите свойство Enabled в true.",
      initialCodeRbx: "var fire = workspace:WaitForChild(\"Fire\")\n",
      initialCodeLuau: "local fire = workspace:WaitForChild(\"Fire\")\n",
      validateRbx: (c: string) => /Enabled\s*=\s*true/.test(c) && c.includes("Fire"),
      validateLuau: (c: string) => /Enabled\s*=\s*true/.test(c) && c.includes("Fire")
    },
    {
      id: 18,
      title: "Освещение (Lighting)",
      descRbx: "Lighting управляет небом, туманом и временем. ClockTime задает часы (от 0 до 24).",
      descLuau: "game.Lighting.ClockTime позволяет менять время суток прямо из кода.",
      task: "Установите game.Lighting.ClockTime в значение 12 (полдень).",
      initialCodeRbx: "// Установите время суток\n",
      initialCodeLuau: "-- Установите время суток\n",
      validateRbx: (c: string) => /game\.Lighting\.ClockTime\s*=\s*12/.test(c),
      validateLuau: (c: string) => /game\.Lighting\.ClockTime\s*=\s*12/.test(c)
    },
    {
      id: 19,
      title: "Инструменты (Tools)",
      descRbx: "Событие Equipped срабатывает, когда персонаж берет предмет в руки.",
      descLuau: "У инструментов есть событие Equipped, полезное для запуска анимаций атаки.",
      task: "Подключите функцию 'onEquip' к событию Equipped инструмента 'Sword' в workspace.",
      initialCodeRbx: "var tool = workspace:WaitForChild(\"Sword\")\nfunc onEquip() {\n    print(\"Оружие в руках!\")\n}\n",
      initialCodeLuau: "local tool = workspace:WaitForChild(\"Sword\")\nlocal function onEquip()\n    print(\"Оружие в руках!\")\nend\n",
      validateRbx: (c: string) => c.includes("listen") && c.includes("Equipped") && c.includes("onEquip"),
      validateLuau: (c: string) => c.includes(":Connect(onEquip)") && c.includes("Equipped")
    },
    {
      id: 20,
      title: "Физика (Constraints)",
      descRbx: "Constraints позволяют создавать физические связи: пружины, веревки, моторы.",
      descLuau: "Instance.new(\"SpringConstraint\") создает объект пружины для физических симуляций.",
      task: "Создайте новый объект 'SpringConstraint' и сохраните его в переменную 'spring'.",
      initialCodeRbx: "// Создайте пружину\n",
      initialCodeLuau: "-- Создайте пружину\n",
      validateRbx: (c: string) => /var\s+spring\s*=\s*Instance\.new\s*\(\s*"SpringConstraint"\s*\)/.test(c),
      validateLuau: (c: string) => /local\s+spring\s*=\s*Instance\.new\s*\(\s*"SpringConstraint"\s*\)/.test(c)
    },
    {
      id: 21,
      title: "Анимация GUI (UIStroke/UIGradient)",
      descRbx: "UIStroke добавляет обводку тексту или рамке, а UIGradient позволяет делать плавные переходы цветов.",
      descLuau: "Использование UIStroke и UIGradient делает интерфейс современным и профессиональным.",
      task: "Создайте 'UIStroke' и сохраните его в переменную 'stroke'.",
      initialCodeRbx: "// Создайте UIStroke\n",
      initialCodeLuau: "-- Создайте UIStroke\n",
      validateRbx: (c: string) => /var\s+stroke\s*=\s*Instance\.new\s*\(\s*"UIStroke"\s*\)/.test(c),
      validateLuau: (c: string) => /local\s+stroke\s*=\s*Instance\.new\s*\(\s*"UIStroke"\s*\)/.test(c)
    },
    {
      id: 22,
      title: "Пути (PathfindingService)",
      descRbx: "PathfindingService используется для создания путей обхода препятствий NPC.",
      descLuau: "Метод CreatePath() создает объект пути, который можно вычислить для перемещения персонажа.",
      task: "Получите PathfindingService и создайте путь через :CreatePath(). Сохраните в 'path'.",
      initialCodeRbx: "var ps = game:GetService(\"PathfindingService\")\n",
      initialCodeLuau: "local ps = game:GetService(\"PathfindingService\")\n",
      validateRbx: (c: string) => c.includes("PathfindingService") && c.includes(":CreatePath()"),
      validateLuau: (c: string) => c.includes("PathfindingService") && c.includes(":CreatePath()")
    },
    {
      id: 23,
      title: "Веб-запросы (HttpService)",
      descRbx: "HttpService позволяет отправлять GET и POST запросы на сторонние сайты.",
      descLuau: "Через HttpService:GetAsync() можно загружать данные из интернета прямо в игру.",
      task: "Вызовите game:GetService(\"HttpService\"):GetAsync() с любым URL строкой.",
      initialCodeRbx: "// Сделайте GET запрос\n",
      initialCodeLuau: "-- Сделайте GET запрос\n",
      validateRbx: (c: string) => c.includes("HttpService") && c.includes(":GetAsync("),
      validateLuau: (c: string) => c.includes("HttpService") && c.includes(":GetAsync(")
    },
    {
      id: 24,
      title: "JSON и Данные",
      descRbx: "JSONDecode превращает JSON-строку в таблицу, с которой удобно работать.",
      descLuau: "JSON — стандартный формат обмена данными. HttpService умеет кодировать и декодировать его.",
      task: "Используйте :JSONDecode('{\"score\": 100}') и сохраните результат в 'data'.",
      initialCodeRbx: "var hs = game:GetService(\"HttpService\")\n",
      initialCodeLuau: "local hs = game:GetService(\"HttpService\")\n",
      validateRbx: (c: string) => c.includes("JSONDecode") && c.includes("score"),
      validateLuau: (c: string) => c.includes("JSONDecode") && c.includes("score")
    },
    {
      id: 25,
      title: "Камера (Camera Manipulation)",
      descRbx: "CurrentCamera позволяет управлять взглядом игрока. Свойство CFrame задает позицию и поворот.",
      descLuau: "Манипуляция камерой используется для кат-сцен и необычных видов (2D, сверху).",
      task: "Установите workspace.CurrentCamera.CFrame в значение CFrame.new(0, 20, 0).",
      initialCodeRbx: "// Измените положение камеры\n",
      initialCodeLuau: "-- Измените положение камеры\n",
      validateRbx: (c: string) => c.includes("CurrentCamera.CFrame") && c.includes("CFrame.new(0, 20, 0)"),
      validateLuau: (c: string) => c.includes("CurrentCamera.CFrame") && c.includes("CFrame.new(0, 20, 0)")
    },
    {
      id: 26,
      title: "Подсказки (ProximityPrompt)",
      descRbx: "ProximityPrompt создает кнопку взаимодействия, которая появляется при приближении игрока.",
      descLuau: "Событие Triggered срабатывает, когда игрок зажимает клавишу взаимодействия.",
      task: "Создайте 'ProximityPrompt', сохраните в 'prompt', и установите ActionText в 'Открыть'.",
      initialCodeRbx: "// Создайте подсказку\n",
      initialCodeLuau: "-- Создайте подсказку\n",
      validateRbx: (c: string) => c.includes("ProximityPrompt") && c.includes("ActionText") && c.includes("Открыть"),
      validateLuau: (c: string) => c.includes("ProximityPrompt") && c.includes("ActionText") && c.includes("Открыть")
    },
    {
      id: 27,
      title: "Теги (CollectionService)",
      descRbx: "CollectionService позволяет помечать объекты тегами и работать со всеми сразу.",
      descLuau: "Используйте :AddTag() для добавления и :GetTagged() для получения всех объектов с тегом.",
      task: "Добавьте тег 'KillPart' объекту 'p' через CollectionService:AddTag().",
      initialCodeRbx: "var cs = game:GetService(\"CollectionService\")\nvar p = workspace.Part\n",
      initialCodeLuau: "local cs = game:GetService(\"CollectionService\")\nlocal p = workspace.Part\n",
      validateRbx: (c: string) => c.includes("AddTag") && c.includes("KillPart"),
      validateLuau: (c: string) => c.includes("AddTag") && c.includes("KillPart")
    },
    {
      id: 28,
      title: "Атрибуты (Attributes)",
      descRbx: "Атрибуты — это кастомные свойства, которые можно добавлять к любым объектам.",
      descLuau: ":SetAttribute() создает или изменяет атрибут, :GetAttribute() читает его.",
      task: "Установите атрибут 'Health' со значением 100 объекту 'p'.",
      initialCodeRbx: "var p = workspace.Part\n",
      initialCodeLuau: "local p = workspace.Part\n",
      validateRbx: (c: string) => c.includes("SetAttribute") && c.includes("Health") && c.includes("100"),
      validateLuau: (c: string) => c.includes("SetAttribute") && c.includes("Health") && c.includes("100")
    },
    {
      id: 29,
      title: "Оптимизация стриминга (StreamingEnabled)",
      descRbx: "StreamingEnabled подгружает карту по частям, экономя память игрока.",
      descLuau: "Persistent объекты всегда остаются загруженными, даже если стриминг включен.",
      task: "Создайте переменную 'stream' и присвойте ей true (представьте, что это настройка).",
      initialCodeRbx: "// Переменная stream\n",
      initialCodeLuau: "-- Переменная stream\n",
      validateRbx: (c: string) => /var\s+stream\s*=\s*true/.test(c),
      validateLuau: (c: string) => /local\s+stream\s*=\s*true/.test(c)
    },
    {
      id: 30,
      title: "Кастомные события (Signals)",
      descRbx: "BindableEvent позволяет разным скриптам общаться между собой внутри сервера или клиента.",
      descLuau: ":Fire() отправляет данные, а .Event позволяет подписаться на них.",
      task: "Создайте 'BindableEvent', сохраните в 'sig', и вызовите :Fire(10).",
      initialCodeRbx: "// Создайте BindableEvent и вызовите Fire\n",
      initialCodeLuau: "-- Создайте BindableEvent и вызовите Fire\n",
      validateRbx: (c: string) => c.includes("BindableEvent") && c.includes("Fire(10)"),
      validateLuau: (c: string) => c.includes("BindableEvent") && c.includes("Fire(10)")
    },
    {
      id: 31,
      title: "Векторная арифметика (Сложение/Вычитание)",
      descRbx: "Векторы Vector3 можно складывать и вычитать. Сложение векторов дает результирующую позицию или направление.",
      descLuau: "Vector3 поддерживает арифметические операции. Сложение (A + B) объединяет смещения векторов.",
      task: "Сложите два вектора: Vector3.new(1, 2, 3) и Vector3.new(4, 5, 6). Сохраните результат в 'v'.",
      initialCodeRbx: "// Сложите векторы\n",
      initialCodeLuau: "-- Сложите векторы\n",
      validateRbx: (c: string) => /var\s+v\s*=\s*Vector3\.new\s*\(\s*1,\s*2,\s*3\s*\)\s*\+\s*Vector3\.new\s*\(\s*4,\s*5,\s*6\s*\)/.test(c),
      validateLuau: (c: string) => /local\s+v\s*=\s*Vector3\.new\s*\(\s*1,\s*2,\s*3\s*\)\s*\+\s*Vector3\.new\s*\(\s*4,\s*5,\s*6\s*\)/.test(c)
    },
    {
      id: 32,
      title: "Скалярное произведение (Dot Product)",
      descRbx: "Dot Product (:) вычисляет скалярное произведение. Если результат > 0, векторы смотрят в одну сторону.",
      descLuau: "v1:Dot(v2) возвращает число. Полезно для определения угла между векторами или проверки видимости.",
      task: "Вычислите скалярное произведение векторов v1 и v2 через :Dot() и сохраните в 'dot'.",
      initialCodeRbx: "var v1 = Vector3.new(1, 0, 0)\nvar v2 = Vector3.new(0, 1, 0)\n",
      initialCodeLuau: "local v1 = Vector3.new(1, 0, 0)\nlocal v2 = Vector3.new(0, 1, 0)\n",
      validateRbx: (c: string) => c.includes(":Dot(v2)") && c.includes("var dot"),
      validateLuau: (c: string) => c.includes(":Dot(v2)") && c.includes("local dot")
    },
    {
      id: 33,
      title: "Векторное произведение (Cross Product)",
      descRbx: "Cross Product возвращает вектор, перпендикулярный обоим исходным векторам. Идеально для поиска 'верха' или 'бока'.",
      descLuau: "v1:Cross(v2) возвращает вектор. Используется для построения систем координат и ориентации.",
      task: "Вычислите векторное произведение v1 и v2 через :Cross() и сохраните в 'cross'.",
      initialCodeRbx: "var v1 = Vector3.new(1, 0, 0)\nvar v2 = Vector3.new(0, 1, 0)\n",
      initialCodeLuau: "local v1 = Vector3.new(1, 0, 0)\nlocal v2 = Vector3.new(0, 1, 0)\n",
      validateRbx: (c: string) => c.includes(":Cross(v2)") && c.includes("var cross"),
      validateLuau: (c: string) => c.includes(":Cross(v2)") && c.includes("local cross")
    },
    {
      id: 34,
      title: "Линейная интерполяция (Lerp)",
      descRbx: "Lerp плавно перемещает значение от A к B на процент Alpha (от 0 до 1).",
      descLuau: "v1:Lerp(v2, alpha) — стандарт для плавного движения и анимации позиций.",
      task: "Интерполируйте v1 к v2 на 50% (0.5) и сохраните в 'mid'.",
      initialCodeRbx: "var v1 = Vector3.new(0, 0, 0)\nvar v2 = Vector3.new(10, 10, 10)\n",
      initialCodeLuau: "local v1 = Vector3.new(0, 0, 0)\nlocal v2 = Vector3.new(10, 10, 10)\n",
      validateRbx: (c: string) => c.includes(":Lerp(v2, 0.5)") && c.includes("var mid"),
      validateLuau: (c: string) => c.includes(":Lerp(v2, 0.5)") && c.includes("local mid")
    },
    {
      id: 35,
      title: "Работа с CFrame (Углы и Позиция)",
      descRbx: "CFrame объединяет позицию и поворот. CFrame.Angles использует радианы.",
      descLuau: "CFrame.new(pos) * CFrame.Angles(x, y, z) — классическая формула трансформации объекта.",
      task: "Создайте CFrame, повернутый на 90 градусов (math.rad(90)) по оси Y. Сохраните в 'cf'.",
      initialCodeRbx: "// Используйте CFrame.Angles и math.rad\n",
      initialCodeLuau: "-- Используйте CFrame.Angles и math.rad\n",
      validateRbx: (c: string) => c.includes("CFrame.Angles") && c.includes("math.rad(90)"),
      validateLuau: (c: string) => c.includes("CFrame.Angles") && c.includes("math.rad(90)")
    },
    {
      id: 36,
      title: "Дистанция и Магнитуда (.Magnitude)",
      descRbx: "Свойство .Magnitude возвращает длину вектора. Разность векторов дает расстояние между ними.",
      descLuau: "(pos1 - pos2).Magnitude — самый быстрый способ узнать расстояние между двумя точками.",
      task: "Вычислите расстояние между v1 и v2 и сохраните в переменную 'dist'.",
      initialCodeRbx: "var v1 = Vector3.new(0, 0, 0)\nvar v2 = Vector3.new(0, 10, 0)\n",
      initialCodeLuau: "local v1 = Vector3.new(0, 0, 0)\nlocal v2 = Vector3.new(0, 10, 0)\n",
      validateRbx: (c: string) => c.includes(".Magnitude") && (c.includes("v1 - v2") || c.includes("v2 - v1")),
      validateLuau: (c: string) => c.includes(".Magnitude") && (c.includes("v1 - v2") || c.includes("v2 - v1"))
    },
    {
      id: 37,
      title: "Математика углов (math.atan2)",
      descRbx: "math.atan2 возвращает угол в радианах между осью X и вектором (y, x).",
      descLuau: "atan2 незаменим для 2D поворотов и ориентации персонажа в сторону цели.",
      task: "Найдите угол для вектора (10, 5) используя math.atan2(5, 10) и сохраните в 'angle'.",
      initialCodeRbx: "// Используйте math.atan2\n",
      initialCodeLuau: "-- Используйте math.atan2\n",
      validateRbx: (c: string) => /var\s+angle\s*=\s*math\.atan2\s*\(\s*5,\s*10\s*\)/.test(c),
      validateLuau: (c: string) => /local\s+angle\s*=\s*math\.atan2\s*\(\s*5,\s*10\s*\)/.test(c)
    },
    {
      id: 38,
      title: "Кривые Безье (Bezier Curves)",
      descRbx: "Кривая Безье строится на основе нескольких контрольных точек через вложенные Lerp.",
      descLuau: "Кривые Безье используются для плавных траекторий снарядов и движения камер.",
      task: "Реализуйте формулу квадратичной кривой Безье: (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2. Используйте t=0.5.",
      initialCodeRbx: "var P0, P1, P2 = Vector3.new(0,0,0), Vector3.new(5,10,0), Vector3.new(10,0,0)\nvar t = 0.5\n",
      initialCodeLuau: "local P0, P1, P2 = Vector3.new(0,0,0), Vector3.new(5,10,0), Vector3.new(10,0,0)\nlocal t = 0.5\n",
      validateRbx: (c: string) => c.includes("P0") && c.includes("P1") && c.includes("P2") && c.includes("t"),
      validateLuau: (c: string) => c.includes("P0") && c.includes("P1") && c.includes("P2") && c.includes("t")
    },
    {
      id: 39,
      title: "Шум Перлина (math.noise)",
      descRbx: "math.noise(x, y, z) возвращает плавное псевдослучайное число. Идеально для ландшафтов.",
      descLuau: "Шум Перлина стабилен: при тех же аргументах он всегда вернет тот же результат.",
      task: "Получите значение шума для координат (1.5, 2.5, 3.5) и сохраните в 'n'.",
      initialCodeRbx: "// Используйте math.noise\n",
      initialCodeLuau: "-- Используйте math.noise\n",
      validateRbx: (c: string) => /var\s+n\s*=\s*math\.noise\s*\(\s*1\.5,\s*2\.5,\s*3\.5\s*\)/.test(c),
      validateLuau: (c: string) => /local\s+n\s*=\s*math\.noise\s*\(\s*1\.5,\s*2\.5,\s*3\.5\s*\)/.test(c)
    },
    {
      id: 40,
      title: "Процедурная генерация (База)",
      descRbx: "Генерация мира на лету использует циклы и шум для расстановки объектов.",
      descLuau: "Сочетание math.noise и Instance.new позволяет создавать бесконечные миры.",
      task: "В цикле for от 1 до 5 создайте Part и установите его Position в Vector3.new(i*5, 0, 0).",
      initialCodeRbx: "// Цикл for и генерация\n",
      initialCodeLuau: "-- Цикл for и генерация\n",
      validateRbx: (c: string) => c.includes("for") && c.includes("Instance.new") && (c.includes("i*5") || c.includes("i * 5")),
      validateLuau: (c: string) => c.includes("for") && c.includes("Instance.new") && (c.includes("i*5") || c.includes("i * 5"))
    },
    {
      id: 41,
      title: "Raycast Reflection (Отражение луча)",
      descRbx: "Для отражения используйте формулу: r = d - 2 * (d:Dot(n)) * n, где d - направление, n - нормаль.",
      descLuau: "Отражение лучей используется для рикошетов пуль и лазерных лучей.",
      task: "Вычислите вектор отражения 'r' для направления 'd' и нормали 'n'.",
      initialCodeRbx: "var d = Vector3.new(1, -1, 0).Unit\nvar n = Vector3.new(0, 1, 0)\n",
      initialCodeLuau: "local d = Vector3.new(1, -1, 0).Unit\nlocal n = Vector3.new(0, 1, 0)\n",
      validateRbx: (c: string) => c.includes("d - 2 *") && c.includes(":Dot(n)"),
      validateLuau: (c: string) => c.includes("d - 2 *") && c.includes(":Dot(n)")
    },
    {
      id: 42,
      title: "PID Контроллеры (База)",
      descRbx: "PID (Proportional-Integral-Derivative) плавно подводит значение к цели без перелетов.",
      descLuau: "П-регулятор (P) — простейший вид PID: ошибка * коэффициент.",
      task: "Рассчитайте силу 'p' как (Target - Current) * 0.1.",
      initialCodeRbx: "var Target = 100\nvar Current = 20\n",
      initialCodeLuau: "local Target = 100\nlocal Current = 20\n",
      validateRbx: (c: string) => c.includes("(Target - Current) * 0.1"),
      validateLuau: (c: string) => c.includes("(Target - Current) * 0.1")
    },
    {
      id: 43,
      title: "Орбитальное движение",
      descRbx: "Используйте math.sin и math.cos для вычисления позиций на круге: (cos(a), 0, sin(a)).",
      descLuau: "Тригонометрия позволяет вращать объекты вокруг точки с заданным радиусом.",
      task: "Рассчитайте позицию 'pos' через math.cos(t)*5 и math.sin(t)*5 по осям X и Z.",
      initialCodeRbx: "var t = tick()\n",
      initialCodeLuau: "local t = tick()\n",
      validateRbx: (c: string) => c.includes("math.cos") && c.includes("math.sin") && (c.includes("*5") || c.includes("* 5")),
      validateLuau: (c: string) => c.includes("math.cos") && c.includes("math.sin") && (c.includes("*5") || c.includes("* 5"))
    },
    {
      id: 44,
      title: "Логика поиска пути (A* Basics)",
      descRbx: "Алгоритм A* ищет кратчайший путь, учитывая стоимость перемещения (G) и эвристику (H).",
      descLuau: "Эвристика обычно — это просто расстояние (Magnitude) до цели.",
      task: "Присвойте переменной 'f' сумму 'g' (10) и 'h' (25).",
      initialCodeRbx: "var g, h = 10, 25\n",
      initialCodeLuau: "local g, h = 10, 25\n",
      validateRbx: (c: string) => /var\s+f\s*=\s*g\s*\+\s*h/.test(c),
      validateLuau: (c: string) => /local\s+f\s*=\s*g\s*\+\s*h/.test(c)
    },
    {
      id: 45,
      title: "Инверсная кинематика (IK)",
      descRbx: "IK вычисляет углы суставов так, чтобы конечность достигла цели. В основе лежит теорема косинусов.",
      descLuau: "В Roblox есть IKControl, но понимание математики плеча и предплечья важно для кастомных ригов.",
      task: "Вычислите угол через math.acos(0.5) и сохраните в 'angle'.",
      initialCodeRbx: "// Используйте math.acos\n",
      initialCodeLuau: "-- Используйте math.acos\n",
      validateRbx: (c: string) => /var\s+angle\s*=\s*math\.acos\s*\(\s*0\.5\s*\)/.test(c),
      validateLuau: (c: string) => /local\s+angle\s*=\s*math\.acos\s*\(\s*0\.5\s*\)/.test(c)
    },
    {
      id: 46,
      title: "Сферическая интерполяция (Slerp)",
      descRbx: "Slerp интерполирует вращение (CFrame) по кратчайшему дуговому пути.",
      descLuau: "cf1:Lerp(cf2, t) для CFrame автоматически выполняет сферическую интерполяцию поворота.",
      task: "Интерполируйте cf1 к cf2 на 0.2 через :Lerp() и сохраните в 'result'.",
      initialCodeRbx: "var cf1 = CFrame.new(0, 5, 0)\nvar cf2 = CFrame.new(0, 10, 0) * CFrame.Angles(0, 1, 0)\n",
      initialCodeLuau: "local cf1 = CFrame.new(0, 5, 0)\nlocal cf2 = CFrame.new(0, 10, 0) * CFrame.Angles(0, 1, 0)\n",
      validateRbx: (c: string) => c.includes(":Lerp(cf2, 0.2)"),
      validateLuau: (c: string) => c.includes(":Lerp(cf2, 0.2)")
    },
    {
      id: 47,
      title: "Collision Detection (Основы)",
      descRbx: "Простейшая проверка столкновений сфер: если расстояние < суммы радиусов, они столкнулись.",
      descLuau: "Для AABB (коробок) проверяются пересечения интервалов по осям X, Y, Z.",
      task: "Напишите условие if: если (p1 - p2).Magnitude меньше 5, напечатайте 'Hit'.",
      initialCodeRbx: "var p1, p2 = Vector3.new(0,0,0), Vector3.new(2,2,2)\n",
      initialCodeLuau: "local p1, p2 = Vector3.new(0,0,0), Vector3.new(2,2,2)\n",
      validateRbx: (c: string) => c.includes("if") && c.includes(".Magnitude < 5") && c.includes("print"),
      validateLuau: (c: string) => c.includes("if") && c.includes(".Magnitude < 5") && c.includes("print")
    },
    {
      id: 48,
      title: "Пространственное хэширование",
      descRbx: "Разделение мира на сетку (Grid) ускоряет поиск ближайших объектов.",
      descLuau: "Вычисление ключа сетки: math.floor(pos.X / cellSize).",
      task: "Вычислите индекс сетки 'gridX' для x=15.5 при размере ячейки 10.",
      initialCodeRbx: "var x = 15.5\nvar cellSize = 10\n",
      initialCodeLuau: "local x = 15.5\nlocal cellSize = 10\n",
      validateRbx: (c: string) => c.includes("math.floor(x / cellSize)"),
      validateLuau: (c: string) => c.includes("math.floor(x / cellSize)")
    },
    {
      id: 49,
      title: "Системы частиц (Математика полета)",
      descRbx: "Движение частицы: Velocity = Velocity + Gravity * dt; Position = Position + Velocity * dt.",
      descLuau: "Интегрирование Эйлера — основа большинства физических симуляций в играх.",
      task: "Обновите 'pos' прибавив к нему 'vel' умноженный на 'dt' (0.01).",
      initialCodeRbx: "var pos = Vector3.new(0, 10, 0)\nvar vel = Vector3.new(0, -1, 0)\nvar dt = 0.01\n",
      initialCodeLuau: "local pos = Vector3.new(0, 10, 0)\nlocal vel = Vector3.new(0, -1, 0)\nlocal dt = 0.01\n",
      validateRbx: (c: string) => c.includes("pos + vel * dt") || c.includes("pos + (vel * dt)"),
      validateLuau: (c: string) => c.includes("pos + vel * dt") || c.includes("pos + (vel * dt)")
    },
    {
      id: 50,
      title: "Финальный проект: ИИ преследования",
      descRbx: "ИИ должен смотреть на цель и двигаться к ней, используя CFrame.lookAt и .LookVector.",
      descLuau: "lookAt создает матрицу поворота к цели, а LookVector дает направление движения 'вперед'.",
      task: "Установите CFrame детали 'npc' в CFrame.lookAt(npc.Position, target.Position).",
      initialCodeRbx: "var npc = workspace.NPC\nvar target = workspace.PlayerPart\n",
      initialCodeLuau: "local npc = workspace.NPC\nlocal target = workspace.PlayerPart\n",
      validateRbx: (c: string) => c.includes("CFrame.lookAt(npc.Position, target.Position)"),
      validateLuau: (c: string) => c.includes("CFrame.lookAt(npc.Position, target.Position)")
    },
    {
      id: 51,
      title: "AI: Finite State Machine (FSM)",
      descRbx: "FSM позволяет переключаться между состояниями (Idle, Walk, Attack).",
      descLuau: "Конечные автоматы управляют логикой NPC через четко определенные состояния.",
      task: "Создайте переменную 'state' со значением 'Idle'.",
      initialCodeRbx: "// Состояние ИИ\n",
      initialCodeLuau: "-- Состояние ИИ\n",
      validateRbx: (c: string) => /var\s+state\s*=\s*"Idle"/.test(c),
      validateLuau: (c: string) => /local\s+state\s*=\s*"Idle"/.test(c)
    },
    {
      id: 52,
      title: "AI: Sensing (Зрение)",
      descRbx: "Проверка видимости: цель должна быть в радиусе и не закрыта препятствиями.",
      descLuau: "Используйте Raycast для проверки прямой видимости (Line of Sight) между NPC и игроком.",
      task: "Вызовите workspace:Raycast() от npc.Position в сторону player.Position.",
      initialCodeRbx: "var npc, player = workspace.NPC, workspace.Player\n",
      initialCodeLuau: "local npc, player = workspace.NPC, workspace.Player\n",
      validateRbx: (c: string) => c.includes("Raycast") && c.includes("npc.Position") && c.includes("player.Position"),
      validateLuau: (c: string) => c.includes("Raycast") && c.includes("npc.Position") && c.includes("player.Position")
    },
    {
      id: 53,
      title: "AI: Behavior Trees (Селекторы)",
      descRbx: "Селектор выполняет дочерние узлы, пока один из них не вернет успех.",
      descLuau: "Деревья поведения — стандарт для сложного ИИ в больших играх.",
      task: "Создайте функцию 'selector' и верните true.",
      initialCodeRbx: "func selector() {\n    return true\n}\n",
      initialCodeLuau: "local function selector()\n    return true\nend\n",
      validateRbx: (c: string) => c.includes("func selector") && c.includes("return true"),
      validateLuau: (c: string) => c.includes("function selector") && c.includes("return true")
    },
    {
      id: 54,
      title: "AI: Уклонение (Steering)",
      descRbx: "Steering behaviors позволяют NPC плавно обходить препятствия.",
      descLuau: "Силы руления (Steering forces) вычисляют желаемую скорость NPC.",
      task: "Рассчитайте 'desired' как (target - pos).Unit * speed.",
      initialCodeRbx: "var target, pos, speed = Vector3.new(10,0,0), Vector3.new(0,0,0), 16\n",
      initialCodeLuau: "local target, pos, speed = Vector3.new(10,0,0), Vector3.new(0,0,0), 16\n",
      validateRbx: (c: string) => c.includes("(target - pos).Unit * speed"),
      validateLuau: (c: string) => c.includes("(target - pos).Unit * speed")
    },
    {
      id: 55,
      title: "AI: Навигационная сетка (Pathfinding)",
      descRbx: "ComputeAsync вычисляет путь по точкам (Waypoints).",
      descLuau: "Используйте path:GetWaypoints() после вычисления пути для получения списка точек.",
      task: "Вызовите path:ComputeAsync(startPos, endPos) и сохраните в 'path'.",
      initialCodeRbx: "var ps = game:GetService(\"PathfindingService\")\nvar path = ps:CreatePath()\nvar startPos, endPos = Vector3.new(0,0,0), Vector3.new(50,0,50)\n",
      initialCodeLuau: "local ps = game:GetService(\"PathfindingService\")\nlocal path = ps:CreatePath()\nlocal startPos, endPos = Vector3.new(0,0,0), Vector3.new(50,0,50)\n",
      validateRbx: (c: string) => c.includes(":ComputeAsync(startPos, endPos)"),
      validateLuau: (c: string) => c.includes(":ComputeAsync(startPos, endPos)")
    },
    {
      id: 56,
      title: "AI: Blackboard (Память)",
      descRbx: "Blackboard — это общее хранилище данных для узлов Behavior Tree.",
      descLuau: "ИИ использует доску объявлений для хранения текущей цели или уровня здоровья.",
      task: "Создайте таблицу 'blackboard' с полем 'target' = nil.",
      initialCodeRbx: "// Хранилище данных ИИ\n",
      initialCodeLuau: "-- Хранилище данных ИИ\n",
      validateRbx: (c: string) => /var\s+blackboard\s*=\s*\{\s*target\s*[:=]\s*nil\s*\}/.test(c) || /var\s+blackboard\s*=\s*\{\}/.test(c),
      validateLuau: (c: string) => /local\s+blackboard\s*=\s*\{\s*target\s*=\s*nil\s*\}/.test(c) || /local\s+blackboard\s*=\s*\{\}/.test(c)
    },
    {
      id: 57,
      title: "AI: Динамические препятствия",
      descRbx: "Событие path.Blocked срабатывает, когда путь перекрыт.",
      descLuau: "Слушайте событие Blocked, чтобы пересчитать путь, если на дороге появился объект.",
      task: "Подключите функцию к path.Blocked через listen или :Connect.",
      initialCodeRbx: "var path = game:GetService(\"PathfindingService\"):CreatePath()\n",
      initialCodeLuau: "local path = game:GetService(\"PathfindingService\"):CreatePath()\n",
      validateRbx: (c: string) => c.includes("Blocked"),
      validateLuau: (c: string) => c.includes("Blocked")
    },
    {
      id: 58,
      title: "AI: Утилитарный ИИ",
      descRbx: "Utility AI выбирает действие с наивысшим баллом (Score).",
      descLuau: "Вместо жестких условий, ИИ оценивает 'желание' выполнить действие на основе голода, страха и т.д.",
      task: "Найдите максимальное значение в таблице 'scores' {10, 50, 20} и сохраните в 'maxScore'.",
      initialCodeRbx: "var scores = {10, 50, 20}\n",
      initialCodeLuau: "local scores = {10, 50, 20}\n",
      validateRbx: (c: string) => c.includes("math.max"),
      validateLuau: (c: string) => c.includes("math.max")
    },
    {
      id: 59,
      title: "AI: Групповое поведение",
      descRbx: "Flocking (стайность): Alignment, Cohesion, Separation.",
      descLuau: "Алгоритм Boids позволяет имитировать движение стаи птиц или рыб.",
      task: "Рассчитайте среднюю позицию 'avgPos' как (p1 + p2 + p3) / 3.",
      initialCodeRbx: "var p1, p2, p3 = Vector3.new(0,0,0), Vector3.new(10,0,0), Vector3.new(5,0,5)\n",
      initialCodeLuau: "local p1, p2, p3 = Vector3.new(0,0,0), Vector3.new(10,0,0), Vector3.new(5,0,5)\n",
      validateRbx: (c: string) => c.includes("/ 3") && c.includes("p1 + p2 + p3"),
      validateLuau: (c: string) => c.includes("/ 3") && c.includes("p1 + p2 + p3")
    },
    {
      id: 60,
      title: "AI: Сенсор слуха",
      descRbx: "Проверка шума: если (soundPos - npcPos).Magnitude < soundRadius, NPC услышал.",
      descLuau: "Слух NPC — это просто проверка расстояния до источника звукового события.",
      task: "Напишите условие if для проверки расстояния между npcPos и soundPos меньше 20.",
      initialCodeRbx: "var npcPos = Vector3.new(0,0,0)\nvar soundPos = Vector3.new(10,0,10)\n",
      initialCodeLuau: "local npcPos = Vector3.new(0,0,0)\nlocal soundPos = Vector3.new(10,0,10)\n",
      validateRbx: (c: string) => c.includes(".Magnitude < 20"),
      validateLuau: (c: string) => c.includes(".Magnitude < 20")
    },
    {
      id: 61,
      title: "Оптимизация: Microprofiler",
      descRbx: "debug.profilebegin(\"Label\") помечает блок кода для анализа производительности.",
      descLuau: "Используйте Microprofiler для поиска 'тяжелых' функций, вызывающих лаги.",
      task: "Начните профилирование с меткой 'HeavyTask' и сразу закройте через debug.profileend().",
      initialCodeRbx: "// Начните профилирование здесь\n",
      initialCodeLuau: "-- Начните профилирование здесь\n",
      validateRbx: (c: string) => c.includes("debug.profilebegin") && c.includes("debug.profileend"),
      validateLuau: (c: string) => c.includes("debug.profilebegin") && c.includes("debug.profileend")
    },
    {
      id: 62,
      title: "Оптимизация: Очистка соединений",
      descRbx: "Всегда отключайте события через :Disconnect(), чтобы избежать утечек памяти.",
      descLuau: "Утечки памяти часто случаются из-за забытых Connect в уничтоженных объектах.",
      task: "Вызовите :Disconnect() у переменной 'connection'.",
      initialCodeRbx: "var connection = workspace.Part.Touched:Connect(func(){})\n",
      initialCodeLuau: "local connection = workspace.Part.Touched:Connect(function() end)\n",
      validateRbx: (c: string) => c.includes("connection:Disconnect()"),
      validateLuau: (c: string) => c.includes("connection:Disconnect()")
    },
    {
      id: 63,
      title: "Оптимизация: Слабые таблицы",
      descRbx: "Метатаблица с __mode = 'v' позволяет сборщику мусора удалять объекты из таблицы.",
      descLuau: "Слабые ссылки (Weak references) незаменимы для кэширования объектов.",
      task: "Установите __mode в 'v' для метатаблицы 'mt'.",
      initialCodeRbx: "var mt = {}\n",
      initialCodeLuau: "local mt = {}\n",
      validateRbx: (c: string) => c.includes("__mode") && c.includes("v"),
      validateLuau: (c: string) => c.includes("__mode") && c.includes("v")
    },
    {
      id: 64,
      title: "Оптимизация: Parallel Luau (Десинхронизация)",
      descRbx: "task.desynchronize() переводит выполнение кода в параллельный поток.",
      descLuau: "Параллельные вычисления позволяют использовать всю мощь многоядерных процессоров.",
      task: "Вызовите task.desynchronize() внутри скрипта.",
      initialCodeRbx: "// Перейдите в параллельный поток\n",
      initialCodeLuau: "-- Перейдите в параллельный поток\n",
      validateRbx: (c: string) => c.includes("task.desynchronize()"),
      validateLuau: (c: string) => c.includes("task.desynchronize()")
    },
    {
      id: 65,
      title: "Оптимизация: task.synchronize",
      descRbx: "Для изменения свойств объектов Roblox нужно вернуться в основной поток через task.synchronize().",
      descLuau: "Изменение Position или Parent запрещено в параллельном потоке без синхронизации.",
      task: "Вызовите task.synchronize() после тяжелых вычислений.",
      initialCodeRbx: "task.desynchronize()\n// Тяжелый код\n",
      initialCodeLuau: "task.desynchronize()\n-- Тяжелый код\n",
      validateRbx: (c: string) => c.includes("task.synchronize()"),
      validateLuau: (c: string) => c.includes("task.synchronize()")
    },
    {
      id: 66,
      title: "Оптимизация: Пул объектов (Pooling)",
      descRbx: "Вместо постоянного создания/удаления, скрывайте объекты и используйте их повторно.",
      descLuau: "Object Pooling критически важен для систем пуль и спецэффектов.",
      task: "Установите Transparency в 1 и CanCollide в false для 'деактивации' объекта 'p'.",
      initialCodeRbx: "var p = workspace.Part\n",
      initialCodeLuau: "local p = workspace.Part\n",
      validateRbx: (c: string) => c.includes("Transparency = 1") && c.includes("CanCollide = false"),
      validateLuau: (c: string) => c.includes("Transparency = 1") && c.includes("CanCollide = false")
    },
    {
      id: 67,
      title: "Оптимизация: Collision Groups",
      descRbx: "Используйте PhysicsService для настройки групп столкновений, чтобы пули не попадали в стрелка.",
      descLuau: "Collision Groups позволяют исключить физическое взаимодействие между определенными типами объектов.",
      task: "Получите сервис 'PhysicsService' через GetService.",
      initialCodeRbx: "// Получите сервис физики\n",
      initialCodeLuau: "-- Получите сервис физики\n",
      validateRbx: (c: string) => c.includes("PhysicsService"),
      validateLuau: (c: string) => c.includes("PhysicsService")
    },
    {
      id: 68,
      title: "Оптимизация: CFrame.identity",
      descRbx: "CFrame.identity быстрее, чем CFrame.new(), когда вам нужно пустое смещение.",
      descLuau: "Используйте встроенные константы identity, когда это возможно.",
      task: "Присвойте переменной 'cf' значение CFrame.identity.",
      initialCodeRbx: "// Используйте identity\n",
      initialCodeLuau: "-- Используйте identity\n",
      validateRbx: (c: string) => c.includes("CFrame.identity"),
      validateLuau: (c: string) => c.includes("CFrame.identity")
    },
    {
      id: 69,
      title: "Оптимизация: table.create",
      descRbx: "table.create(size) заранее выделяет память под таблицу, что намного быстрее обычного {}.",
      descLuau: "Если вы знаете размер таблицы заранее, всегда используйте table.create.",
      task: "Создайте таблицу на 100 элементов через table.create.",
      initialCodeRbx: "// Выделите память\n",
      initialCodeLuau: "-- Выделите память\n",
      validateRbx: (c: string) => c.includes("table.create(100)"),
      validateLuau: (c: string) => c.includes("table.create(100)")
    },
    {
      id: 70,
      title: "Оптимизация: Network Ownership",
      descRbx: "setNetworkOwner(nil) передает управление физикой объекта серверу, убирая лаги у игроков.",
      descLuau: "Сетевой владелец (Network Owner) отвечает за расчеты физики объекта.",
      task: "Вызовите :SetNetworkOwner(nil) для объекта 'p'.",
      initialCodeRbx: "var p = workspace.Part\n",
      initialCodeLuau: "local p = workspace.Part\n",
      validateRbx: (c: string) => c.includes("SetNetworkOwner(nil)"),
      validateLuau: (c: string) => c.includes("SetNetworkOwner(nil)")
    },
    {
      id: 71,
      title: "Сети: Latency Compensation",
      descRbx: "Клиент должен выполнять действие мгновенно (Prediction), а сервер — подтверждать его.",
      descLuau: "Компенсация задержки делает геймплей отзывчивым даже при пинге 200мс.",
      task: "Создайте переменную 'prediction' = true.",
      initialCodeRbx: "// Настройка сети\n",
      initialCodeLuau: "-- Настройка сети\n",
      validateRbx: (c: string) => /var\s+prediction\s*=\s*true/.test(c),
      validateLuau: (c: string) => /local\s+prediction\s*=\s*true/.test(c)
    },
    {
      id: 72,
      title: "Сети: Delta Compression",
      descRbx: "Отправляйте только те данные, которые изменились с последнего кадра.",
      descLuau: "Сжатие дельты (разницы) экономит пропускную способность канала.",
      task: "Напишите условие: если newValue != oldValue, тогда отправить данные.",
      initialCodeRbx: "var oldValue, newValue = 10, 11\n",
      initialCodeLuau: "local oldValue, newValue = 10, 11\n",
      validateRbx: (c: string) => c.includes("newValue != oldValue"),
      validateLuau: (c: string) => c.includes("newValue ~= oldValue")
    },
    {
      id: 73,
      title: "Сети: Buffering (Буферизация)",
      descRbx: "Буфер хранит последние полученные состояния для плавного воспроизведения.",
      descLuau: "Буферизация помогает сгладить сетевые 'рывки' (jitter).",
      task: "Создайте таблицу 'buffer' и добавьте в неё значение через table.insert.",
      initialCodeRbx: "var buffer = {}\n",
      initialCodeLuau: "local buffer = {}\n",
      validateRbx: (c: string) => c.includes("table.insert(buffer"),
      validateLuau: (c: string) => c.includes("table.insert(buffer")
    },
    {
      id: 74,
      title: "Сети: Remote Rate Limiting",
      descRbx: "Ограничивайте частоту отправки RemoteEvent, чтобы игрок не 'положил' сервер.",
      descLuau: "Всегда проверяйте время последнего запроса (Debounce) на стороне сервера.",
      task: "Проверьте условие: tick() - lastCall > 0.1.",
      initialCodeRbx: "var lastCall = 0\n",
      initialCodeLuau: "local lastCall = 0\n",
      validateRbx: (c: string) => c.includes("tick() - lastCall > 0.1"),
      validateLuau: (c: string) => c.includes("tick() - lastCall > 0.1")
    },
    {
      id: 75,
      title: "Сети: Serialization (Биты)",
      descRbx: "Превращайте сложные объекты в строки или числа для быстрой передачи.",
      descLuau: "Сериализация Vector3 в массив чисел уменьшает объем передаваемых данных.",
      task: "Создайте таблицу с полями x, y, z из координат Vector3.new(1,2,3).",
      initialCodeRbx: "var v = Vector3.new(1,2,3)\n",
      initialCodeLuau: "local v = Vector3.new(1,2,3)\n",
      validateRbx: (c: string) => c.includes("v.X") && c.includes("v.Y") && c.includes("v.Z"),
      validateLuau: (c: string) => c.includes("v.X") && c.includes("v.Y") && c.includes("v.Z")
    },
    {
      id: 76,
      title: "Сети: UnreliableRemoteEvents",
      descRbx: "Используйте UnreliableRemoteEvent для данных, потеря которых не критична (например, VFX).",
      descLuau: "Ненадежные события работают быстрее, так как не гарантируют доставку и порядок.",
      task: "Создайте объект 'UnreliableRemoteEvent' через Instance.new.",
      initialCodeRbx: "// Создайте ненадежное событие\n",
      initialCodeLuau: "-- Создайте ненадежное событие\n",
      validateRbx: (c: string) => c.includes("UnreliableRemoteEvent"),
      validateLuau: (c: string) => c.includes("UnreliableRemoteEvent")
    },
    {
      id: 77,
      title: "Сети: Server Authority",
      descRbx: "Сервер всегда должен проверять, мог ли игрок физически совершить действие.",
      descLuau: "Никогда не доверяйте данным о позиции или уроне, пришедшим от клиента.",
      task: "Напишите проверку: если damage > 100, тогда damage = 100 (защита от читов).",
      initialCodeRbx: "var damage = 150\n",
      initialCodeLuau: "local damage = 150\n",
      validateRbx: (c: string) => c.includes("damage > 100") && c.includes("damage = 100"),
      validateLuau: (c: string) => c.includes("damage > 100") && c.includes("damage = 100")
    },
    {
      id: 78,
      title: "Сети: Client Interpolation",
      descRbx: "Плавно перемещайте персонажей других игроков между полученными позициями.",
      descLuau: "Интерполяция (Lerp) создает иллюзию плавного движения при редких обновлениях от сервера.",
      task: "Интерполируйте позицию 'current' к 'target' на 0.1.",
      initialCodeRbx: "var current, target = Vector3.new(0,0,0), Vector3.new(10,0,0)\n",
      initialCodeLuau: "local current, target = Vector3.new(0,0,0), Vector3.new(10,0,0)\n",
      validateRbx: (c: string) => c.includes(":Lerp(target, 0.1)"),
      validateLuau: (c: string) => c.includes(":Lerp(target, 0.1)")
    },
    {
      id: 79,
      title: "Сети: RemoteFunction Timeout",
      descRbx: "RemoteFunction:InvokeServer() вешает клиент, если сервер не отвечает. Используйте осторожно.",
      descLuau: "Никогда не вызывайте InvokeClient с сервера, так как клиент может зависнуть и 'подвесить' серверный поток.",
      task: "Создайте переменную 'isWaiting' = true перед вызовом InvokeServer.",
      initialCodeRbx: "// Логика ожидания\n",
      initialCodeLuau: "-- Логика ожидания\n",
      validateRbx: (c: string) => /var\s+isWaiting\s*=\s*true/.test(c),
      validateLuau: (c: string) => /local\s+isWaiting\s*=\s*true/.test(c)
    },
    {
      id: 80,
      title: "Сети: Server Time Sync",
      descRbx: "GetServerTimeNow() возвращает точное время сервера с учетом задержки.",
      descLuau: "Используйте время сервера для синхронизации событий (например, начала раунда) у всех игроков.",
      task: "Получите текущее время через workspace:GetServerTimeNow() и сохраните в 't'.",
      initialCodeRbx: "// Синхронное время\n",
      initialCodeLuau: "-- Синхронное время\n",
      validateRbx: (c: string) => c.includes("GetServerTimeNow()"),
      validateLuau: (c: string) => c.includes("GetServerTimeNow()")
    },
    {
      id: 81,
      title: "Математика: Пружины (Hooke's Law)",
      descRbx: "Сила пружины: F = -k * x, где k - жесткость, x - растяжение.",
      descLuau: "Закон Гука — основа для процедурной анимации оружия и покачивания камеры.",
      task: "Вычислите силу 'f' как -10 * displacement.",
      initialCodeRbx: "var displacement = 5\n",
      initialCodeLuau: "local displacement = 5\n",
      validateRbx: (c: string) => c.includes("-10 * displacement"),
      validateLuau: (c: string) => c.includes("-10 * displacement")
    },
    {
      id: 82,
      title: "Математика: Демпфирование (Damping)",
      descRbx: "Демпфирование гасит колебания пружины: F_total = F_spring - damping * velocity.",
      descLuau: "Без демпфирования ваша пружина будет качаться вечно.",
      task: "Вычтите из 'f' (100) значение damping (5) умноженное на velocity (10).",
      initialCodeRbx: "var f, damping, velocity = 100, 5, 10\n",
      initialCodeLuau: "local f, damping, velocity = 100, 5, 10\n",
      validateRbx: (c: string) => c.includes("f - damping * velocity"),
      validateLuau: (c: string) => c.includes("f - damping * velocity")
    },
    {
      id: 83,
      title: "VFX: UI Shaders (Rotation)",
      descRbx: "Вращение градиента в цикле создает эффект 'сияния' или загрузки.",
      descLuau: "Анимируя свойство Rotation у UIGradient, можно создавать динамические рамки.",
      task: "В цикле увеличивайте grad.Rotation на 1 каждый кадр.",
      initialCodeRbx: "var grad = Instance.new(\"UIGradient\")\nwhile(true) {\n    task.wait()\n}\n",
      initialCodeLuau: "local grad = Instance.new(\"UIGradient\")\nwhile true do\n    \n    task.wait()\nend\n",
      validateRbx: (c: string) => c.includes("grad.Rotation + 1") || c.includes("grad.Rotation += 1"),
      validateLuau: (c: string) => c.includes("grad.Rotation + 1") || c.includes("grad.Rotation = grad.Rotation + 1")
    },
    {
      id: 84,
      title: "VFX: Spritesheets (UI)",
      descRbx: "ImageRectOffset позволяет выбирать нужный кадр из атласа спрайтов.",
      descLuau: "Используйте спрайт-листы для сложной 2D анимации в интерфейсе.",
      task: "Установите ImageRectOffset объекта 'img' в Vector2.new(128, 0).",
      initialCodeRbx: "var img = workspace.ImageLabel\n",
      initialCodeLuau: "local img = workspace.ImageLabel\n",
      validateRbx: (c: string) => c.includes("Vector2.new(128, 0)"),
      validateLuau: (c: string) => c.includes("Vector2.new(128, 0)")
    },
    {
      id: 85,
      title: "Математика: Fluid Grid (База)",
      descRbx: "Симуляция воды в сетке основана на обмене 'высотой' между соседними ячейками.",
      descLuau: "Простая сетка 2D позволяет имитировать волны на поверхности.",
      task: "Рассчитайте среднее значение 'avg' между h1, h2, h3, h4.",
      initialCodeRbx: "var h1, h2, h3, h4 = 1, 2, 1, 3\n",
      initialCodeLuau: "local h1, h2, h3, h4 = 1, 2, 1, 3\n",
      validateRbx: (c: string) => c.includes("/ 4") && c.includes("h1 + h2 + h3 + h4"),
      validateLuau: (c: string) => c.includes("/ 4") && c.includes("h1 + h2 + h3 + h4")
    },
    {
      id: 86,
      title: "VFX: Particle Curves",
      descRbx: "NumberSequence используется для изменения свойств частиц во времени.",
      descLuau: "Создавайте плавные переходы размера и прозрачности частиц через ключи NumberSequenceKeypoint.",
      task: "Создайте 'NumberSequence' из одного значения 1.0.",
      initialCodeRbx: "// Создайте последовательность\n",
      initialCodeLuau: "-- Создайте последовательность\n",
      validateRbx: (c: string) => c.includes("NumberSequence.new(1.0)"),
      validateLuau: (c: string) => c.includes("NumberSequence.new(1.0)")
    },
    {
      id: 87,
      title: "Математика: Quaternions",
      descRbx: "Кватернионы решают проблему 'Gimbal Lock' при вращении объектов.",
      descLuau: "В Roblox CFrame использует кватернионы внутри для интерполяции вращений.",
      task: "Установите переменную 'usesQuats' в true.",
      initialCodeRbx: "// Факт о CFrame\n",
      initialCodeLuau: "-- Факт о CFrame\n",
      validateRbx: (c: string) => /var\s+usesQuats\s*=\s*true/.test(c),
      validateLuau: (c: string) => /local\s+usesQuats\s*=\s*true/.test(c)
    },
    {
      id: 88,
      title: "VFX: FABRIK (IK)",
      descRbx: "FABRIK — итеративный алгоритм IK, который быстрее и проще тригонометрии.",
      descLuau: "Алгоритм FABRIK 'подтягивает' кости к цели по очереди, пока не достигнет нужной точки.",
      task: "Создайте цикл for от 1 до 10 для итераций алгоритма.",
      initialCodeRbx: "// Итерации IK\n",
      initialCodeLuau: "-- Итерации IK\n",
      validateRbx: (c: string) => c.includes("for") && c.includes("10"),
      validateLuau: (c: string) => c.includes("for") && c.includes("10")
    },
    {
      id: 89,
      title: "VFX: Ray-marching basics",
      descRbx: "Ray-marching — метод рендеринга через 'шаги' по лучу до пересечения с полем расстояний (SDF).",
      descLuau: "SDF (Signed Distance Functions) описывают формы математически, а не через полигоны.",
      task: "Рассчитайте расстояние 'd' как pos.Magnitude - radius (сфера).",
      initialCodeRbx: "var pos = Vector3.new(1,1,1)\nvar radius = 5\n",
      initialCodeLuau: "local pos = Vector3.new(1,1,1)\nlocal radius = 5\n",
      validateRbx: (c: string) => c.includes("pos.Magnitude - radius"),
      validateLuau: (c: string) => c.includes("pos.Magnitude - radius")
    },
    {
      id: 90,
      title: "VFX: ViewportFrame",
      descRbx: "ViewportFrame позволяет отображать 3D объекты внутри 2D интерфейса.",
      descLuau: "Для работы ViewportFrame нужна камера, установленная в свойство CurrentCamera.",
      task: "Создайте 'ViewportFrame' и сохраните в 'vf'.",
      initialCodeRbx: "// Создайте Viewport\n",
      initialCodeLuau: "-- Создайте Viewport\n",
      validateRbx: (c: string) => c.includes("ViewportFrame"),
      validateLuau: (c: string) => c.includes("ViewportFrame")
    },
    {
      id: 91,
      title: "Архитектура: ECS (Components)",
      descRbx: "ECS разделяет данные (Component) и логику (System).",
      descLuau: "Компоненты — это простые таблицы с данными, привязанные к ID сущности (Entity).",
      task: "Создайте таблицу 'healthComponent' с полем value = 100.",
      initialCodeRbx: "// Компонент здоровья\n",
      initialCodeLuau: "-- Компонент здоровья\n",
      validateRbx: (c: string) => c.includes("value") && c.includes("100"),
      validateLuau: (c: string) => c.includes("value") && c.includes("100")
    },
    {
      id: 92,
      title: "Архитектура: ECS (Systems)",
      descRbx: "Системы обрабатывают все сущности, у которых есть нужный набор компонентов.",
      descLuau: "Разделение логики по системам делает код модульным и легко расширяемым.",
      task: "Создайте функцию 'updateSystem' принимающую 'dt'.",
      initialCodeRbx: "func updateSystem(dt) {\n    \n}\n",
      initialCodeLuau: "local function updateSystem(dt)\n    \nend\n",
      validateRbx: (c: string) => c.includes("updateSystem"),
      validateLuau: (c: string) => c.includes("updateSystem")
    },
    {
      id: 93,
      title: "Архитектура: Wrappers (Обертки)",
      descRbx: "Обертки скрывают сложность Roblox API за вашими собственными методами.",
      descLuau: "Создание класса-обертки для игрока позволяет легко добавлять методы .LevelUp() или .GiveGold().",
      task: "Создайте функцию 'wrap(instance)' которая возвращает таблицу с этим объектом.",
      initialCodeRbx: "func wrap(obj) {\n    return { instance: obj }\n}\n",
      initialCodeLuau: "local function wrap(obj)\n    return { instance = obj }\nend\n",
      validateRbx: (c: string) => c.includes("instance:"),
      validateLuau: (c: string) => c.includes("instance =")
    },
    {
      id: 94,
      title: "Архитектура: State Management",
      descRbx: "Управляйте состоянием игры через центральное хранилище (Store).",
      descLuau: "Паттерн 'Single Source of Truth' предотвращает рассинхронизацию данных в разных частях кода.",
      task: "Создайте таблицу 'store' с полем 'state' и методом 'getState'.",
      initialCodeRbx: "var store = { state: {} }\n",
      initialCodeLuau: "local store = { state = {} }\n",
      validateRbx: (c: string) => c.includes("store"),
      validateLuau: (c: string) => c.includes("store")
    },
    {
      id: 95,
      title: "Архитектура: Dependency Injection",
      descRbx: "Передавайте зависимости (сервисы) в модуль через конструктор, а не используйте GetService внутри.",
      descLuau: "Внедрение зависимостей (DI) упрощает тестирование кода (Unit Testing).",
      task: "Создайте функцию 'new(tweenService)' которая сохраняет сервис в self.",
      initialCodeRbx: "func new(ts) {\n    var self = { service: ts }\n    return self\n}\n",
      initialCodeLuau: "local function new(ts)\n    local self = { service = ts }\n    return self\nend\n",
      validateRbx: (c: string) => c.includes("service:"),
      validateLuau: (c: string) => c.includes("service =")
    },
    {
      id: 96,
      title: "Архитектура: Event Bus",
      descRbx: "Event Bus позволяет модулям обмениваться сигналами, не зная друг о друге напрямую.",
      descLuau: "Шина событий уменьшает связность (coupling) кода.",
      task: "Создайте функцию 'publish(name, data)' для отправки событий.",
      initialCodeRbx: "func publish(name, data) {\n    \n}\n",
      initialCodeLuau: "local function publish(name, data)\n    \nend\n",
      validateRbx: (c: string) => c.includes("publish"),
      validateLuau: (c: string) => c.includes("publish")
    },
    {
      id: 97,
      title: "Архитектура: Reactive UI",
      descRbx: "Обновляйте интерфейс автоматически при изменении данных в Store.",
      descLuau: "Связывание данных (Data Binding) избавляет от ручного обновления TextLabel при каждом изменении счета.",
      task: "Создайте функцию 'bind(label, value)' которая устанавливает label.Text = value.",
      initialCodeRbx: "func bind(label, val) {\n    label.Text = val\n}\n",
      initialCodeLuau: "local function bind(label, val)\n    label.Text = val\nend\n",
      validateRbx: (c: string) => c.includes("label.Text"),
      validateLuau: (c: string) => c.includes("label.Text")
    },
    {
      id: 98,
      title: "Архитектура: Unit Testing",
      descRbx: "Тесты проверяют правильность работы отдельных функций. Ожидание == Реальность.",
      descLuau: "Используйте assert(value, errorMessage) для базовых проверок в коде.",
      task: "Вызовите assert(2 + 2 == 4, 'Math is broken').",
      initialCodeRbx: "// Ваш тест\n",
      initialCodeLuau: "-- Ваш тест\n",
      validateRbx: (c: string) => c.includes("assert"),
      validateLuau: (c: string) => c.includes("assert")
    },
    {
      id: 99,
      title: "Архитектура: Чистый код",
      descRbx: "Используйте понятные имена и разделяйте функции на мелкие задачи.",
      descLuau: "Код пишется для людей, а не для компьютеров. Хороший код — это понятный код.",
      task: "Переименуйте переменную 'a' в 'playerHealth'.",
      initialCodeRbx: "var playerHealth = 100\n",
      initialCodeLuau: "local playerHealth = 100\n",
      validateRbx: (c: string) => c.includes("playerHealth"),
      validateLuau: (c: string) => c.includes("playerHealth")
    },
    {
      id: 100,
      title: "ФИНАЛЬНЫЙ ЭКЗАМЕН: Двигатель",
      descRbx: "Создайте ядро игрового цикла, которое объединяет ввод, логику и рендеринг.",
      descLuau: "Поздравляем! Вы прошли путь от переменных до архитектуры игровых движков.",
      task: "Создайте функцию 'MainLoop' и подключите её к RunService.Heartbeat.",
      initialCodeRbx: "var rs = game:GetService(\"RunService\")\nfunc MainLoop(dt) {\n    \n}\n",
      initialCodeLuau: "local rs = game:GetService(\"RunService\")\nlocal function MainLoop(dt)\n    \nend\n",
      validateRbx: (c: string) => c.includes("MainLoop") && c.includes("Heartbeat"),
      validateLuau: (c: string) => c.includes("MainLoop") && c.includes("Heartbeat")
    },
    {
      id: 101,
      title: "Движение: Fly (Полет)",
      descRbx: "Полет часто реализуется через BodyVelocity. Это позволяет персонажу игнорировать гравитацию.",
      descLuau: "Fly scripts use physical objects to keep the character hovering and moving in the air.",
      task: "Создайте 'BodyVelocity' и установите его Velocity в Vector3.new(0, 50, 0).",
      initialCodeRbx: "// Создайте BodyVelocity для полета\n",
      initialCodeLuau: "-- Создайте BodyVelocity для полета\n",
      validateRbx: (c: string) => c.includes("BodyVelocity") && c.includes("0, 50, 0"),
      validateLuau: (c: string) => c.includes("BodyVelocity") && c.includes("0, 50, 0")
    },
    {
      id: 102,
      title: "Движение: Noclip",
      descRbx: "Noclip позволяет проходить сквозь стены, отключая CanCollide у всех частей персонажа.",
      descLuau: "Noclip works by setting CanCollide to false for all character parts, usually on Stepped event.",
      task: "Установите CanCollide в false для объекта 'part'.",
      initialCodeRbx: "var part = script.Parent\n",
      initialCodeLuau: "local part = script.Parent\n",
      validateRbx: (c: string) => /CanCollide\s*=\s*false/.test(c),
      validateLuau: (c: string) => /CanCollide\s*=\s*false/.test(c)
    },
    {
      id: 103,
      title: "Движение: SpeedHack",
      descRbx: "Изменение WalkSpeed напрямую — простейший способ ускорить персонажа.",
      descLuau: "Modifying WalkSpeed property of the Humanoid instantly changes move speed.",
      task: "Установите humanoid.WalkSpeed в значение 100.",
      initialCodeRbx: "var humanoid = workspace.Player.Humanoid\n",
      initialCodeLuau: "local humanoid = workspace.Player.Humanoid\n",
      validateRbx: (c: string) => /WalkSpeed\s*=\s*100/.test(c),
      validateLuau: (c: string) => /WalkSpeed\s*=\s*100/.test(c)
    },
    {
      id: 104,
      title: "Движение: Infinite Jump",
      descRbx: "Бесконечный прыжок ловит JumpRequest и принудительно заставляет персонажа прыгать.",
      descLuau: "Infinite Jump connects to JumpRequest and changes state to Jumping manually.",
      task: "Подключите функцию к UserInputService.JumpRequest.",
      initialCodeRbx: "var uis = game:GetService(\"UserInputService\")\n",
      initialCodeLuau: "local uis = game:GetService(\"UserInputService\")\n",
      validateRbx: (c: string) => c.includes("JumpRequest"),
      validateLuau: (c: string) => c.includes("JumpRequest")
    },
    {
      id: 105,
      title: "Движение: SpinBot",
      descRbx: "SpinBot вращает персонажа с огромной скоростью, используя BodyAngularVelocity.",
      descLuau: "SpinBot uses BodyAngularVelocity to make the player spin rapidly around Y axis.",
      task: "Создайте 'BodyAngularVelocity' и установите AngularVelocity в Vector3.new(0, 100, 0).",
      initialCodeRbx: "// Создайте SpinBot\n",
      initialCodeLuau: "-- Создайте SpinBot\n",
      validateRbx: (c: string) => c.includes("BodyAngularVelocity") && c.includes("0, 100, 0"),
      validateLuau: (c: string) => c.includes("BodyAngularVelocity") && c.includes("0, 100, 0")
    },
    {
      id: 106,
      title: "Движение: Click TP",
      descRbx: "Телепортация по клику мыши использует Mouse.Hit для получения координат.",
      descLuau: "Click TP teleports the character to Mouse.Hit position when a key is pressed.",
      task: "Установите CFrame персонажа 'char' в значение 'mouse.Hit'.",
      initialCodeRbx: "var char = workspace.Player\nvar mouse = game:GetService(\"Players\").LocalPlayer:GetMouse()\n",
      initialCodeLuau: "local char = workspace.Player\nlocal mouse = game:GetService(\"Players\").LocalPlayer:GetMouse()\n",
      validateRbx: (c: string) => c.includes("CFrame = mouse.Hit"),
      validateLuau: (c: string) => c.includes("CFrame = mouse.Hit")
    },
    {
      id: 107,
      title: "Движение: Walk on Water",
      descRbx: "Хождение по воде обычно реализуется через создание временной платформы под игроком.",
      descLuau: "Walk on Water can be achieved by placing a transparent part under the character.",
      task: "Создайте 'Part', установите Anchored в true и Transparency в 1.",
      initialCodeRbx: "// Платформа для воды\n",
      initialCodeLuau: "-- Платформа для воды\n",
      validateRbx: (c: string) => c.includes("Anchored = true") && c.includes("Transparency = 1"),
      validateLuau: (c: string) => c.includes("Anchored = true") && c.includes("Transparency = 1")
    },
    {
      id: 108,
      title: "Движение: Anti-AFK",
      descRbx: "Anti-AFK предотвращает вылет из игры, симулируя активность игрока через VirtualUser.",
      descLuau: "Anti-AFK uses VirtualUser to simulate input and prevent the idle kick.",
      task: "Получите сервис 'VirtualUser' и вызовите :CaptureController().",
      initialCodeRbx: "var vu = game:GetService(\"VirtualUser\")\n",
      initialCodeLuau: "local vu = game:GetService(\"VirtualUser\")\n",
      validateRbx: (c: string) => c.includes("CaptureController"),
      validateLuau: (c: string) => c.includes("CaptureController")
    },
    {
      id: 109,
      title: "Движение: High Jump",
      descRbx: "JumpPower определяет высоту прыжка. Обычное значение — 50.",
      descLuau: "Increasing JumpPower allows the player to reach much higher platforms.",
      task: "Установите humanoid.JumpPower в 200.",
      initialCodeRbx: "var humanoid = workspace.Player.Humanoid\n",
      initialCodeLuau: "local humanoid = workspace.Player.Humanoid\n",
      validateRbx: (c: string) => /JumpPower\s*=\s*200/.test(c),
      validateLuau: (c: string) => /JumpPower\s*=\s*200/.test(c)
    },
    {
      id: 110,
      title: "Движение: Vehicle Speed",
      descRbx: "Ускорение транспорта достигается путем изменения MaxSpeed в VehicleSeat.",
      descLuau: "Vehicle speed can be increased by modifying MaxSpeed of the car's seat.",
      task: "Найдите 'VehicleSeat' в workspace и установите MaxSpeed в 500.",
      initialCodeRbx: "// Ускорьте машину\n",
      initialCodeLuau: "-- Ускорьте машину\n",
      validateRbx: (c: string) => c.includes("MaxSpeed = 500"),
      validateLuau: (c: string) => c.includes("MaxSpeed = 500")
    },
    {
      id: 111,
      title: "Бой: Поиск ближайшего врага",
      descRbx: "Для аимбота нужно найти игрока с минимальной дистанцией (Magnitude).",
      descLuau: "Aimbot needs to iterate through players and find the one closest to the mouse or character.",
      task: "В цикле проверьте, если (pos1 - pos2).Magnitude < dist, обновите dist.",
      initialCodeRbx: "var dist = 1000\n",
      initialCodeLuau: "local dist = 1000\n",
      validateRbx: (c: string) => c.includes(".Magnitude < dist"),
      validateLuau: (c: string) => c.includes(".Magnitude < dist")
    },
    {
      id: 112,
      title: "Бой: FOV Circle",
      descRbx: "FOV круг ограничивает зону работы аимбота. Если враг вне круга — аим не сработает.",
      descLuau: "FOV Circle visualizes the area where the aimbot will lock onto targets.",
      task: "Создайте переменную 'radius' = 150 для круга.",
      initialCodeRbx: "// Радиус FOV\n",
      initialCodeLuau: "-- Радиус FOV\n",
      validateRbx: (c: string) => /var\s+radius\s*=\s*150/.test(c),
      validateLuau: (c: string) => /local\s+radius\s*=\s*150/.test(c)
    },
    {
      id: 113,
      title: "Бой: Silent Aim (Логика)",
      descRbx: "Silent Aim перенаправляет пули в цель, даже если вы смотрите в другую сторону.",
      descLuau: "Silent Aim intercepts shooting remotes and replaces target position with enemy head.",
      task: "Создайте таблицу 'args' с полем 'Target' = enemyHead.",
      initialCodeRbx: "var enemyHead = workspace.Enemy.Head\n",
      initialCodeLuau: "local enemyHead = workspace.Enemy.Head\n",
      validateRbx: (c: string) => c.includes("Target") && c.includes("enemyHead"),
      validateLuau: (c: string) => c.includes("Target") && c.includes("enemyHead")
    },
    {
      id: 114,
      title: "Бой: Rapid Fire",
      descRbx: "Rapid Fire вызывает RemoteEvent выстрела многократно без задержки.",
      descLuau: "Rapid Fire spams the weapon fire remote in a fast loop to increase fire rate.",
      task: "Создайте цикл for от 1 до 5 и вызовите :FireServer() внутри.",
      initialCodeRbx: "var remote = game:GetService(\"ReplicatedStorage\").Shoot\n",
      initialCodeLuau: "local remote = game:GetService(\"ReplicatedStorage\").Shoot\n",
      validateRbx: (c: string) => c.includes("for") && c.includes("FireServer"),
      validateLuau: (c: string) => c.includes("for") && c.includes("FireServer")
    },
    {
      id: 115,
      title: "Бой: No Recoil",
      descRbx: "Отдача обычно двигает камеру. Скрипт может возвращать её в исходное положение.",
      descLuau: "No Recoil script detects camera movement from shooting and counteracts it.",
      task: "Установите cam.CFrame в значение 'oldCF' каждый кадр.",
      initialCodeRbx: "var cam = workspace.CurrentCamera\nvar oldCF = cam.CFrame\n",
      initialCodeLuau: "local cam = workspace.CurrentCamera\nlocal oldCF = cam.CFrame\n",
      validateRbx: (c: string) => c.includes("cam.CFrame = oldCF"),
      validateLuau: (c: string) => c.includes("cam.CFrame = oldCF")
    },
    {
      id: 116,
      title: "Бой: Auto Reload",
      descRbx: "Авто-перезарядка проверяет количество патронов и вызывает Reload, если их мало.",
      descLuau: "Auto Reload automatically triggers the reload remote when ammo reaches zero.",
      task: "Если ammo == 0, вызовите :FireServer() у объекта 'reloadRemote'.",
      initialCodeRbx: "var ammo = 0\nvar reloadRemote = game:GetService(\"ReplicatedStorage\").Reload\n",
      initialCodeLuau: "local ammo = 0\nlocal reloadRemote = game:GetService(\"ReplicatedStorage\").Reload\n",
      validateRbx: (c: string) => c.includes("if") && c.includes("ammo == 0") && c.includes("FireServer"),
      validateLuau: (c: string) => c.includes("if") && c.includes("ammo == 0") && c.includes("FireServer")
    },
    {
      id: 117,
      title: "Бой: Wallhack (Shoot through)",
      descRbx: "Чтобы стрелять сквозь стены, нужно добавить объекты окружения в IgnoreList рейкаста.",
      descLuau: "Wallhack shooting works by excluding walls from raycast parameters on the client.",
      task: "Создайте 'RaycastParams' и установите FilterDescendantsInstances в {workspace.Walls}.",
      initialCodeRbx: "// Параметры луча\n",
      initialCodeLuau: "-- Параметры луча\n",
      validateRbx: (c: string) => c.includes("RaycastParams") && c.includes("FilterDescendantsInstances"),
      validateLuau: (c: string) => c.includes("RaycastParams") && c.includes("FilterDescendantsInstances")
    },
    {
      id: 118,
      title: "Бой: Hitbox Expander",
      descRbx: "Увеличение размера головы врага делает попадания по нему гарантированными.",
      descLuau: "Hitbox expander scales enemy's Hitbox (like Head) to be much larger on your client.",
      task: "Установите enemy.Head.Size в Vector3.new(10, 10, 10).",
      initialCodeRbx: "var enemy = workspace.Enemy\n",
      initialCodeLuau: "local enemy = workspace.Enemy\n",
      validateRbx: (c: string) => c.includes("Size = Vector3.new(10, 10, 10)"),
      validateLuau: (c: string) => c.includes("Size = Vector3.new(10, 10, 10)")
    },
    {
      id: 119,
      title: "Бой: Trigger Bot",
      descRbx: "Trigger Bot автоматически стреляет, когда прицел наведен на врага.",
      descLuau: "Trigger Bot checks Mouse.Target and fires if it's a part of a player character.",
      task: "Если mouse.Target.Parent:FindFirstChild('Humanoid'), вызовите функцию 'Shoot'.",
      initialCodeRbx: "var mouse = game:GetService(\"Players\").LocalPlayer:GetMouse()\n",
      initialCodeLuau: "local mouse = game:GetService(\"Players\").LocalPlayer:GetMouse()\n",
      validateRbx: (c: string) => c.includes("mouse.Target") && c.includes("Humanoid"),
      validateLuau: (c: string) => c.includes("mouse.Target") && c.includes("Humanoid")
    },
    {
      id: 120,
      title: "Бой: Kill Aura",
      descRbx: "Kill Aura бьет всех врагов в определенном радиусе автоматически.",
      descLuau: "Kill Aura loops through nearby enemies and sends damage remotes to them.",
      task: "Если (enemy.Position - myPos).Magnitude < 15, вызовите 'Attack'.",
      initialCodeRbx: "var enemy = workspace.Enemy\nvar myPos = workspace.Player.Position\n",
      initialCodeLuau: "local enemy = workspace.Enemy\nlocal myPos = workspace.Player.Position\n",
      validateRbx: (c: string) => c.includes(".Magnitude < 15"),
      validateLuau: (c: string) => c.includes(".Magnitude < 15")
    },
    {
      id: 121,
      title: "Бой: Knife Aura",
      descRbx: "Аналог Kill Aura, но для холодного оружия. Часто имеет меньший радиус.",
      descLuau: "Knife Aura focuses on melee attacks when targets are very close.",
      task: "Установите переменную 'knifeRadius' в значение 5.",
      initialCodeRbx: "// Радиус ножа\n",
      initialCodeLuau: "-- Радиус ножа\n",
      validateRbx: (c: string) => /var\s+knifeRadius\s*=\s*5/.test(c),
      validateLuau: (c: string) => /local\s+knifeRadius\s*=\s*5/.test(c)
    },
    {
      id: 122,
      title: "Бой: Grenade Prediction",
      descRbx: "Предсказание траектории гранаты требует знания начальной скорости и гравитации.",
      descLuau: "Grenade Prediction visualizes the parabolic path of a projectile before throwing.",
      task: "Создайте переменную 'gravity' = workspace.Gravity.",
      initialCodeRbx: "// Гравитация игры\n",
      initialCodeLuau: "-- Гравитация игры\n",
      validateRbx: (c: string) => c.includes("workspace.Gravity"),
      validateLuau: (c: string) => c.includes("workspace.Gravity")
    },
    {
      id: 123,
      title: "Бой: Shield Bypass",
      descRbx: "Обход щита часто заключается в отправке урона напрямую, игнорируя защиту.",
      descLuau: "Shield Bypass attempts to send damage events that the server doesn't filter for shields.",
      task: "Вызовите RemoteEvent 'Damage' с аргументом 'IgnoreShield' = true.",
      initialCodeRbx: "var remote = game:GetService(\"ReplicatedStorage\").Damage\n",
      initialCodeLuau: "local remote = game:GetService(\"ReplicatedStorage\").Damage\n",
      validateRbx: (c: string) => c.includes("IgnoreShield") && c.includes("true"),
      validateLuau: (c: string) => c.includes("IgnoreShield") && c.includes("true")
    },
    {
      id: 124,
      title: "Бой: Health ESP (Combat)",
      descRbx: "Отображение здоровья врага прямо над его головой для тактического преимущества.",
      descLuau: "Health ESP creates a BillboardGui on enemy heads to show their HP percentage.",
      task: "Установите 'textLabel.Text' в значение humanoid.Health.",
      initialCodeRbx: "var humanoid = workspace.Enemy.Humanoid\nvar textLabel = Instance.new(\"TextLabel\")\n",
      initialCodeLuau: "local humanoid = workspace.Enemy.Humanoid\nlocal textLabel = Instance.new(\"TextLabel\")\n",
      validateRbx: (c: string) => c.includes("humanoid.Health"),
      validateLuau: (c: string) => c.includes("humanoid.Health")
    },
    {
      id: 125,
      title: "Бой: Team Check",
      descRbx: "Проверка команды важна, чтобы аимбот не стрелял по своим союзникам.",
      descLuau: "Team Check ensures that exploits only target players on the opposing team.",
      task: "Если player.Team != myPlayer.Team, напечатайте 'Enemy!'.",
      initialCodeRbx: "var player = game:GetService(\"Players\").Enemy\nvar myPlayer = game:GetService(\"Players\").LocalPlayer\n",
      initialCodeLuau: "local player = game:GetService(\"Players\").Enemy\nlocal myPlayer = game:GetService(\"Players\").LocalPlayer\n",
      validateRbx: (c: string) => c.includes("player.Team != myPlayer.Team"),
      validateLuau: (c: string) => c.includes("player.Team ~= myPlayer.Team")
    },
    {
      id: 126,
      title: "Визуалы: Highlights (ESP)",
      descRbx: "Объект Highlight позволяет подсветить персонажа целиком, даже сквозь стены.",
      descLuau: "Highlight objects provide a clean and built-in way to create ESP effects.",
      task: "Создайте 'Highlight' и установите FillColor в Color3.new(1, 0, 0).",
      initialCodeRbx: "// Создайте подсветку\n",
      initialCodeLuau: "-- Создайте подсветку\n",
      validateRbx: (c: string) => c.includes("Highlight") && c.includes("FillColor"),
      validateLuau: (c: string) => c.includes("Highlight") && c.includes("FillColor")
    },
    {
      id: 127,
      title: "Визуалы: Tracers (Линии)",
      descRbx: "Трейсеры — это линии от низа экрана до каждого игрока.",
      descLuau: "Tracers draw lines between a fixed point (usually screen bottom) and other players.",
      task: "Создайте переменную 'from' = Vector2.new(cam.ViewportSize.X/2, cam.ViewportSize.Y).",
      initialCodeRbx: "var cam = workspace.CurrentCamera\n",
      initialCodeLuau: "local cam = workspace.CurrentCamera\n",
      validateRbx: (c: string) => c.includes("ViewportSize.X/2") || c.includes("ViewportSize.X / 2"),
      validateLuau: (c: string) => c.includes("ViewportSize.X/2") || c.includes("ViewportSize.X / 2")
    },
    {
      id: 128,
      title: "Визуалы: Box ESP",
      descRbx: "Box ESP рисует 2D или 3D коробки вокруг персонажей.",
      descLuau: "Box ESP creates visual bounding boxes around players to make them visible through walls.",
      task: "Создайте 'SelectionBox' и установите его Adornee в объект 'enemy'.",
      initialCodeRbx: "var enemy = workspace.Enemy\n",
      initialCodeLuau: "local enemy = workspace.Enemy\n",
      validateRbx: (c: string) => c.includes("SelectionBox") && c.includes("Adornee = enemy"),
      validateLuau: (c: string) => c.includes("SelectionBox") && c.includes("Adornee = enemy")
    },
    {
      id: 129,
      title: "Визуалы: Fullbright",
      descRbx: "Fullbright убирает все тени и делает мир максимально ярким.",
      descLuau: "Fullbright sets lighting brightness and ambient to max to reveal dark areas.",
      task: "Установите game.Lighting.Ambient в Color3.new(1, 1, 1).",
      initialCodeRbx: "// Сделайте мир ярким\n",
      initialCodeLuau: "-- Сделайте мир ярким\n",
      validateRbx: (c: string) => c.includes("Ambient") && c.includes("1, 1, 1"),
      validateLuau: (c: string) => c.includes("Ambient") && c.includes("1, 1, 1")
    },
    {
      id: 130,
      title: "Визуалы: X-Ray",
      descRbx: "X-Ray делает все стены прозрачными, позволяя видеть сквозь карту.",
      descLuau: "X-Ray iterates through map parts and sets their Transparency to a high value.",
      task: "В цикле для всех объектов в 'workspace.Map' установите Transparency в 0.5.",
      initialCodeRbx: "var map = workspace.Map:GetChildren()\n",
      initialCodeLuau: "local map = workspace.Map:GetChildren()\n",
      validateRbx: (c: string) => c.includes("Transparency = 0.5") || c.includes("Transparency = 0.5"),
      validateLuau: (c: string) => c.includes("Transparency = 0.5") || c.includes("Transparency = 0.5")
    },
    {
      id: 131,
      title: "Визуалы: Name ESP",
      descRbx: "Отображение имен игроков над ними с помощью BillboardGui.",
      descLuau: "Name ESP uses BillboardGui with TextLabel to show player names above characters.",
      task: "Создайте 'BillboardGui', сохраните в 'gui', и установите AlwaysOnTop в true.",
      initialCodeRbx: "// GUI над головой\n",
      initialCodeLuau: "-- GUI над головой\n",
      validateRbx: (c: string) => c.includes("BillboardGui") && c.includes("AlwaysOnTop = true"),
      validateLuau: (c: string) => c.includes("BillboardGui") && c.includes("AlwaysOnTop = true")
    },
    {
      id: 132,
      title: "Визуалы: Item ESP",
      descRbx: "Подсветка важных предметов (оружия, квестовых вещей) на карте.",
      descLuau: "Item ESP highlights specific dropped items or objects using tags or names.",
      task: "Найдите все объекты с тегом 'Item' через CollectionService:GetTagged().",
      initialCodeRbx: "var cs = game:GetService(\"CollectionService\")\n",
      initialCodeLuau: "local cs = game:GetService(\"CollectionService\")\n",
      validateRbx: (c: string) => c.includes("GetTagged") && c.includes("Item"),
      validateLuau: (c: string) => c.includes("GetTagged") && c.includes("Item")
    },
    {
      id: 133,
      title: "Визуалы: Skeleton ESP",
      descRbx: "Рисование линий между суставами персонажа для создания эффекта скелета.",
      descLuau: "Skeleton ESP draws lines between character joints like Head to UpperTorso.",
      task: "Создайте переменную 'p1' = char.Head.Position и 'p2' = char.UpperTorso.Position.",
      initialCodeRbx: "var char = workspace.Enemy\n",
      initialCodeLuau: "local char = workspace.Enemy\n",
      validateRbx: (c: string) => c.includes("Head.Position") && c.includes("UpperTorso.Position"),
      validateLuau: (c: string) => c.includes("Head.Position") && c.includes("UpperTorso.Position")
    },
    {
      id: 134,
      title: "Визуалы: Chams",
      descRbx: "Chams — это закрашивание персонажа ярким цветом, игнорируя текстуры.",
      descLuau: "Chams use Highlight or SelectionPart with AlwaysOnTop to make players glow.",
      task: "Установите FillOpacity объекта Highlight в 1.",
      initialCodeRbx: "var h = Instance.new(\"Highlight\")\n",
      initialCodeLuau: "local h = Instance.new(\"Highlight\")\n",
      validateRbx: (c: string) => /FillOpacity\s*=\s*1/.test(c),
      validateLuau: (c: string) => /FillOpacity\s*=\s*1/.test(c)
    },
    {
      id: 135,
      title: "Визуалы: Custom Skybox",
      descRbx: "Замена стандартного неба на пользовательские текстуры.",
      descLuau: "Custom Skybox script creates a Sky object and sets its texture IDs.",
      task: "Создайте объект 'Sky' и установите его в game.Lighting.",
      initialCodeRbx: "// Свое небо\n",
      initialCodeLuau: "-- Свое небо\n",
      validateRbx: (c: string) => c.includes("Instance.new") && c.includes("Sky") && c.includes("game.Lighting"),
      validateLuau: (c: string) => c.includes("Instance.new") && c.includes("Sky") && c.includes("game.Lighting")
    },
    {
      id: 136,
      title: "Визуалы: Fog Removal",
      descRbx: "Удаление тумана позволяет видеть на огромные расстояния.",
      descLuau: "Fog removal sets FogEnd to a very high value or Ambient to clear visibility.",
      task: "Установите game.Lighting.FogEnd в 100000.",
      initialCodeRbx: "// Уберите туман\n",
      initialCodeLuau: "-- Уберите туман\n",
      validateRbx: (c: string) => /FogEnd\s*=\s*100000/.test(c),
      validateLuau: (c: string) => /FogEnd\s*=\s*100000/.test(c)
    },
    {
      id: 137,
      title: "Визуалы: Viewmodel FOV",
      descRbx: "Изменение FOV оружия в руках для лучшей видимости.",
      descLuau: "Viewmodel FOV changes how much space the weapon occupies on screen.",
      task: "Установите cam.FieldOfView в 100.",
      initialCodeRbx: "var cam = workspace.CurrentCamera\n",
      initialCodeLuau: "local cam = workspace.CurrentCamera\n",
      validateRbx: (c: string) => /FieldOfView\s*=\s*100/.test(c),
      validateLuau: (c: string) => /FieldOfView\s*=\s*100/.test(c)
    },
    {
      id: 138,
      title: "Визуалы: Rainbow UI",
      descRbx: "Циклическое изменение цветов интерфейса по спектру радуги.",
      descLuau: "Rainbow UI uses a loop with tick() and Color3.fromHSV to cycle colors.",
      task: "Используйте Color3.fromHSV(tick() % 5 / 5, 1, 1) для изменения цвета.",
      initialCodeRbx: "var label = script.Parent\n",
      initialCodeLuau: "local label = script.Parent\n",
      validateRbx: (c: string) => c.includes("Color3.fromHSV") && c.includes("tick()"),
      validateLuau: (c: string) => c.includes("Color3.fromHSV") && c.includes("tick()")
    },
    {
      id: 139,
      title: "Визуалы: Spectate Mode",
      descRbx: "Режим наблюдения позволяет смотреть глазами другого игрока.",
      descLuau: "Spectate Mode sets CameraSubject to another player's Humanoid.",
      task: "Установите workspace.CurrentCamera.CameraSubject в 'otherHumanoid'.",
      initialCodeRbx: "var otherHumanoid = workspace.Enemy.Humanoid\n",
      initialCodeLuau: "local otherHumanoid = workspace.Enemy.Humanoid\n",
      validateRbx: (c: string) => c.includes("CameraSubject = otherHumanoid"),
      validateLuau: (c: string) => c.includes("CameraSubject = otherHumanoid")
    },
    {
      id: 140,
      title: "Визуалы: No Flash",
      descRbx: "Отключение эффектов ослепления (световых гранат).",
      descLuau: "No Flash finds the flash UI element and disables it or sets transparency to 1.",
      task: "Найдите 'FlashUI' в PlayerGui и установите Enabled в false.",
      initialCodeRbx: "// Нет ослеплению\n",
      initialCodeLuau: "-- Нет ослеплению\n",
      validateRbx: (c: string) => c.includes("FlashUI") && c.includes("Enabled = false"),
      validateLuau: (c: string) => c.includes("FlashUI") && c.includes("Enabled = false")
    },
    {
      id: 141,
      title: "Логика: Auto-Clicker",
      descRbx: "Автоматическое нажатие на ClickDetector в цикле.",
      descLuau: "Auto-Clicker finds ClickDetectors and calls fireclickdetector() if available.",
      task: "Вызовите fireclickdetector(workspace.Part.ClickDetector).",
      initialCodeRbx: "// Авто-клик\n",
      initialCodeLuau: "-- Авто-клик\n",
      validateRbx: (c: string) => c.includes("fireclickdetector"),
      validateLuau: (c: string) => c.includes("fireclickdetector")
    },
    {
      id: 142,
      title: "Логика: Item TP",
      descRbx: "Телепортация всех выпавших предметов к игроку.",
      descLuau: "Item TP moves dropped parts to the player's position using a loop.",
      task: "В цикле установите Position каждого предмета в myChar.Position.",
      initialCodeRbx: "var items = workspace.DroppedItems:GetChildren()\nvar myChar = workspace.Player\n",
      initialCodeLuau: "local items = workspace.DroppedItems:GetChildren()\nlocal myChar = workspace.Player\n",
      validateRbx: (c: string) => c.includes("Position = myChar.Position"),
      validateLuau: (c: string) => c.includes("Position = myChar.Position")
    },
    {
      id: 143,
      title: "Логика: Remote Spy (Теория)",
      descRbx: "Remote Spy логирует все вызовы RemoteEvent, чтобы понять, как работает игра.",
      descLuau: "Remote Spy hooks __namecall and prints arguments sent to the server.",
      task: "Создайте функцию 'spy' которая печатает аргументы '...'.",
      initialCodeRbx: "func spy(...) {\n    print(...)\n}\n",
      initialCodeLuau: "local function spy(...)\n    print(...)\nend\n",
      validateRbx: (c: string) => c.includes("..."),
      validateLuau: (c: string) => c.includes("...")
    },
    {
      id: 144,
      title: "Логика: Auto-Buy",
      descRbx: "Автоматическая покупка предметов через отправку сигналов в магазин.",
      descLuau: "Auto-Buy spams the purchase remote with the desired item ID.",
      task: "Вызовите RemoteFunction 'BuyItem' с аргументом 'Sword'.",
      initialCodeRbx: "var shopRemote = game:GetService(\"ReplicatedStorage\").BuyItem\n",
      initialCodeLuau: "local shopRemote = game:GetService(\"ReplicatedStorage\").BuyItem\n",
      validateRbx: (c: string) => c.includes("InvokeServer") && c.includes("Sword"),
      validateLuau: (c: string) => c.includes("InvokeServer") && c.includes("Sword")
    },
    {
      id: 145,
      title: "Логика: Auto-Quest",
      descRbx: "Автоматическое принятие квестов у NPC.",
      descLuau: "Auto-Quest triggers quest NPCs by calling their proximity prompts or remotes.",
      task: "Вызовите fireproximityprompt(npc.ProximityPrompt).",
      initialCodeRbx: "var npc = workspace.QuestNPC\n",
      initialCodeLuau: "local npc = workspace.QuestNPC\n",
      validateRbx: (c: string) => c.includes("fireproximityprompt"),
      validateLuau: (c: string) => c.includes("fireproximityprompt")
    },
    {
      id: 146,
      title: "Логика: Chest Collector",
      descRbx: "Поиск и сбор всех сундуков на карте.",
      descLuau: "Chest Collector finds parts with 'Chest' in name and tweens the player to them.",
      task: "Если объект.Name содержит 'Chest', напечатайте 'Found!'.",
      initialCodeRbx: "var obj = workspace.Part\n",
      initialCodeLuau: "local obj = workspace.Part\n",
      validateRbx: (c: string) => c.includes("string.find") || c.includes("includes"),
      validateLuau: (c: string) => c.includes("string.find") || c.includes("match")
    },
    {
      id: 147,
      title: "Логика: Mob Farm",
      descRbx: "Телепортация игрока над мобом для безопасной атаки.",
      descLuau: "Mob Farm keeps the player at a fixed offset above an enemy.",
      task: "Установите CFrame игрока в mob.CFrame * CFrame.new(0, 10, 0).",
      initialCodeRbx: "var mob = workspace.Mob\n",
      initialCodeLuau: "local mob = workspace.Mob\n",
      validateRbx: (c: string) => c.includes("CFrame.new(0, 10, 0)"),
      validateLuau: (c: string) => c.includes("CFrame.new(0, 10, 0)")
    },
    {
      id: 148,
      title: "Логика: Inventory Stacker",
      descRbx: "Автоматическое объединение предметов в инвентаре.",
      descLuau: "Inventory Stacker calls the merge remote for items of the same type.",
      task: "Вызовите RemoteEvent 'Merge' с аргументами (item1, item2).",
      initialCodeRbx: "var item1, item2 = 1, 2\n",
      initialCodeLuau: "local item1, item2 = 1, 2\n",
      validateRbx: (c: string) => c.includes("Merge") && c.includes("item1"),
      validateLuau: (c: string) => c.includes("Merge") && c.includes("item1")
    },
    {
      id: 149,
      title: "Логика: Chat Logger",
      descRbx: "Логирование всех сообщений в чате (даже скрытых).",
      descLuau: "Chat Logger connects to the Chatted event of every player.",
      task: "Подключите функцию к player.Chatted.",
      initialCodeRbx: "var player = game:GetService(\"Players\").LocalPlayer\n",
      initialCodeLuau: "local player = game:GetService(\"Players\").LocalPlayer\n",
      validateRbx: (c: string) => c.includes("Chatted"),
      validateLuau: (c: string) => c.includes("Chatted")
    },
    {
      id: 150,
      title: "Логика: Auto-Reply",
      descRbx: "Автоматический ответ на определенные фразы в чате.",
      descLuau: "Auto-Reply scans incoming messages and sends a response if keywords are found.",
      task: "Если msg == 'Hello', вызовите game:GetService('ReplicatedStorage').DefaultChatSystemChatEvents.SayMessageRequest:FireServer('Hi!', 'All').",
      initialCodeRbx: "var msg = \"Hello\"\n",
      initialCodeLuau: "local msg = \"Hello\"\n",
      validateRbx: (c: string) => c.includes("SayMessageRequest") && c.includes("Hi!"),
      validateLuau: (c: string) => c.includes("SayMessageRequest") && c.includes("Hi!")
    },
    {
      id: 151,
      title: "Логика: Game Stats Tracker",
      descRbx: "Отслеживание статистики игрока (уровень, деньги) через Leaderstats.",
      descLuau: "Game Stats Tracker reads values from the player's leaderstats folder.",
      task: "Получите значение 'Gold' из папки 'leaderstats' игрока.",
      initialCodeRbx: "var gold = game:GetService(\"Players\").LocalPlayer.leaderstats.Gold.Value\n",
      initialCodeLuau: "local gold = game:GetService(\"Players\").LocalPlayer.leaderstats.Gold.Value\n",
      validateRbx: (c: string) => c.includes("leaderstats") && c.includes("Gold"),
      validateLuau: (c: string) => c.includes("leaderstats") && c.includes("Gold")
    },
    {
      id: 152,
      title: "Логика: Shop Bypass (Visual)",
      descRbx: "Открытие интерфейса магазина без взаимодействия с NPC.",
      descLuau: "Shop Bypass makes the shop GUI visible directly by setting Enabled to true.",
      task: "Установите shopGui.Enabled в true.",
      initialCodeRbx: "var shopGui = game:GetService(\"Players\").LocalPlayer.PlayerGui.Shop\n",
      initialCodeLuau: "local shopGui = game:GetService(\"Players\").LocalPlayer.PlayerGui.Shop\n",
      validateRbx: (c: string) => /Enabled\s*=\s*true/.test(c),
      validateLuau: (c: string) => /Enabled\s*=\s*true/.test(c)
    },
    {
      id: 153,
      title: "Логика: Speed Hack (Physics)",
      descRbx: "Ускорение через прямое изменение Velocity объекта Character.",
      descLuau: "Physics Speed Hack adds velocity to the character to bypass WalkSpeed checks.",
      task: "Установите root.Velocity в значение root.CFrame.LookVector * 100.",
      initialCodeRbx: "var root = workspace.Player.HumanoidRootPart\n",
      initialCodeLuau: "local root = workspace.Player.HumanoidRootPart\n",
      validateRbx: (c: string) => c.includes("LookVector * 100"),
      validateLuau: (c: string) => c.includes("LookVector * 100")
    },
    {
      id: 154,
      title: "Логика: Low Gravity",
      descRbx: "Уменьшение гравитации позволяет прыгать выше и падать медленнее.",
      descLuau: "Low Gravity script modifies workspace.Gravity to a lower value like 50.",
      task: "Установите workspace.Gravity в 50.",
      initialCodeRbx: "// Низкая гравитация\n",
      initialCodeLuau: "-- Низкая гравитация\n",
      validateRbx: (c: string) => /Gravity\s*=\s*50/.test(c),
      validateLuau: (c: string) => /Gravity\s*=\s*50/.test(c)
    },
    {
      id: 155,
      title: "Логика: No Fall Damage",
      descRbx: "Обход урона от падения через обнуление вертикальной скорости перед приземлением.",
      descLuau: "No Fall Damage checks distance to ground and resets Y velocity if too high.",
      task: "Если root.Velocity.Y < -50, установите root.Velocity в Vector3.new(0, 0, 0).",
      initialCodeRbx: "var root = workspace.Player.HumanoidRootPart\n",
      initialCodeLuau: "local root = workspace.Player.HumanoidRootPart\n",
      validateRbx: (c: string) => c.includes("Velocity.Y < -50"),
      validateLuau: (c: string) => c.includes("Velocity.Y < -50")
    },
    {
      id: 156,
      title: "Логика: Auto-Heal",
      descRbx: "Автоматическое использование аптечки при низком здоровье.",
      descLuau: "Auto-Heal triggers healing items or remotes when health drops below 30%.",
      task: "Если humanoid.Health < 30, вызовите функцию 'UseMedkit'.",
      initialCodeRbx: "var humanoid = workspace.Player.Humanoid\n",
      initialCodeLuau: "local humanoid = workspace.Player.Humanoid\n",
      validateRbx: (c: string) => c.includes("Health < 30"),
      validateLuau: (c: string) => c.includes("Health < 30")
    },
    {
      id: 157,
      title: "Логика: ESP Distance",
      descRbx: "Расчет и отображение дистанции до цели в ESP.",
      descLuau: "ESP Distance shows how many studs away a player is from you.",
      task: "Рассчитайте 'dist' как math.floor((p1 - p2).Magnitude).",
      initialCodeRbx: "var p1, p2 = Vector3.new(0,0,0), Vector3.new(10,5,10)\n",
      initialCodeLuau: "local p1, p2 = Vector3.new(0,0,0), Vector3.new(10,5,10)\n",
      validateRbx: (c: string) => c.includes("math.floor") && c.includes(".Magnitude"),
      validateLuau: (c: string) => c.includes("math.floor") && c.includes(".Magnitude")
    },
    {
      id: 158,
      title: "Логика: Server Hopper",
      descRbx: "Скрипт для быстрого поиска и перехода на другой сервер той же игры.",
      descLuau: "Server Hopper uses HttpService to find public servers and TeleportService to join them.",
      task: "Получите сервис 'TeleportService' и сохраните в 'ts'.",
      initialCodeRbx: "// Телепортация\n",
      initialCodeLuau: "-- Телепортация\n",
      validateRbx: (c: string) => c.includes("TeleportService"),
      validateLuau: (c: string) => c.includes("TeleportService")
    },
    {
      id: 159,
      title: "Логика: Rejoin Script",
      descRbx: "Быстрый перезаход на тот же самый сервер.",
      descLuau: "Rejoin Script uses TeleportService:TeleportToPlaceInstance to join the current JobId.",
      task: "Вызовите ts:Teleport(game.PlaceId, game.Players.LocalPlayer).",
      initialCodeRbx: "var ts = game:GetService(\"TeleportService\")\n",
      initialCodeLuau: "local ts = game:GetService(\"TeleportService\")\n",
      validateRbx: (c: string) => c.includes("Teleport") && c.includes("PlaceId"),
      validateLuau: (c: string) => c.includes("Teleport") && c.includes("PlaceId")
    },
    {
      id: 160,
      title: "Логика: Anti-Kick",
      descRbx: "Предотвращение кика из игры путем перехвата метода Kick.",
      descLuau: "Anti-Kick hooks the Player:Kick method to prevent the game from closing your session.",
      task: "Создайте переменную 'kickHooked' = true.",
      initialCodeRbx: "// Заглушка для кика\n",
      initialCodeLuau: "-- Заглушка для кика\n",
      validateRbx: (c: string) => /var\s+kickHooked\s*=\s*true/.test(c),
      validateLuau: (c: string) => /local\s+kickHooked\s*=\s*true/.test(c)
    },
    {
      id: 161,
      title: "Безопасность: PlaceId Check",
      descRbx: "Проверка PlaceId гарантирует, что скрипт запустится только в нужной игре.",
      descLuau: "PlaceId checking prevents your script from running in unauthorized games.",
      task: "Если game.PlaceId == 12345678, напечатайте 'Correct Game'.",
      initialCodeRbx: "// Проверка ID игры\n",
      initialCodeLuau: "-- Проверка ID игры\n",
      validateRbx: (c: string) => c.includes("game.PlaceId == 12345678"),
      validateLuau: (c: string) => c.includes("game.PlaceId == 12345678")
    },
    {
      id: 162,
      title: "Безопасность: JobId Check",
      descRbx: "JobId уникален для каждого сервера. Полезно для функций 'только для этого сервера'.",
      descLuau: "JobId uniquely identifies a server instance within a Roblox game.",
      task: "Напечатайте game.JobId.",
      initialCodeRbx: "// Вывод ID сервера\n",
      initialCodeLuau: "-- Вывод ID сервера\n",
      validateRbx: (c: string) => c.includes("game.JobId"),
      validateLuau: (c: string) => c.includes("game.JobId")
    },
    {
      id: 163,
      title: "Безопасность: Anti-Cheat Theory",
      descRbx: "Понимание того, как античиты ищут изменения в памяти и переменных.",
      descLuau: "Anti-cheats look for suspicious WalkSpeed, fly behavior, and remote spamming.",
      task: "Создайте таблицу 'ac_detects' с полем 'speed' = true.",
      initialCodeRbx: "// База античита\n",
      initialCodeLuau: "-- База античита\n",
      validateRbx: (c: string) => c.includes("speed") && c.includes("true"),
      validateLuau: (c: string) => c.includes("speed") && c.includes("true")
    },
    {
      id: 164,
      title: "Безопасность: pcall Usage",
      descRbx: "pcall (protected call) запускает функцию и не дает скрипту упасть при ошибке.",
      descLuau: "pcall is essential for running exploit code that might touch nil objects.",
      task: "Вызовите pcall(func() { print(1) }).",
      initialCodeRbx: "// Безопасный вызов\n",
      initialCodeLuau: "-- Безопасный вызов\n",
      validateRbx: (c: string) => c.includes("pcall"),
      validateLuau: (c: string) => c.includes("pcall")
    },
    {
      id: 165,
      title: "Безопасность: xpcall Usage",
      descRbx: "xpcall позволяет не только поймать ошибку, но и обработать её в специальной функции.",
      descLuau: "xpcall provides a custom error handler for better debugging of script failures.",
      task: "Используйте xpcall с двумя функциями.",
      initialCodeRbx: "// Расширенный pcall\n",
      initialCodeLuau: "-- Расширенный pcall\n",
      validateRbx: (c: string) => c.includes("xpcall"),
      validateLuau: (c: string) => c.includes("xpcall")
    },
    {
      id: 166,
      title: "Безопасность: Environment Check",
      descRbx: "Проверка наличия getgenv() позволяет узнать, запущен ли код в эксплойте.",
      descLuau: "getgenv is a global table provided by most high-end Roblox exploits.",
      task: "Если getgenv != nil, напечатайте 'Exploit Detected'.",
      initialCodeRbx: "// Проверка окружения\n",
      initialCodeLuau: "-- Проверка окружения\n",
      validateRbx: (c: string) => c.includes("getgenv"),
      validateLuau: (c: string) => c.includes("getgenv")
    },
    {
      id: 167,
      title: "Безопасность: Loadstring Script Hub",
      descRbx: "Loadstring загружает и исполняет код из внешней строки или URL.",
      descLuau: "loadstring is the standard way to load cloud-based script hubs.",
      task: "Вызовите loadstring('print(\"Hello\")')().",
      initialCodeRbx: "// Динамический код\n",
      initialCodeLuau: "-- Динамический код\n",
      validateRbx: (c: string) => c.includes("loadstring"),
      validateLuau: (c: string) => c.includes("loadstring")
    },
    {
      id: 168,
      title: "Безопасность: identifyexecutor",
      descRbx: "Функция identifyexecutor() возвращает название и версию вашего эксплойта.",
      descLuau: "Identifyexecutor helps scripts adapt to different exploit environments.",
      task: "Напечатайте результат вызова identifyexecutor().",
      initialCodeRbx: "// Кто я?\n",
      initialCodeLuau: "-- Кто я?\n",
      validateRbx: (c: string) => c.includes("identifyexecutor"),
      validateLuau: (c: string) => c.includes("identifyexecutor")
    },
    {
      id: 169,
      title: "Безопасность: Random Delays",
      descRbx: "Использование math.random в task.wait() помогает обходить лимиты (rate limits).",
      descLuau: "Random delays make your script behavior less predictable for server-side logs.",
      task: "Вызовите task.wait(math.random(1, 5) / 10).",
      initialCodeRbx: "// Случайная пауза\n",
      initialCodeLuau: "-- Случайная пауза\n",
      validateRbx: (c: string) => c.includes("math.random") && c.includes("task.wait"),
      validateLuau: (c: string) => c.includes("math.random") && c.includes("task.wait")
    },
    {
      id: 170,
      title: "Безопасность: Obfuscation Theory",
      descRbx: "Обфускация запутывает код, делая его нечитаемым для человека.",
      descLuau: "Obfuscation replaces variable names with random strings to protect your source.",
      task: "Замените имя 'health' на '_0x1a2b'.",
      initialCodeRbx: "var _0x1a2b = 100\n",
      initialCodeLuau: "local _0x1a2b = 100\n",
      validateRbx: (c: string) => c.includes("_0x1a2b"),
      validateLuau: (c: string) => c.includes("_0x1a2b")
    },
    {
      id: 171,
      title: "Безопасность: HWID Basics",
      descRbx: "HWID (Hardware ID) — уникальный идентификатор вашего компьютера.",
      descLuau: "HWID is used by script developers to whitelist users for paid scripts.",
      task: "Создайте переменную 'myHwid' со значением 'ABC-123'.",
      initialCodeRbx: "// Ваш ID железа\n",
      initialCodeLuau: "-- Ваш ID железа\n",
      validateRbx: (c: string) => c.includes("ABC-123"),
      validateLuau: (c: string) => c.includes("ABC-123")
    },
    {
      id: 172,
      title: "Безопасность: Synapse/Sentinel Check",
      descRbx: "Специфические проверки для популярных эксплойтов прошлого.",
      descLuau: "Legacy checks for specific exploit globals like Synapse's 'syn'.",
      task: "Если syn != nil, напечатайте 'Synapse User'.",
      initialCodeRbx: "// Проверка Synapse\n",
      initialCodeLuau: "-- Проверка Synapse\n",
      validateRbx: (c: string) => c.includes("syn"),
      validateLuau: (c: string) => c.includes("syn")
    },
    {
      id: 173,
      title: "Безопасность: Deleting LocalScripts",
      descRbx: "Удаление античит-скриптов игры из папки Character.",
      descLuau: "Removing local anticheat scripts can sometimes disable game protections.",
      task: "Вызовите :Destroy() у скрипта с именем 'Anticheat'.",
      initialCodeRbx: "var ac = workspace.Player:FindFirstChild(\"Anticheat\")\n",
      initialCodeLuau: "local ac = workspace.Player:FindFirstChild(\"Anticheat\")\n",
      validateRbx: (c: string) => c.includes("Destroy"),
      validateLuau: (c: string) => c.includes("Destroy")
    },
    {
      id: 174,
      title: "Безопасность: Overriding Constants",
      descRbx: "debug.setconstant позволяет менять значения переменных внутри уже запущенных функций.",
      descLuau: "Debug library manipulation is an advanced way to modify game logic at runtime.",
      task: "Вызовите debug.setconstant(func, 1, 999).",
      initialCodeRbx: "// Изменение константы\n",
      initialCodeLuau: "-- Изменение константы\n",
      validateRbx: (c: string) => c.includes("debug.setconstant"),
      validateLuau: (c: string) => c.includes("debug.setconstant")
    },
    {
      id: 175,
      title: "Безопасность: Remote Obfuscation",
      descRbx: "Отправка 'мусорных' данных вместе с полезными, чтобы запутать Remote Spy.",
      descLuau: "Remote obfuscation adds fake arguments to remotes to hide the real data.",
      task: "Вызовите :FireServer() с аргументами (1, \"fake\", true, \"real_data\").",
      initialCodeRbx: "var r = game:GetService(\"ReplicatedStorage\").Remote\n",
      initialCodeLuau: "local r = game:GetService(\"ReplicatedStorage\").Remote\n",
      validateRbx: (c: string) => c.includes("fake") && c.includes("real_data"),
      validateLuau: (c: string) => c.includes("fake") && c.includes("real_data")
    },
    {
      id: 176,
      title: "Безопасность: Checking for Anti-cheat scripts",
      descRbx: "Поиск скриптов с подозрительными именами в игре.",
      descLuau: "Scanning the game for scripts named 'Anticheat' or 'AC' to avoid detection.",
      task: "Если game:FindFirstChild('Anticheat', true), напечатайте 'Danger!'.",
      initialCodeRbx: "// Поиск AC\n",
      initialCodeLuau: "-- Поиск AC\n",
      validateRbx: (c: string) => c.includes("FindFirstChild") && c.includes("Anticheat"),
      validateLuau: (c: string) => c.includes("FindFirstChild") && c.includes("Anticheat")
    },
    {
      id: 177,
      title: "Безопасность: Raycast Bypass",
      descRbx: "Фильтрация результатов рейкаста, чтобы он игнорировал определенные слои.",
      descLuau: "Raycast bypass ensures that server-side visibility checks can be manipulated.",
      task: "Установите CollisionGroup для RaycastParams.",
      initialCodeRbx: "var params = RaycastParams.new()\n",
      initialCodeLuau: "local params = RaycastParams.new()\n",
      validateRbx: (c: string) => c.includes("CollisionGroup"),
      validateLuau: (c: string) => c.includes("CollisionGroup")
    },
    {
      id: 178,
      title: "Безопасность: Humanoid State Bypass",
      descRbx: "Принудительное изменение состояния Humanoid для обхода проверок на полет.",
      descLuau: "Bypassing fly detection by setting Humanoid state to Physics or PlatformStanding.",
      task: "Вызовите humanoid:ChangeState(Enum.HumanoidStateType.Physics).",
      initialCodeRbx: "var humanoid = workspace.Player.Humanoid\n",
      initialCodeLuau: "local humanoid = workspace.Player.Humanoid\n",
      validateRbx: (c: string) => c.includes("ChangeState") && c.includes("Physics"),
      validateLuau: (c: string) => c.includes("ChangeState") && c.includes("Physics")
    },
    {
      id: 179,
      title: "Безопасность: WalkSpeed __index Bypass",
      descRbx: "Перехват обращения к WalkSpeed, чтобы игра думала, что скорость стандартная.",
      descLuau: "Hooking __index to return 16 when the game checks your WalkSpeed, even if it's 100.",
      task: "Создайте функцию-хук, которая возвращает 16 для 'WalkSpeed'.",
      initialCodeRbx: "func hook(obj, key) {\n    if (key == \"WalkSpeed\") { return 16 }\n}\n",
      initialCodeLuau: "local function hook(obj, key)\n    if key == \"WalkSpeed\" then return 16 end\nend\n",
      validateRbx: (c: string) => c.includes("WalkSpeed") && c.includes("16"),
      validateLuau: (c: string) => c.includes("WalkSpeed") && c.includes("16")
    },
    {
      id: 180,
      title: "Безопасность: ContentProvider Integrity",
      descRbx: "Проверка целостности ассетов игры.",
      descLuau: "Using ContentProvider to check if game assets have been tampered with.",
      task: "Получите сервис 'ContentProvider' и сохраните в 'cp'.",
      initialCodeRbx: "// Сервис ассетов\n",
      initialCodeLuau: "-- Сервис ассетов\n",
      validateRbx: (c: string) => c.includes("ContentProvider"),
      validateLuau: (c: string) => c.includes("ContentProvider")
    },
    {
      id: 181,
      title: "Окружение: getgenv()",
      descRbx: "getgenv() — это глобальное хранилище данных, доступное всем вашим скриптам.",
      descLuau: "getgenv is used to store shared settings or functions across multiple scripts in an exploit.",
      task: "Установите getgenv().mySecret = 123.",
      initialCodeRbx: "getgenv().mySecret = 123\n",
      initialCodeLuau: "getgenv().mySecret = 123\n",
      validateRbx: (c: string) => c.includes("getgenv") && c.includes("mySecret"),
      validateLuau: (c: string) => c.includes("getgenv") && c.includes("mySecret")
    },
    {
      id: 182,
      title: "Окружение: getreg()",
      descRbx: "getreg() возвращает реестр Lua, где хранятся все функции и таблицы.",
      descLuau: "getreg provides access to the Lua registry, a powerful tool for low-level introspection.",
      task: "Создайте переменную 'reg' и присвойте ей getreg().",
      initialCodeRbx: "// Доступ к реестру\n",
      initialCodeLuau: "-- Доступ к реестру\n",
      validateRbx: (c: string) => c.includes("getreg()"),
      validateLuau: (c: string) => c.includes("getreg()")
    },
    {
      id: 183,
      title: "Окружение: getgc()",
      descRbx: "getgc() позволяет получить все объекты, которые скоро удалит сборщик мусора.",
      descLuau: "getgc (get garbage collector) can be used to find hidden functions or tables in memory.",
      task: "Вызовите getgc() и сохраните результат в 'objects'.",
      initialCodeRbx: "// Сборщик мусора\n",
      initialCodeLuau: "-- Сборщик мусора\n",
      validateRbx: (c: string) => c.includes("getgc()"),
      validateLuau: (c: string) => c.includes("getgc()")
    },
    {
      id: 184,
      title: "Окружение: Hooking (База)",
      descRbx: "Хукинг позволяет подменить оригинальную функцию своей собственной.",
      descLuau: "Function hooking is the core of most advanced exploit features like Silent Aim.",
      task: "Создайте переменную 'oldPrint' и сохраните в неё 'print'.",
      initialCodeRbx: "var oldPrint = print\n",
      initialCodeLuau: "local oldPrint = print\n",
      validateRbx: (c: string) => c.includes("oldPrint = print"),
      validateLuau: (c: string) => c.includes("oldPrint = print")
    },
    {
      id: 185,
      title: "Окружение: hookmetamethod",
      descRbx: "hookmetamethod — самый мощный способ перехвата системных вызовов Roblox.",
      descLuau: "hookmetamethod allows you to hook __namecall, __index, and other metatable operations.",
      task: "Вызовите hookmetamethod(game, '__namecall', func() {}).",
      initialCodeRbx: "// Перехват namecall\n",
      initialCodeLuau: "-- Перехват namecall\n",
      validateRbx: (c: string) => c.includes("hookmetamethod") && c.includes("__namecall"),
      validateLuau: (c: string) => c.includes("hookmetamethod") && c.includes("__namecall")
    },
    {
      id: 186,
      title: "Окружение: Metatable setreadonly",
      descRbx: "Делает метатаблицу доступной для записи, чтобы её можно было изменить.",
      descLuau: "setreadonly(mt, false) is required before you can hook any metamethods.",
      task: "Вызовите setreadonly(mt, false).",
      initialCodeRbx: "var mt = getrawmetatable(game)\n",
      initialCodeLuau: "local mt = getrawmetatable(game)\n",
      validateRbx: (c: string) => c.includes("setreadonly") && c.includes("false"),
      validateLuau: (c: string) => c.includes("setreadonly") && c.includes("false")
    },
    {
      id: 187,
      title: "Окружение: getrawmetatable",
      descRbx: "Получает настоящую метатаблицу объекта, игнорируя защиту.",
      descLuau: "getrawmetatable bypasses the 'The metatable is locked' error in Roblox.",
      task: "Получите сырую метатаблицу 'game' и сохраните в 'mt'.",
      initialCodeRbx: "// Сырая метатаблица\n",
      initialCodeLuau: "-- Сырая метатаблица\n",
      validateRbx: (c: string) => c.includes("getrawmetatable(game)"),
      validateLuau: (c: string) => c.includes("getrawmetatable(game)")
    },
    {
      id: 188,
      title: "Окружение: Drawing Library",
      descRbx: "Drawing — это внешняя библиотека для рисования линий, кругов и текста поверх игры.",
      descLuau: "Drawing library is used to create visual overlays (ESP, FOV) that don't use game objects.",
      task: "Создайте 'Circle' через Drawing.new('Circle').",
      initialCodeRbx: "var circle = Drawing.new(\"Circle\")\n",
      initialCodeLuau: "local circle = Drawing.new(\"Circle\")\n",
      validateRbx: (c: string) => c.includes("Drawing.new") && c.includes("Circle"),
      validateLuau: (c: string) => c.includes("Drawing.new") && c.includes("Circle")
    },
    {
      id: 189,
      title: "Окружение: writefile/readfile",
      descRbx: "Сохранение и загрузка данных из текстовых файлов на вашем диске.",
      descLuau: "writefile and readfile are used for saving user configurations and settings.",
      task: "Вызовите writefile('config.txt', 'Hello').",
      initialCodeRbx: "// Запись файла\n",
      initialCodeLuau: "-- Запись файла\n",
      validateRbx: (c: string) => c.includes("writefile") && c.includes("config.txt"),
      validateLuau: (c: string) => c.includes("writefile") && c.includes("config.txt")
    },
    {
      id: 190,
      title: "Окружение: getcustomasset",
      descRbx: "Загрузка ваших собственных изображений и звуков в игру.",
      descLuau: "getcustomasset allows you to use local files as textures for UI and 3D objects.",
      task: "Создайте переменную 'asset' и присвойте ей getcustomasset('logo.png').",
      initialCodeRbx: "// Свой ассет\n",
      initialCodeLuau: "-- Свой ассет\n",
      validateRbx: (c: string) => c.includes("getcustomasset"),
      validateLuau: (c: string) => c.includes("getcustomasset")
    },
    {
      id: 191,
      title: "Окружение: getconnections",
      descRbx: "Позволяет найти и отключить любые игровые события (например, Touched).",
      descLuau: "getconnections returns a list of all functions connected to a specific event.",
      task: "Вызовите getconnections(part.Touched).",
      initialCodeRbx: "var part = workspace.Part\n",
      initialCodeLuau: "local part = workspace.Part\n",
      validateRbx: (c: string) => c.includes("getconnections"),
      validateLuau: (c: string) => c.includes("getconnections")
    },
    {
      id: 192,
      title: "Окружение: firetouchinterest",
      descRbx: "Симуляция физического касания объекта игроком.",
      descLuau: "firetouchinterest triggers Touched events without the player actually touching the part.",
      task: "Вызовите firetouchinterest(myChar.Head, targetPart, 0).",
      initialCodeRbx: "var myChar = workspace.Player\nvar targetPart = workspace.Part\n",
      initialCodeLuau: "local myChar = workspace.Player\nlocal targetPart = workspace.Part\n",
      validateRbx: (c: string) => c.includes("firetouchinterest"),
      validateLuau: (c: string) => c.includes("firetouchinterest")
    },
    {
      id: 193,
      title: "Окружение: setfpscap",
      descRbx: "Снятие ограничения кадров (FPS) для более плавной игры.",
      descLuau: "setfpscap can increase your FPS beyond the standard 60 FPS limit.",
      task: "Установите лимит FPS в 144 через setfpscap(144).",
      initialCodeRbx: "// Лимит кадров\n",
      initialCodeLuau: "-- Лимит кадров\n",
      validateRbx: (c: string) => c.includes("setfpscap(144)"),
      validateLuau: (c: string) => c.includes("setfpscap(144)")
    },
    {
      id: 194,
      title: "Окружение: getnilinstances",
      descRbx: "Поиск объектов, у которых Parent установлен в nil (скрытые объекты).",
      descLuau: "getnilinstances finds objects that are not in the game hierarchy but still in memory.",
      task: "Вызовите getnilinstances() и сохраните в 'nilParts'.",
      initialCodeRbx: "// Скрытые объекты\n",
      initialCodeLuau: "-- Скрытые объекты\n",
      validateRbx: (c: string) => c.includes("getnilinstances()"),
      validateLuau: (c: string) => c.includes("getnilinstances()")
    },
    {
      id: 195,
      title: "Окружение: checkcaller()",
      descRbx: "Проверка: был ли вызван хук вашим скриптом или самой игрой.",
      descLuau: "checkcaller returns true if the current thread was started by the exploit.",
      task: "Если checkcaller(), напечатайте 'My call'.",
      initialCodeRbx: "// Кто вызвал?\n",
      initialCodeLuau: "-- Кто вызвал?\n",
      validateRbx: (c: string) => c.includes("checkcaller()"),
      validateLuau: (c: string) => c.includes("checkcaller()")
    },
    {
      id: 196,
      title: "Окружение: getupvalues",
      descRbx: "Инспекция 'внешних' переменных функции (Upvalues).",
      descLuau: "getupvalues returns all variables that a function captures from its outer scope.",
      task: "Вызовите getupvalues(targetFunc).",
      initialCodeRbx: "func targetFunc() {}\n",
      initialCodeLuau: "local function targetFunc() end\n",
      validateRbx: (c: string) => c.includes("getupvalues"),
      validateLuau: (c: string) => c.includes("getupvalues")
    },
    {
      id: 197,
      title: "Окружение: setstack",
      descRbx: "Прямая манипуляция стеком Lua (очень опасно!).",
      descLuau: "setstack allows you to modify the Lua stack directly for extreme exploitation.",
      task: "Создайте переменную 'isDangerous' = true.",
      initialCodeRbx: "// Опасные игры\n",
      initialCodeLuau: "-- Опасные игры\n",
      validateRbx: (c: string) => /var\s+isDangerous\s*=\s*true/.test(c),
      validateLuau: (c: string) => /local\s+isDangerous\s*=\s*true/.test(c)
    },
    {
      id: 198,
      title: "Окружение: isnetworkowner",
      descRbx: "Проверка, владеете ли вы физикой этого объекта в данный момент.",
      descLuau: "isnetworkowner returns true if the client is responsible for physics of the part.",
      task: "Если isnetworkowner(part), напечатайте 'I own it'.",
      initialCodeRbx: "var part = workspace.Part\n",
      initialCodeLuau: "local part = workspace.Part\n",
      validateRbx: (c: string) => c.includes("isnetworkowner"),
      validateLuau: (c: string) => c.includes("isnetworkowner")
    },
    {
      id: 199,
      title: "Окружение: rconsolename",
      descRbx: "Установка имени для внешнего окна консоли эксплойта.",
      descLuau: "rconsolename changes the title of the external exploit console window.",
      task: "Установите имя консоли в 'My Exploit' через rconsolename().",
      initialCodeRbx: "// Имя консоли\n",
      initialCodeLuau: "-- Имя консоли\n",
      validateRbx: (c: string) => c.includes("rconsolename"),
      validateLuau: (c: string) => c.includes("rconsolename")
    },
    {
      id: 200,
      title: "ULTIMATE BOSS: God Mode Multi-Script",
      descRbx: "Создайте финальный скрипт: проверка PlaceId, включение Fly, Speed и ESP одновременно.",
      descLuau: "Combine everything you've learned to create a professional multi-hack script.",
      task: "Используйте if для PlaceId, включите Fly (BodyVelocity) и установите WalkSpeed = 100.",
      initialCodeRbx: "var pid = game.PlaceId\nvar hum = workspace.Player.Humanoid\n",
      initialCodeLuau: "local pid = game.PlaceId\nlocal hum = workspace.Player.Humanoid\n",
      validateRbx: (c: string) => c.includes("PlaceId") && c.includes("BodyVelocity") && c.includes("WalkSpeed = 100"),
      validateLuau: (c: string) => c.includes("PlaceId") && c.includes("BodyVelocity") && c.includes("WalkSpeed = 100")
    }
    ];
;

  useEffect(() => {
    setCode(tutorialLang === 'RbxEasy' ? steps[step].initialCodeRbx : steps[step].initialCodeLuau);
    setFeedback(null);
  }, [step, tutorialLang]);

  const handleCheck = () => {
    const isValid = tutorialLang === 'RbxEasy' ? steps[step].validateRbx(code) : steps[step].validateLuau(code);
    if (isValid) {
      setFeedback({ type: 'success', msg: "Отлично! Задание выполнено. Прогресс сохранен!" });
      onComplete(steps[step].id, tutorialLang);
    } else {
      setFeedback({ type: 'error', msg: "Похоже, в коде ошибка или не выполнены условия задания. Проверьте синтаксис!" });
    }
  };

  const handleCompileTutorial = (val: string | undefined) => {
    if (val === undefined) return;
    setCode(val);
    if (tutorialLang === 'Luau') {
      setCompiled(val);
      return;
    }
    try {
      const tokens = new Lexer(val).tokenize();
      const ast = new Parser(tokens).parse();
      setCompiled(new Generator().generate(ast));
    } catch (e) {
      setCompiled("-- Ошибка компиляции...");
    }
  };

  const progressPercent = Math.round((completedIds.length / steps.length) * 100);

  const filteredSteps = useMemo(() => {
    return steps.map((s, idx) => ({ ...s, originalIdx: idx }))
                .filter(s => s.title.toLowerCase().includes(tutorialSearch.toLowerCase()));
  }, [steps, tutorialSearch]);

  return (
    <div className="tutorial-container">
      <div className="tutorial-sidebar">
        <div className="tutorial-fixed-header">
          <button className="vs-button secondary" onClick={onBack} style={{ marginBottom: '20px', width: '100%' }}>← В меню</button>
          
          <div className="tutorial-progress-header">
             <span>Прогресс ({tutorialLang}): {progressPercent}% ({completedIds.length}/{steps.length})</span>
             <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
             </div>
          </div>

          <div className="tutorial-lang-toggle" style={{ display: 'flex', gap: '5px', margin: '15px 0' }}>
            <button 
              className={`vs-button ${tutorialLang === 'RbxEasy' ? '' : 'secondary'}`} 
              style={{ flex: 1, fontSize: '11px' }}
              onClick={() => setTutorialLang('RbxEasy')}
            >RbxEasy</button>
            <button 
              className={`vs-button ${tutorialLang === 'Luau' ? '' : 'secondary'}`} 
              style={{ flex: 1, fontSize: '11px' }}
              onClick={() => setTutorialLang('Luau')}
            >Luau</button>
          </div>

          <div className="tutorial-search-container" style={{ marginBottom: '15px' }}>
            <input 
              type="text" 
              className="vs-input" 
              placeholder="Поиск уроков..." 
              value={tutorialSearch}
              onChange={(e) => setTutorialSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="tutorial-scrollable-list">
          <div className="tutorial-checklist">
            {filteredSteps.map((s) => (
              <div key={s.id} className={`checklist-item ${s.originalIdx === step ? 'current' : ''} ${completedIds.includes(s.id) ? 'done' : ''}`} onClick={() => setStep(s.originalIdx)}>
                {completedIds.includes(s.id) ? '✅' : '⚪'} {s.title} {completedIds.includes(s.id) && <span style={{ fontSize: '10px', marginLeft: '5px', opacity: 0.8 }}>(Завершено!)</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="tutorial-fixed-footer">
          <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '15px 0' }} />

          <div className="tutorial-title">{steps[step].title}</div>
          <p className="tutorial-desc">{tutorialLang === 'RbxEasy' ? steps[step].descRbx : steps[step].descLuau}</p>
          <div className="tutorial-task">
            <h4>ЗАДАНИЕ</h4>
            <p>{steps[step].task}</p>
            {steps[step].hint && (
              <div className="tutorial-hint" style={{ marginTop: '10px', padding: '10px', background: '#222', borderRadius: '5px' }}>
                <h4>ПОДСКАЗКА</h4>
                <pre>{steps[step].hint}</pre>
              </div>
            )}
          </div>
          
          {feedback && (
            <div className={`tutorial-feedback ${feedback.type}`}>
              {feedback.msg}
            </div>
          )}

          <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
            <button onClick={() => setShowCheatSheet(true)} className="vs-button secondary">Помощь (Cheat Sheet)</button>
          </div>

          {showCheatSheet && (
            <div className="modal" style={{ position: 'fixed', top: '20%', left: '20%', width: '60%', background: '#333', padding: '20px', zIndex: 1000 }}>
              <h3>Cheat Sheet: {steps[step].title}</h3>
              <pre>{steps[step].hint || 'Нет подсказки для этого задания'}</pre>
              <button onClick={() => setShowCheatSheet(false)} className="vs-button">Закрыть</button>
            </div>
          )}

            <button className="vs-button secondary" disabled={step === 0} onClick={() => setStep(s => s - 1)}>Назад</button>
          {completedIds.includes(steps[step].id) && step < steps.length - 1 ? (
             <button className="vs-button" onClick={() => setStep(s => s + 1)}>Далее →</button>
          ) : (
            <button className="vs-button check-code-btn" onClick={handleCheck} style={{ flexGrow: 1 }}>Проверить</button>
          )}
        </div>
      </div>
      <div className="tutorial-main" ref={containerRef}>

        <div style={{ flex: 1, borderBottom: '1px solid #333' }}>
           <Editor
             height="100%"
             theme={theme === 'custom' ? 'custom-theme' : (PRESET_THEMES[theme]?.monaco || 'vs-dark')}
             language={tutorialLang === 'RbxEasy' ? 'rbxeasy' : 'lua'}

            value={code}
            onChange={handleCompileTutorial}
            options={{ 
              minimap: { enabled: false }, 
              fontSize: fontSize, 
              fontWeight: '900',
              fontFamily: "'Consolas', 'Courier New', monospace",
              letterSpacing: 0,
              automaticLayout: true,
              mouseWheelZoom: false,
              tabCompletion: 'on'
              }}
          />
        </div>
        <div style={{ height: '30%', padding: '20px', background: '#111', overflow: 'auto' }}>
          <div style={{ color: '#858585', fontSize: '11px', marginBottom: '10px', fontWeight: 'bold' }}>РЕЗУЛЬТАТ (LUA)</div>
          <pre style={{ color: '#d4d4d4', fontSize: '13px' }}>{compiled}</pre>
        </div>
      </div>
    </div>
  );
}

const PRESET_THEMES: Record<string, any> = {
  'roblox-classic': {
    name: 'Roblox Classic',
    monaco: 'roblox-dark',
    vars: {
      '--vs-bg': '#1e1e1e',
      '--vs-sidebar-bg': '#252526',
      '--vs-activity-bg': '#333333',
      '--vs-accent': '#007acc',
      '--vs-border': '#3c3c3c',
      '--vs-text': '#cccccc',
      '--vs-tab-inactive': '#2d2d2d',
      '--vs-tab-active-bg': '#1e1e1e',
      '--vs-status-bg': '#005fb8',
      '--vs-status-text': 'rgba(255, 255, 255, 0.9)',
      '--vs-panel-bg': '#1e1e1e',
      '--vs-panel-header-bg': '#1e1e1e',
      '--vs-editor-bg': '#1e1e1e'
    }
  },
  'vs-dark': {
    name: 'VS Code Dark',
    monaco: 'vs-dark',
    vars: {
      '--vs-bg': '#1e1e1e',
      '--vs-sidebar-bg': '#252526',
      '--vs-activity-bg': '#333333',
      '--vs-accent': '#007acc',
      '--vs-border': '#3c3c3c',
      '--vs-text': '#cccccc',
      '--vs-tab-inactive': '#2d2d2d',
      '--vs-tab-active-bg': '#1e1e1e',
      '--vs-status-bg': '#007acc',
      '--vs-status-text': '#ffffff',
      '--vs-panel-bg': '#1e1e1e',
      '--vs-panel-header-bg': '#1e1e1e',
      '--vs-editor-bg': '#1e1e1e'
    }
  },
  'one-dark': {
    name: 'One Dark',
    monaco: 'one-dark',
    vars: {
      '--vs-bg': '#282c34',
      '--vs-sidebar-bg': '#21252b',
      '--vs-activity-bg': '#21252b',
      '--vs-accent': '#61afef',
      '--vs-border': '#181a1f',
      '--vs-text': '#abb2bf',
      '--vs-tab-inactive': '#21252b',
      '--vs-tab-active-bg': '#282c34',
      '--vs-status-bg': '#21252b',
      '--vs-status-text': '#abb2bf',
      '--vs-panel-bg': '#282c34',
      '--vs-panel-header-bg': '#21252b',
      '--vs-editor-bg': '#282c34'
    }
  },
  'dracula': {
    name: 'Dracula',
    monaco: 'dracula',
    vars: {
      '--vs-bg': '#282a36',
      '--vs-sidebar-bg': '#21222c',
      '--vs-activity-bg': '#191a21',
      '--vs-accent': '#bd93f9',
      '--vs-border': '#44475a',
      '--vs-text': '#f8f8f2',
      '--vs-tab-inactive': '#21222c',
      '--vs-tab-active-bg': '#282a36',
      '--vs-status-bg': '#bd93f9',
      '--vs-status-text': '#282a36',
      '--vs-panel-bg': '#282a36',
      '--vs-panel-header-bg': '#21222c',
      '--vs-editor-bg': '#282a36'
    }
  },
  'github-dark': {
    name: 'GitHub Dark',
    monaco: 'github-dark',
    vars: {
      '--vs-bg': '#0d1117',
      '--vs-sidebar-bg': '#010409',
      '--vs-activity-bg': '#0d1117',
      '--vs-accent': '#58a6ff',
      '--vs-border': '#30363d',
      '--vs-text': '#c9d1d9',
      '--vs-tab-inactive': '#010409',
      '--vs-tab-active-bg': '#0d1117',
      '--vs-status-bg': '#010409',
      '--vs-status-text': '#c9d1d9',
      '--vs-panel-bg': '#0d1117',
      '--vs-panel-header-bg': '#010409',
      '--vs-editor-bg': '#0d1117'
    }
  },
  'monokai': {
    name: 'Monokai',
    monaco: 'monokai',
    vars: {
      '--vs-bg': '#272822',
      '--vs-sidebar-bg': '#1e1f1c',
      '--vs-activity-bg': '#272822',
      '--vs-accent': '#a6e22e',
      '--vs-border': '#3e3d32',
      '--vs-text': '#f8f8f2',
      '--vs-tab-inactive': '#1e1f1c',
      '--vs-tab-active-bg': '#272822',
      '--vs-status-bg': '#414339',
      '--vs-status-text': '#f8f8f2',
      '--vs-panel-bg': '#272822',
      '--vs-panel-header-bg': '#1e1f1c',
      '--vs-editor-bg': '#272822'
    }
  },
  'solarized-dark': {
    name: 'Solarized Dark',
    monaco: 'solarized-dark',
    vars: {
      '--vs-bg': '#002b36',
      '--vs-sidebar-bg': '#073642',
      '--vs-activity-bg': '#002b36',
      '--vs-accent': '#268bd2',
      '--vs-border': '#073642',
      '--vs-text': '#839496',
      '--vs-tab-inactive': '#073642',
      '--vs-tab-active-bg': '#002b36',
      '--vs-status-bg': '#073642',
      '--vs-status-text': '#93a1a1',
      '--vs-panel-bg': '#002b36',
      '--vs-panel-header-bg': '#073642',
      '--vs-editor-bg': '#002b36'
    }
  },
  'cyberpunk': {
    name: 'Cyberpunk',
    monaco: 'cyberpunk',
    vars: {
      '--vs-bg': '#000b1e',
      '--vs-sidebar-bg': '#00162d',
      '--vs-activity-bg': '#000b1e',
      '--vs-accent': '#ff0055',
      '--vs-border': '#00ffff',
      '--vs-text': '#00ffff',
      '--vs-tab-inactive': '#00162d',
      '--vs-tab-active-bg': '#000b1e',
      '--vs-status-bg': '#ff0055',
      '--vs-status-text': '#ffffff',
      '--vs-panel-bg': '#000b1e',
      '--vs-panel-header-bg': '#00162d',
      '--vs-editor-bg': '#000b1e'
    }
  },
  'nord': {
    name: 'Nord',
    monaco: 'nord',
    vars: {
      '--vs-bg': '#2e3440',
      '--vs-sidebar-bg': '#242933',
      '--vs-activity-bg': '#2e3440',
      '--vs-accent': '#88c0d0',
      '--vs-border': '#3b4252',
      '--vs-text': '#d8dee9',
      '--vs-tab-inactive': '#2e3440',
      '--vs-tab-active-bg': '#3b4252',
      '--vs-status-bg': '#4c566a',
      '--vs-status-text': '#d8dee9',
      '--vs-panel-bg': '#2e3440',
      '--vs-panel-header-bg': '#2e3440',
      '--vs-editor-bg': '#2e3440'
    }
  },
  'night-owl': {
    name: 'Night Owl',
    monaco: 'night-owl',
    vars: {
      '--vs-bg': '#011627',
      '--vs-sidebar-bg': '#01111d',
      '--vs-activity-bg': '#011627',
      '--vs-accent': '#7fdbca',
      '--vs-border': '#1d3b53',
      '--vs-text': '#d6deeb',
      '--vs-tab-inactive': '#01111d',
      '--vs-tab-active-bg': '#0b2942',
      '--vs-status-bg': '#011627',
      '--vs-status-text': '#d6deeb',
      '--vs-panel-bg': '#011627',
      '--vs-panel-header-bg': '#01111d',
      '--vs-editor-bg': '#011627'
    }
  },
  'material-palenight': {
    name: 'Material Palenight',
    monaco: 'material-palenight',
    vars: {
      '--vs-bg': '#292d3e',
      '--vs-sidebar-bg': '#1b1e2b',
      '--vs-activity-bg': '#292d3e',
      '--vs-accent': '#c792ea',
      '--vs-border': '#1b1e2b',
      '--vs-text': '#a6accd',
      '--vs-tab-inactive': '#1b1e2b',
      '--vs-tab-active-bg': '#292d3e',
      '--vs-status-bg': '#292d3e',
      '--vs-status-text': '#a6accd',
      '--vs-panel-bg': '#292d3e',
      '--vs-panel-header-bg': '#1b1e2b',
      '--vs-editor-bg': '#292d3e'
    }
  },
  'rose-pine': {
    name: 'Rose Pine',
    monaco: 'rose-pine',
    vars: {
      '--vs-bg': '#191724',
      '--vs-sidebar-bg': '#1f1d2e',
      '--vs-activity-bg': '#191724',
      '--vs-accent': '#ebbcba',
      '--vs-border': '#1f1d2e',
      '--vs-text': '#e0def4',
      '--vs-tab-inactive': '#1f1d2e',
      '--vs-tab-active-bg': '#191724',
      '--vs-status-bg': '#191724',
      '--vs-status-text': '#e0def4',
      '--vs-panel-bg': '#191724',
      '--vs-panel-header-bg': '#1f1d2e',
      '--vs-editor-bg': '#191724'
    }
  },
  'tokyo-night': {
    name: 'Tokyo Night',
    monaco: 'tokyo-night',
    vars: {
      '--vs-bg': '#1a1b26',
      '--vs-sidebar-bg': '#16161e',
      '--vs-activity-bg': '#1a1b26',
      '--vs-accent': '#7aa2f7',
      '--vs-border': '#16161e',
      '--vs-text': '#a9b1d6',
      '--vs-tab-inactive': '#16161e',
      '--vs-tab-active-bg': '#1a1b26',
      '--vs-status-bg': '#1a1b26',
      '--vs-status-text': '#a9b1d6',
      '--vs-panel-bg': '#1a1b26',
      '--vs-panel-header-bg': '#16161e',
      '--vs-editor-bg': '#1a1b26'
    }
  },
  'synthwave84': {
    name: "SynthWave '84",
    monaco: 'synthwave84',
    vars: {
      '--vs-bg': '#262335',
      '--vs-sidebar-bg': '#241b2f',
      '--vs-activity-bg': '#262335',
      '--vs-accent': '#ff7edb',
      '--vs-border': '#241b2f',
      '--vs-text': '#ffffff',
      '--vs-tab-inactive': '#241b2f',
      '--vs-tab-active-bg': '#262335',
      '--vs-status-bg': '#262335',
      '--vs-status-text': '#ffffff',
      '--vs-panel-bg': '#262335',
      '--vs-panel-header-bg': '#241b2f',
      '--vs-editor-bg': '#262335'
    }
  },
  'gruvbox-dark': {
    name: 'Gruvbox Dark',
    monaco: 'gruvbox-dark',
    vars: {
      '--vs-bg': '#282828',
      '--vs-sidebar-bg': '#1d2021',
      '--vs-activity-bg': '#282828',
      '--vs-accent': '#fabd2f',
      '--vs-border': '#3c3836',
      '--vs-text': '#ebdbb2',
      '--vs-tab-inactive': '#1d2021',
      '--vs-tab-active-bg': '#282828',
      '--vs-status-bg': '#282828',
      '--vs-status-text': '#ebdbb2',
      '--vs-panel-bg': '#282828',
      '--vs-panel-header-bg': '#1d2021',
      '--vs-editor-bg': '#282828'
    }
  },
  'cobalt2': {
    name: 'Cobalt2',
    monaco: 'cobalt2',
    vars: {
      '--vs-bg': '#193549',
      '--vs-sidebar-bg': '#152c3e',
      '--vs-activity-bg': '#193549',
      '--vs-accent': '#ffc600',
      '--vs-border': '#152c3e',
      '--vs-text': '#ffffff',
      '--vs-tab-inactive': '#152c3e',
      '--vs-tab-active-bg': '#193549',
      '--vs-status-bg': '#193549',
      '--vs-status-text': '#ffffff',
      '--vs-panel-bg': '#193549',
      '--vs-panel-header-bg': '#152c3e',
      '--vs-editor-bg': '#193549'
    }
  },
  'ayu-mirage': {
    name: 'Ayu Mirage',
    monaco: 'ayu-mirage',
    vars: {
      '--vs-bg': '#212733',
      '--vs-sidebar-bg': '#191e2a',
      '--vs-activity-bg': '#212733',
      '--vs-accent': '#ffcc66',
      '--vs-border': '#191e2a',
      '--vs-text': '#cccac2',
      '--vs-tab-inactive': '#191e2a',
      '--vs-tab-active-bg': '#212733',
      '--vs-status-bg': '#212733',
      '--vs-status-text': '#cccac2',
      '--vs-panel-bg': '#212733',
      '--vs-panel-header-bg': '#191e2a',
      '--vs-editor-bg': '#212733'
    }
  },
  'oceanic-next': {
    name: 'Oceanic Next',
    monaco: 'oceanic-next',
    vars: {
      '--vs-bg': '#1b2b34',
      '--vs-sidebar-bg': '#16242c',
      '--vs-activity-bg': '#1b2b34',
      '--vs-accent': '#6699cc',
      '--vs-border': '#16242c',
      '--vs-text': '#d8dee9',
      '--vs-tab-inactive': '#16242c',
      '--vs-tab-active-bg': '#1b2b34',
      '--vs-status-bg': '#1b2b34',
      '--vs-status-text': '#d8dee9',
      '--vs-panel-bg': '#1b2b34',
      '--vs-panel-header-bg': '#16242c',
      '--vs-editor-bg': '#1b2b34'
    }
  },
  'shades-of-purple': {
    name: 'Shades of Purple',
    monaco: 'shades-of-purple',
    vars: {
      '--vs-bg': '#2d2b55',
      '--vs-sidebar-bg': '#1e1e3f',
      '--vs-activity-bg': '#2d2b55',
      '--vs-accent': '#fad000',
      '--vs-border': '#1e1e3f',
      '--vs-text': '#ffffff',
      '--vs-tab-inactive': '#1e1e3f',
      '--vs-tab-active-bg': '#2d2b55',
      '--vs-status-bg': '#2d2b55',
      '--vs-status-text': '#ffffff',
      '--vs-panel-bg': '#2d2b55',
      '--vs-panel-header-bg': '#1e1e3f',
      '--vs-editor-bg': '#2d2b55'
    }
  },
  'winter-is-coming': {
    name: 'Winter is Coming',
    monaco: 'winter-is-coming',
    vars: {
      '--vs-bg': '#011627',
      '--vs-sidebar-bg': '#01111d',
      '--vs-activity-bg': '#011627',
      '--vs-accent': '#82aaff',
      '--vs-border': '#01111d',
      '--vs-text': '#d6deeb',
      '--vs-tab-inactive': '#01111d',
      '--vs-tab-active-bg': '#011627',
      '--vs-status-bg': '#011627',
      '--vs-status-text': '#d6deeb',
      '--vs-panel-bg': '#011627',
      '--vs-panel-header-bg': '#01111d',
      '--vs-editor-bg': '#011627'
    }
  }
}

interface CustomTheme {
  bgImage: string;
  bgOpacity: number;
  bgTint: string;
  accentColor: string;
  sidebarColor: string;
  activityBarColor: string;
  blur: number;
}

function App(): React.JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [activeFileName, setActiveFileName] = useState('')
  const [errors, setErrors] = useState<LinterError[]>([])
  const [compiledCode, setCompiledCode] = useState<string>('')
  const [activePanel, setActivePanel] = useState<'problems' | 'output' | 'project-check'>('problems')
  const [projectErrors, setProjectErrors] = useState<{ fileName: string, errors: LinterError[] }[]>([])
  const [isCheckingProject, setIsCheckingProject] = useState(false)
  const [isEditorLoading, setIsEditorLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('welcome')
  const [languageMode, setLanguageMode] = useState<LanguageMode>('RbxEasy')
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<string[]>([])
  const [isReady, setIsReady] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  
  // Progress State
  const [userProgress, setUserProgress] = useState<UserProgress>({ completed: { RbxEasy: [], Luau: [] }, lastProject: null })

  const saveProjectConfig = async (currentFiles: FileEntry[], currentPath: string | null) => {
    if (!currentPath) return;
    const config: Record<string, any> = {};
    currentFiles.forEach(f => {
      config[f.name] = {
        isLinked: f.isLinked,
        isLibrary: f.isLibrary,
        bundleOrder: f.bundleOrder
      }
    });
    if (window.api.saveProjectConfig) {
      await window.api.saveProjectConfig(currentPath, config);
    }
  }

  // New Settings State
  const [autoSave, setAutoSave] = useState(true)
  const [showMinimap, setShowMinimap] = useState(true)
  const [theme, setTheme] = useState<string>('roblox-classic')
  const [customTheme, setCustomTheme] = useState<CustomTheme>({
    bgImage: '',
    bgOpacity: 0.5,
    bgTint: 'rgba(0,0,0,0.5)',
    accentColor: '#007acc',
    sidebarColor: '#252526',
    activityBarColor: '#333333',
    blur: 10
  })
  const [fontSize, setFontSize] = useState(14)
  const [zoomVisible, setZoomVisible] = useState(false)
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [compilationStatus, setCompilationStatus] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isCreatingFile, setIsCreatingFile] = useState(false)
  const [newFileName, setNewFileName] = useState('NewFile.rbxe')

  // Search State

  const [searchQuery, setSearchQuery] = useState('')
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDownloadThemeImage = async () => {
    if (!customTheme.bgImage || customTheme.bgImage.startsWith('file://')) return
    
    setIsDownloading(true)
    try {
      const localPath = await window.api.downloadThemeImage(customTheme.bgImage)
      setCustomTheme({ ...customTheme, bgImage: localPath })
    } catch (e) {
      console.error(e)
      alert('Ошибка при сохранении изображения локально. Убедитесь, что ссылка верна.')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleResetThemeImage = async () => {
    await window.api.clearThemeAssets()
    setCustomTheme({ ...customTheme, bgImage: '' })
  }

  // Zoom Handler (Global Capture Level)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        // Check if the event happened over an editor-related element
        const path = e.composedPath();
        const isOverEditor = path.some((el: any) => 
          el.classList && (el.classList.contains('editor-wrapper') || el.classList.contains('tutorial-main'))
        );

        if (isOverEditor) {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY > 0 ? -1 : 1;
          setFontSize(prev => {
            const next = Math.min(Math.max(prev + delta, 8), 100);
            if (next !== prev) {
              setZoomVisible(true);
              if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
              zoomTimeoutRef.current = setTimeout(() => setZoomVisible(false), 1500);
            }
            return next;
          });
        }
      }
    };
    
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true } as any);
  }, []);

  const activeFile = useMemo(() => files.find(f => f.name === activeFileName) || files[0] || null, [files, activeFileName])
  const linter = useMemo(() => new Linter(), [])

  // Sync Monaco Markers
  useEffect(() => {
    if (!activeFile || !monacoRef.current || !editorRef.current) return;

    setIsThinking(true);
    const timer = setTimeout(() => {
      try {
        const isMain = activeFile.name === 'Main.rbxe' || activeFile.name === 'Main.lua' || (!activeFile.isLibrary && activeFile.bundleOrder === 0);
        const compilerFiles = files.map(f => ({ ...f, path: f.path || '' }));
        const lintErrors = linter.lint(activeFile.content, languageMode, compilerFiles, isMain)
        setErrors(lintErrors)

        const model = editorRef.current.getModel();
        if (model) {
          const markers = lintErrors.map(err => ({
            startLineNumber: err.line,
            startColumn: err.col || 1,
            endLineNumber: err.line,
            endColumn: err.col ? err.col + 20 : 100,
            message: err.message,
            severity: err.severity === 'error' ? monacoRef.current.MarkerSeverity.Error : 
                      err.severity === 'warning' ? monacoRef.current.MarkerSeverity.Warning : 
                      monacoRef.current.MarkerSeverity.Info
          }));
          monacoRef.current.editor.setModelMarkers(model, 'rbxeasy', markers);
        }
      } catch (e) {
        console.error("Linter Error:", e)
      } finally {
        setIsThinking(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [activeFile?.content, activeFileName, linter, languageMode, files])

  // Search Results
  const searchResults = useMemo(() => {
    if (!searchQuery) return []
    const results: { fileName: string; line: number; text: string }[] = []
    files.forEach(file => {
      const lines = file.content.split('\n')
      lines.forEach((text, index) => {
        if (text.toLowerCase().includes(searchQuery.toLowerCase())) {
          results.push({
            fileName: file.name,
            line: index + 1,
            text: text.trim()
          })
        }
      })
    })
    return results
  }, [files, searchQuery])

  // Initial Load
  useEffect(() => {
    const init = async () => {
      const recent = await window.api.getRecentProjects()
      setRecentProjects(recent)

      const savedSettings = await window.api.getSettings()
      if (savedSettings) {
        setAutoSave(savedSettings.autoSave ?? true)
        setShowMinimap(savedSettings.showMinimap ?? true)
        setLanguageMode(savedSettings.languageMode ?? 'RbxEasy')
        setTheme(savedSettings.theme ?? 'roblox-classic')
        if (savedSettings.customTheme) {
          setCustomTheme(savedSettings.customTheme)
        }
      }

      const progress = await window.api.getUserProgress()
      if (progress) {
          setUserProgress(progress)
      }

      const lastState = await window.api.getWorkspaceState()
      const effectiveProjectPath = lastState?.projectPath || progress?.lastProject;

      if (effectiveProjectPath) {
        const project = await window.api.openProjectDir(effectiveProjectPath)
        if (project && project.files && project.files.length > 0) {
          setFiles(project.files)
          setProjectPath(project.path)
          setActiveFileName(lastState?.activeFileName || project.files[0]?.name || '')
          setViewMode('explorer')
        } else {
          setViewMode('welcome')
        }
      } else {
        setViewMode('welcome')
      }
      setIsReady(true)
    }
    init()
  }, [])

  // Theme Injection
  useEffect(() => {
    const root = document.documentElement;
    let currentVars = {};

    if (theme === 'custom') {
      currentVars = {
        '--vs-bg': 'transparent',
        '--vs-sidebar-bg': customTheme.sidebarColor,
        '--vs-activity-bg': customTheme.activityBarColor,
        '--vs-accent': customTheme.accentColor,
        '--vs-border': 'rgba(255, 255, 255, 0.1)',
        '--vs-text': '#ffffff',
        '--vs-tab-inactive': 'rgba(0, 0, 0, 0.2)',
        '--vs-tab-active-bg': 'rgba(255, 255, 255, 0.1)',
        '--vs-status-bg': customTheme.accentColor,
        '--vs-status-text': '#ffffff',
        '--vs-panel-bg': 'rgba(0, 0, 0, 0.3)',
        '--vs-panel-header-bg': 'rgba(0, 0, 0, 0.2)',
        '--vs-editor-bg': 'transparent',
        '--vs-bg-image': customTheme.bgImage ? `url(${customTheme.bgImage})` : 'none',
        '--vs-bg-opacity': customTheme.bgOpacity.toString(),
        '--vs-bg-tint': customTheme.bgTint,
        '--vs-blur': `${customTheme.blur}px`
      };
    } else {
      const preset = PRESET_THEMES[theme] || PRESET_THEMES['roblox-classic'];
      currentVars = {
        ...preset.vars,
        '--vs-bg-image': 'none',
        '--vs-bg-opacity': '1',
        '--vs-bg-tint': 'transparent',
        '--vs-blur': '0px'
      };
    }

    Object.entries(currentVars).forEach(([key, value]) => {
      root.style.setProperty(key, value as string);
    });
  }, [theme, customTheme]);

  // Persist settings
  useEffect(() => {
    if (!isReady) return
    window.api.saveSettings({
      autoSave,
      showMinimap,
      languageMode,
      theme,
      customTheme
    })
  }, [autoSave, showMinimap, languageMode, theme, customTheme, isReady])

  // Auto-save logic
  useEffect(() => {
    if (!autoSave || !isReady) return
    const timer = setTimeout(() => {
      handleSaveAll()
    }, 1000)
    return () => clearTimeout(timer)
  }, [files, autoSave, isReady])

  // Auto-save workspace state & progress
  useEffect(() => {
    if (!isReady) return
    window.api.saveWorkspaceState({
      projectPath,
      activeFileName
    })
    window.api.saveUserProgress({
        ...userProgress,
        lastProject: projectPath
    })
  }, [projectPath, activeFileName, userProgress, isReady])

  const handleTutorialComplete = (id: number, lang: LanguageMode) => {
      if (!userProgress.completed[lang].includes(id)) {
          setUserProgress(prev => ({
              ...prev,
              completed: {
                  ...prev.completed,
                  [lang]: [...prev.completed[lang], id]
              }
          }))
      }
  }

  const handleEditorChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setFiles(prev => prev.map(f => f.name === activeFileName ? { ...f, content: value } : f))
    }
  }

  const handleCompile = () => {
    try {
      const included = new Set<string>();
      const bundleParts: string[] = [];
      const gen = new Generator();

      const compileFile = (file: FileEntry) => {
        if (included.has(file.name)) return;
        included.add(file.name);

        if (languageMode === 'Luau') {
            bundleParts.push(`-- Файл: ${file.name}`);
            bundleParts.push(file.content);
            bundleParts.push("");
        } else {
            const tokens = new Lexer(file.content).tokenize();
            const ast = new Parser(tokens).parse();

            // Support nested includes even in manual mode
            const currentIncludes: string[] = [];
            ast.body.forEach((node: any) => {
                if (node.type === 'IncludeStatement') {
                    currentIncludes.push(node.path);
                }
            });

            currentIncludes.forEach(name => {
                const fileName = name.endsWith('.rbxe') ? name : name + '.rbxe';
                const depFile = files.find(f => f.name === fileName);
                if (depFile) {
                    compileFile(depFile);
                } else {
                    bundleParts.push(`-- [!] ОШИБКА: Библиотека '${name}' не найдена в проекте.`);
                }
            });

            bundleParts.push(`-- Файл: ${file.name}${file.isLibrary ? ' [LIBRARY]' : ''}`);
            bundleParts.push(gen.generate(ast));
            bundleParts.push("");
        }
      };

      // 1. Filter only linked files
      // 2. Sort: Libraries FIRST, then Normal. Within groups, by bundleOrder.
      const sortedLinkedFiles = [...files]
        .filter(f => f.isLinked)
        .sort((a, b) => {
          if (a.isLibrary !== b.isLibrary) return a.isLibrary ? -1 : 1;
          return (a.bundleOrder || 0) - (b.bundleOrder || 0);
        });

      if (sortedLinkedFiles.length === 0) {
        throw new Error("Нет связанных файлов для сборки! Отметьте файлы иконкой 🔗");
      }

      sortedLinkedFiles.forEach(file => {
          compileFile(file);
      });

      let res = `-- [[ Собрано в RbxEasy IDE${languageMode === 'Luau' ? ' (Luau Mode)' : ''} ]]\n`;
      res += `-- Дата сборки: ${new Date().toLocaleString()}\n\n`;
      res += bundleParts.join('\n');
      
      setCompiledCode(res);
      setActivePanel('output');
      setCompilationStatus("Сборка успешно завершена! Бандл готов.");
      setTimeout(() => setCompilationStatus(null), 3000)
    } catch (e: any) {
      console.error(e);
      setCompilationStatus(`Ошибка сборки: ${e.message}`);
      setTimeout(() => setCompilationStatus(null), 5000)
    }
  }

  const handleOpenProject = async (path?: string) => {
    const project = await window.api.openProjectDir(path)
    if (project) {
      setFiles(project.files)
      setProjectPath(project.path)
      setActiveFileName(project.files[0]?.name || '')
      setViewMode('explorer')
      const updatedRecent = await window.api.addRecentProject(project.path)
      setRecentProjects(updatedRecent)
    }
  }

  const handleCreateProject = async (templateName: string = 'Empty') => {
    const project = await window.api.createProject(templateName)
    if (project) {
      setFiles(project.files)
      setProjectPath(project.path)
      setActiveFileName(project.files[0]?.name || '')
      setViewMode('explorer')
      const updatedRecent = await window.api.addRecentProject(project.path)
      setRecentProjects(updatedRecent)
    }
  }

  const handleSaveAll = async () => {
    for (const file of files) {
      if (file.path) {
        await window.api.saveProjectFile(file.path, file.content)
      }
    }
  }

  const handleCopyCode = () => {
    if (!compiledCode) return;
    navigator.clipboard.writeText(compiledCode);
    setCopyStatus("Скопировано!");
    setTimeout(() => setCopyStatus(null), 2000);
  }

  const handleCreateFile = () => {
    if (!projectPath) {
      alert("Сначала откройте папку проекта, чтобы создавать в ней файлы!");
      return;
    }
    setIsCreatingFile(true);
    setNewFileName('NewFile.rbxe');
  }

  const confirmCreateFile = async () => {
    const name = newFileName.trim();
    if (!name) {
      setIsCreatingFile(false);
      return;
    }

    if (!name.endsWith('.rbxe') && !name.endsWith('.lua')) {
      alert("Файл должен иметь расширение .rbxe или .lua");
      return;
    }

    if (!projectPath) {
      alert("Сначала откройте папку проекта, чтобы создавать в ней файлы!");
      setIsCreatingFile(false);
      return;
    }

    try {
      const res = await window.api.createFile(projectPath, name);
      if (res && res.error) {
        alert("Ошибка при создании: " + res.error);
      } else if (res && res.name) {
        setFiles(prev => {
          const newFiles = [...prev, res];
          saveProjectConfig(newFiles, projectPath);
          return newFiles;
        });
        setActiveFileName(res.name);
        setViewMode('explorer');
        setIsCreatingFile(false);
      }
    } catch (e: any) {
      alert("Критическая ошибка: " + e.message);
      setIsCreatingFile(false);
    }
  }
  const handleDeleteFile = async (e: React.MouseEvent, file: FileEntry) => {
    e.stopPropagation()
    if (!confirm(`Вы уверены, что хотите удалить ${file.name}?`)) return
    if (file.path) {
      const ok = await window.api.deleteFile(file.path)
      if (ok) {
        setFiles(prev => {
          const newFiles = prev.filter(f => f.path !== file.path);
          saveProjectConfig(newFiles, projectPath);
          return newFiles;
        });
        if (activeFileName === file.name) {
          const remainingFiles = files.filter(f => f.path !== file.path)
          setActiveFileName(remainingFiles[0]?.name || '')
        }
      }
    }
  }

  const applyFix = (error: LinterError) => {
    if (!error.fix) return;
    
    if (error.fix.type === 'REPLACE_TEXT' && error.fix.old) {
      const lines = activeFile.content.split('\n');
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        lines[lineIndex] = lines[lineIndex].replace(error.fix.old, error.fix.new);
        handleEditorChange(lines.join('\n'));
      }
    } else if (error.fix.type === 'ADD_TEXT') {
      if (error.fix.line === -1) {
        // Append to the absolute end of the file
        handleEditorChange(activeFile.content.trimEnd() + error.fix.new);
      } else {
        const lines = activeFile.content.split('\n');
        const lineIndex = (error.fix.line || error.line) - 1;
        if (lines[lineIndex] !== undefined) {
          lines[lineIndex] += error.fix.new;
          handleEditorChange(lines.join('\n'));
        }
      }
    }
  }

  const handleRunProjectCheck = () => {
    setIsCheckingProject(true);
    setTimeout(() => {
      try {
        const sortedLinkedFiles = [...files]
          .filter(f => f.isLinked)
          .sort((a, b) => {
            if (a.isLibrary !== b.isLibrary) return a.isLibrary ? -1 : 1;
            return (a.bundleOrder || 0) - (b.bundleOrder || 0);
          });

        if (sortedLinkedFiles.length === 0) {
          setProjectErrors([{ fileName: "Система", errors: [{ line: 1, col: 1, message: "Нет связанных файлов для проверки.", severity: 'warning' }] }]);
          setIsCheckingProject(false);
          return;
        }

        // Concatenate all source files to check global state and duplicates
        let fullSource = "";
        const fileLineMaps: { fileName: string, startLine: number, endLine: number }[] = [];
        let currentLine = 1;

        sortedLinkedFiles.forEach(file => {
          const content = file.content;
          const lineCount = content.split('\n').length;
          fileLineMaps.push({
            fileName: file.name,
            startLine: currentLine,
            endLine: currentLine + lineCount - 1
          });
          fullSource += content + "\n";
          currentLine += lineCount;
        });

        const allErrors = linter.lint(fullSource, languageMode, [], true);
        
        // Map global errors back to files
        const mappedResults: Record<string, LinterError[]> = {};
        allErrors.forEach(err => {
          const map = fileLineMaps.find(m => err.line >= m.startLine && err.line <= m.endLine);
          const fileName = map ? map.fileName : "Общее";
          const localLine = map ? err.line - map.startLine + 1 : err.line;
          
          if (!mappedResults[fileName]) mappedResults[fileName] = [];
          mappedResults[fileName].push({ ...err, line: localLine });
        });

        setProjectErrors(Object.entries(mappedResults).map(([fileName, errors]) => ({ fileName, errors })));
      } catch (e: any) {
        setProjectErrors([{ fileName: "Ошибка", errors: [{ line: 1, col: 1, message: e.message, severity: 'error' }] }]);
      } finally {
        setIsCheckingProject(false);
      }
    }, 100);
  };

  const handleQuickFixAll = () => {
    let content = activeFile.content;
    let lines = content.split('\n');
    const fixableErrors = errors.filter(e => !!e.fix).sort((a, b) => b.line - a.line);
    
    let endAppends = "";

    fixableErrors.forEach(err => {
      const fix = err.fix!;
      const lineIndex = err.line - 1;

      if (fix.type === 'REPLACE_TEXT' && fix.old) {
        if (lines[lineIndex]) {
          lines[lineIndex] = lines[lineIndex].replace(fix.old, fix.new);
        }
      } else if (fix.type === 'ADD_TEXT') {
        if (fix.line === -1) {
          endAppends = fix.new + endAppends;
        } else {
          const targetLine = (fix.line || err.line) - 1;
          if (lines[targetLine] !== undefined) {
            lines[targetLine] += fix.new;
          }
        }
      }
    });
    
    let newContent = lines.join('\n');
    if (endAppends) {
      newContent = newContent.trimEnd() + endAppends;
    }
    handleEditorChange(newContent);
  }

  const handleEditorWillMount = (monaco: any) => {
    monaco.languages.register({ id: 'rbxeasy' });

    // Roblox Studio Dark Theme Definition
    monaco.editor.defineTheme('roblox-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'FF0000', fontStyle: 'bold' },                 // Bright Red
        { token: 'type.identifier', foreground: '84D6F7', fontStyle: 'bold' },           // Light Blue (Globals)
        { token: 'string', foreground: 'E67E22' },                    // Orange
        { token: 'comment', foreground: '57A64A' },                   // Classic Dark Green
        { token: 'number', foreground: 'FFD700' },                    // Yellow/Gold
        { token: 'function.name', foreground: 'FFFF00' },             // Yellow
        { token: 'operator', foreground: 'CCCCCC' },
        { token: 'identifier', foreground: 'FFFFFF' },
      ],
      colors: {
        'editor.background': '#1E1E1E',
        'editor.foreground': '#FFFFFF',
        'editorLineNumber.foreground': '#858585',
        'editorCursor.foreground': '#FFFFFF',
        'editor.selectionBackground': '#264F78',
        'editor.inactiveSelectionBackground': '#3A3D41',
        'editorIndentGuide.background': '#404040',
        'editorIndentGuide.activeBackground': '#707070',
      }
    });

    monaco.editor.defineTheme('one-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'C678DD', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'E5C07B', fontStyle: 'bold' },
        { token: 'string', foreground: '98C379' },
        { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },
        { token: 'number', foreground: 'D19A66' },
        { token: 'function.name', foreground: '61AFEF' },
      ],
      colors: {
        'editor.background': '#282C34',
        'editor.foreground': '#ABB2BF',
      }
    });

    monaco.editor.defineTheme('dracula', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'FF79C6', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '8BE9FD', fontStyle: 'bold' },
        { token: 'string', foreground: 'F1FA8C' },
        { token: 'comment', foreground: '6272A4' },
        { token: 'number', foreground: 'BD93F9' },
        { token: 'function.name', foreground: '50FA7B' },
      ],
      colors: {
        'editor.background': '#282A36',
        'editor.foreground': '#F8F8F2',
      }
    });

    monaco.editor.defineTheme('github-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'FF7B72', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '79C0FF', fontStyle: 'bold' },
        { token: 'string', foreground: 'A5D6FF' },
        { token: 'comment', foreground: '8B949E' },
        { token: 'number', foreground: 'D2A8FF' },
        { token: 'function.name', foreground: 'D2A8FF' },
      ],
      colors: {
        'editor.background': '#0D1117',
        'editor.foreground': '#C9D1D9',
      }
    });

    monaco.editor.defineTheme('monokai', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'F92672', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '66D9EF', fontStyle: 'bold' },
        { token: 'string', foreground: 'E6DB74' },
        { token: 'comment', foreground: '75715E' },
        { token: 'number', foreground: 'AE81FF' },
        { token: 'function.name', foreground: 'A6E22E' },
      ],
      colors: {
        'editor.background': '#272822',
        'editor.foreground': '#F8F8F2',
      }
    });

    monaco.editor.defineTheme('solarized-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '859900', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '268BD2', fontStyle: 'bold' },
        { token: 'string', foreground: '2AA198' },
        { token: 'comment', foreground: '586E75' },
        { token: 'number', foreground: 'D33682' },
        { token: 'function.name', foreground: '268BD2' },
      ],
      colors: {
        'editor.background': '#002B36',
        'editor.foreground': '#839496',
      }
    });

    monaco.editor.defineTheme('cyberpunk', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'FF0055', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '00FFFF' },
        { token: 'string', foreground: 'FFF000' },
        { token: 'comment', foreground: '4E00FF' },
        { token: 'number', foreground: '00FF00' },
        { token: 'function.name', foreground: 'FF0055' },
      ],
      colors: {
        'editor.background': '#000B1E',
        'editor.foreground': '#00FFFF',
      }
    });

    monaco.editor.defineTheme('nord', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '81A1C1', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '88C0D0', fontStyle: 'bold' },
        { token: 'string', foreground: 'A3BE8C' },
        { token: 'comment', foreground: '616E88' },
        { token: 'number', foreground: 'B48EAD' },
        { token: 'function.name', foreground: '88C0D0' },
      ],
      colors: {
        'editor.background': '#2E3440',
        'editor.foreground': '#D8DEE9',
      }
    });

    monaco.editor.defineTheme('night-owl', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c792ea', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'addb67', fontStyle: 'bold' },
        { token: 'string', foreground: 'ecc48d' },
        { token: 'comment', foreground: '637777', fontStyle: 'italic' },
        { token: 'number', foreground: 'f78c6c' },
        { token: 'function.name', foreground: '82aaff' },
      ],
      colors: {
        'editor.background': '#011627',
        'editor.foreground': '#d6deeb',
      }
    });

    monaco.editor.defineTheme('material-palenight', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c792ea', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'ffcb6b', fontStyle: 'bold' },
        { token: 'string', foreground: 'c3e88d' },
        { token: 'comment', foreground: '676e95' },
        { token: 'number', foreground: 'f78c6c' },
        { token: 'function.name', foreground: '82aaff' },
      ],
      colors: {
        'editor.background': '#292D3E',
        'editor.foreground': '#A6ACCD',
      }
    });

    monaco.editor.defineTheme('rose-pine', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c4a7e7', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '9ccfd8', fontStyle: 'bold' },
        { token: 'string', foreground: 'f6c177' },
        { token: 'comment', foreground: '6e6a86' },
        { token: 'number', foreground: 'ebbcba' },
        { token: 'function.name', foreground: 'eb6f92' },
      ],
      colors: {
        'editor.background': '#191724',
        'editor.foreground': '#E0DEF4',
      }
    });

    monaco.editor.defineTheme('tokyo-night', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '9d7cd8', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '7dcfff', fontStyle: 'bold' },
        { token: 'string', foreground: '9ece6a' },
        { token: 'comment', foreground: '565f89' },
        { token: 'number', foreground: 'ff9e64' },
        { token: 'function.name', foreground: '7aa2f7' },
      ],
      colors: {
        'editor.background': '#1A1B26',
        'editor.foreground': '#A9B1D6',
      }
    });

    monaco.editor.defineTheme('synthwave84', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'fede5d', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'ff7edb', fontStyle: 'bold' },
        { token: 'string', foreground: 'ff8b39' },
        { token: 'comment', foreground: '848bb2' },
        { token: 'number', foreground: 'f97e72' },
        { token: 'function.name', foreground: '36f9f6' },
      ],
      colors: {
        'editor.background': '#262335',
        'editor.foreground': '#FFFFFF',
      }
    });

    monaco.editor.defineTheme('gruvbox-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'fb4934', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '83a598', fontStyle: 'bold' },
        { token: 'string', foreground: 'b8bb26' },
        { token: 'comment', foreground: '928374' },
        { token: 'number', foreground: 'd3869b' },
        { token: 'function.name', foreground: 'fabd2f' },
      ],
      colors: {
        'editor.background': '#282828',
        'editor.foreground': '#EBDBB2',
      }
    });

    monaco.editor.defineTheme('cobalt2', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'ff9d00', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '80ffbb', fontStyle: 'bold' },
        { token: 'string', foreground: '3ad900' },
        { token: 'comment', foreground: '0088ff' },
        { token: 'number', foreground: 'ff628c' },
        { token: 'function.name', foreground: 'ffc600' },
      ],
      colors: {
        'editor.background': '#193549',
        'editor.foreground': '#FFFFFF',
      }
    });

    monaco.editor.defineTheme('ayu-mirage', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'ffa759', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'ffcc66', fontStyle: 'bold' },
        { token: 'string', foreground: 'bae67e' },
        { token: 'comment', foreground: '5c6773' },
        { token: 'number', foreground: 'ffad66' },
        { token: 'function.name', foreground: 'f29e74' },
      ],
      colors: {
        'editor.background': '#212733',
        'editor.foreground': '#CCCAC2',
      }
    });

    monaco.editor.defineTheme('oceanic-next', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c594c5', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '6699cc', fontStyle: 'bold' },
        { token: 'string', foreground: '99c794' },
        { token: 'comment', foreground: '65737e' },
        { token: 'number', foreground: 'f99157' },
        { token: 'function.name', foreground: '6699cc' },
      ],
      colors: {
        'editor.background': '#1B2B34',
        'editor.foreground': '#D8DEE9',
      }
    });

    monaco.editor.defineTheme('shades-of-purple', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'ff9d00', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'a599e9', fontStyle: 'bold' },
        { token: 'string', foreground: '3ad900' },
        { token: 'comment', foreground: 'b362ff' },
        { token: 'number', foreground: 'ff628c' },
        { token: 'function.name', foreground: 'fad000' },
      ],
      colors: {
        'editor.background': '#2D2B55',
        'editor.foreground': '#FFFFFF',
      }
    });

    monaco.editor.defineTheme('winter-is-coming', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '00bff3', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'a6accd', fontStyle: 'bold' },
        { token: 'string', foreground: '5f7e97' },
        { token: 'comment', foreground: '35495f' },
        { token: 'number', foreground: '82AAFF' },
        { token: 'function.name', foreground: 'd2a8ff' },
      ],
      colors: {
        'editor.background': '#011627',
        'editor.foreground': '#D6DEEB',
      }
    });

    monaco.editor.defineTheme('custom-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#00000000',
        'editor.foreground': '#FFFFFF',
      }
    });

    monaco.languages.setMonarchTokensProvider('rbxeasy', {
      tokenizer: {
        root: [
          [/\b(func|var|if|else|elseif|while|for|return|true|false|nil|include|break|continue|local|function|luau)\b/, 'keyword'],
          [/\b(workspace|game|task|script|print|warn|error|wait|tick|time|Enum|Instance|Vector3|CFrame|Color3|UDim2|UDim|Ray|Rect|Region3|spawn|delay|require|getmetatable|setmetatable|type|tostring|tonumber|math|table|bit32|debug|utf8|os|coroutine|Players|ServerStorage|ReplicatedStorage|HttpService|TweenService|RunService|UserInputService|Workspace|Game|listen)\b/, 'type.identifier'],
          [/[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/, 'function.name'], // Function calls/definitions
          [/[{}()\[\]]/, '@brackets'],
          [/[0-9]+/, 'number'],
          [/"[^"]*"/, 'string'],
          [/'[^']*'/, 'string'],
          [/\/\/.*/, 'comment'],
          [/[a-zA-Z_][a-zA-Z0-9_]*/, {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier'
            }
          }],
          [/[+\-*/=<>!&|]/, 'operator'],
        ]
      },
      keywords: ['func', 'var', 'if', 'else', 'elseif', 'while', 'for', 'return', 'true', 'false', 'nil', 'include', 'break', 'continue', 'local', 'function', 'luau']
    });

    monaco.languages.registerCompletionItemProvider('rbxeasy', {
      provideCompletionItems: (model: any, position: any) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const textBeforeCursor = lineContent.substring(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [
          ...['func', 'var', 'if', 'else', 'elseif', 'while', 'for', 'return', 'true', 'false', 'nil', 'include', 'break', 'continue', 'luau'].map(k => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            detail: 'RbxEasy Keyword',
            range
          })),
          ...['Workspace', 'Game', 'Players', 'print', 'warn', 'error', 'require', 'wait', 'task', 'math', 'string', 'table', 'listen', 'game', 'workspace'].map(k => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: k,
            detail: 'Built-in Function',
            range
          })),
          // User variables
          ...Array.from(new Set(model.getValue().match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [])).map(id => ({
            label: id,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: id,
            detail: 'User Identifier',
            range
          })),
          ...ROBLOX_CLASSES.map(c => ({
            label: c,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: c,
            detail: 'Roblox Class',
            documentation: `Roblox class representing a ${c}.`,
            range
          })),
          ...ROBLOX_PROPERTIES.map(p => ({
            label: p,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: p,
            detail: 'Roblox Property',
            documentation: `Property: ${p}`,
            range
          })),
        ];

        // Custom snippets & smart suggestions
        if (textBeforeCursor.endsWith('TweenInfo.')) {
          suggestions.push({
            label: 'new',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'new(${1:time}, ${2:Enum.EasingStyle.Linear}, ${3:Enum.EasingDirection.Out})',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Create new TweenInfo',
            range
          });
        }
        
        // Intelligent service suggestions (Regex trigger)
        if (/[:\.][a-zA-Z0-9_]*$/.test(textBeforeCursor)) {
           suggestions.push({
             label: 'Create',
             kind: monaco.languages.CompletionItemKind.Method,
             insertText: 'Create()',
             insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
             detail: 'Create (TweenService method)',
             documentation: 'Создает твин для объекта',
             range
           });
        }

        suggestions.push(
          {
            label: 'listen',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'listen()',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Событие',
            documentation: 'Слушает событие и вызывает callback',
            range
          },
          {
            label: 'Instance.new',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'Instance.new()',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Создать объект',
            documentation: 'Создает новый объект в Roblox',
            range
          },
          {
            label: 'game:GetService',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'game:GetService()',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Получить сервис',
            documentation: 'Получает сервис, например DataStoreService',
            range
          },
          {
            label: 'func',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'func ${1:name}() {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Объявить функцию',
            documentation: 'func name() {\n\t...\n}',
            range
          },
          {
            label: 'var',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'var ${1:name} = ${2:value};',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Объявить переменную',
            documentation: 'var name = value;',
            range
          },
          {
            label: 'if',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'if (${1:condition}) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Условие if',
            documentation: 'if (condition) {\n\t...\n}',
            range
          },
          {
            label: 'while',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'while (${1:condition}) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Цикл while',
            documentation: 'while (condition) {\n\t...\n}',
            range
          },
          {
            label: 'for',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'for (var i = 0; i < ${1:10}; i++) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Цикл for',
            documentation: 'for (var i = 0; i < 10; i++) {\n\t...\n}',
            range
          },
          {
            label: 'include',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'include "${1:FileName}"',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Подключить библиотеку',
            range
          },
          {
            label: 'luau',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'luau {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Вставка чистого Luau кода',
            documentation: 'luau {\n\t...\n}',
            range
          },
        );
        // Scan user-defined identifiers
        const text = model.getValue();
        const identifierRegex = /([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match;
        const identifiers = new Set<string>();
        while ((match = identifierRegex.exec(text)) !== null) {
          if (match[0] !== word.word) {
            identifiers.add(match[0]);
          }
        }
        identifiers.forEach(id => {
          suggestions.push({
            label: id,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: id,
            detail: 'User defined variable/function',
            range
          });
        });

        // Smart expansion for "func [name]"
        const funcMatch = textBeforeCursor.match(/\bfunc\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (funcMatch) {
          const name = funcMatch[1];
          suggestions.push({
            label: `func ${name}`,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: `func ${name}(\${1:params}) {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column - funcMatch[0].length,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            },
            detail: `Развернуть функцию ${name}`,
            sortText: '0'
          });
        }

        return { suggestions: suggestions };
      }
    });

    monaco.languages.registerHoverProvider('rbxeasy', {
      provideHover: (model: any, position: any) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const tips: Record<string, string> = {
          'func': '**func** - Объявляет функцию. Использование: `func имя() { ... }`',
          'var': '**var** - Объявляет переменную. Использование: `var имя = значение`',
          'include': '**include** - Подключает внешний файл (библиотеку). Использование: `include "Путь"`',
          'listen': '**listen** - Подключает обработчик события. Использование: `listen(объект.Событие, функция)`',
          'if': '**if** - Условный оператор. Выполняет блок кода, если условие истинно.',
          'while': '**while** - Цикл. Выполняет код, пока условие истинно.',
          'luau': '**luau** - Блок нативного Luau кода. Содержимое не компилируется правилами RbxEasy.',
          'game': 'Глобальный объект **game**. Главный сервис в Roblox, предоставляющий доступ ко всем остальным сервисам.',
          'workspace': 'Глобальный объект **workspace**. Содержит все физические 3D объекты игрового мира.',
          'Workspace': 'Глобальный объект **Workspace**. Содержит все физические 3D объекты игрового мира.'
        };

        if (tips[word.word]) {
          return {
            contents: [{ value: tips[word.word] }]
          };
        }
        return null;
      }
    });
  }

  const renderWelcome = () => (
    <div className="welcome-screen">
      <div className="welcome-logo">💎</div>
      <h1>RbxEasy IDE</h1>
      <p>Профессиональная разработка для Roblox стала проще.</p>
      
      <div className="welcome-grid">
        <div className="welcome-section">
          <h2>Начало работы</h2>
          <div className="welcome-card" onClick={() => handleCreateProject('Empty')}>
            <div className="welcome-card-icon">✨</div>
            <div className="welcome-card-info">
              <h3>Пустой проект</h3>
              <p>Создать только Main.rbxe</p>
            </div>
          </div>
          <div className="welcome-card" onClick={() => handleCreateProject('Roblox Part')}>
            <div className="welcome-card-icon">🧱</div>
            <div className="welcome-card-info">
              <h3>Roblox Part</h3>
              <p>Скрипт управления деталью</p>
            </div>
          </div>
          <div className="welcome-card" onClick={() => handleCreateProject('UI Controller')}>
            <div className="welcome-card-icon">🖥️</div>
            <div className="welcome-card-info">
              <h3>UI Контроллер</h3>
              <p>Шаблон для работы с интерфейсом</p>
            </div>
          </div>
          <div className="welcome-card" onClick={() => handleOpenProject()}>
            <div className="welcome-card-icon">📂</div>
            <div className="welcome-card-info">
              <h3>Открыть папку</h3>
              <p>Выбрать проект на диске</p>
            </div>
          </div>
        </div>

        <div className="welcome-section">
          <h2>Недавние проекты</h2>
          <div className="recent-projects-list">
            {recentProjects.length > 0 ? (
              recentProjects.map(path => (
                <div key={path} className="recent-item" onClick={() => handleOpenProject(path)}>
                  <span className="recent-name">{path.split(/[\\/]/).pop()}</span>
                  <span className="recent-path">{path}</span>
                </div>
              ))
            ) : (
              <div style={{ color: '#666', fontSize: '13px', fontStyle: 'italic' }}>Список пуст</div>
            )}
          </div>

          <h2 style={{ marginTop: '30px' }}>Обучение (200 уроков)</h2>
          <div className="welcome-card tutorial-card" onClick={() => setViewMode('tutorial')}>
             <div className="welcome-card-icon">🎓</div>
             <div className="welcome-card-info">
               <h3>Академия Разработки</h3>
               <p>RbxEasy: {userProgress.completed.RbxEasy.length}/200 | Luau: {userProgress.completed.Luau.length}/200</p>
             </div>
             {userProgress.completed.RbxEasy.length === 200 && userProgress.completed.Luau.length === 200 && <div className="done-badge">🏆 МАСТЕР</div>}
          </div>
        </div>
      </div>
    </div>
  )

  if (!isReady) return <div className="loading-overlay"><div className="spinner"></div></div>

  return (
    <div className="vs-layout">
      <div className="main-wrapper">
        <div className="activity-bar">
          <div 
            className={`activity-icon ${viewMode === 'explorer' ? 'active' : ''}`} 
            title="Проводник"
            onClick={() => setViewMode('explorer')}
          >📁</div>
          <div 
            className={`activity-icon ${viewMode === 'search' ? 'active' : ''}`} 
            title="Поиск"
            onClick={() => setViewMode('search')}
          >🔍</div>
          <div 
            className={`activity-icon ${viewMode === 'tutorial' ? 'active' : ''}`} 
            title="Обучение"
            onClick={() => setViewMode('tutorial')}
          >🎓 {(userProgress.completed.RbxEasy.length > 0 || userProgress.completed.Luau.length > 0) && <span className="progress-dot"></span>}</div>
          <div 
            className={`activity-icon ${viewMode === 'welcome' ? 'active' : ''}`} 
            title="Приветствие"
            onClick={() => setViewMode('welcome')}
          >❓</div>
          
          <div 
            className={`activity-icon settings-icon ${viewMode === 'settings' ? 'active' : ''}`} 
            title="Настройки"
            onClick={() => setViewMode('settings')}
          >⚙️</div>
        </div>

        <div className="main-container">
          {viewMode !== 'welcome' && viewMode !== 'tutorial' && (
            <aside className="sidebar">
              <div className="sidebar-title">
                <span className="sidebar-title-text">
                  {viewMode === 'explorer' && (projectPath ? projectPath.split(/[\\/]/).pop() : 'НЕТ ПРОЕКТА')}
                  {viewMode === 'search' && 'ПОИСК'}
                  {viewMode === 'settings' && 'НАСТРОЙКИ'}
                </span>
                {viewMode === 'explorer' && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button 
                      className="explorer-action-btn" 
                      onClick={handleCreateFile} 
                      title="Новый файл"
                    >📄+</button>
                    <button className="explorer-action-btn" onClick={handleSaveAll} title="Сохранить всё">💾</button>
                    <button className="explorer-action-btn" onClick={handleCompile} title="Собрать Бандл" style={{ color: '#4ec9b0' }}>🔨</button>
                  </div>
                )}
              </div>
              
              {viewMode === 'explorer' && (
                <div className="file-explorer">
                  {isCreatingFile && (
                    <div className="explorer-item active" style={{ padding: '5px 10px' }}>
                      <input 
                        type="text" 
                        className="vs-input" 
                        style={{ fontSize: '12px', padding: '2px 5px', height: '24px' }}
                        value={newFileName}
                        autoFocus
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmCreateFile();
                          if (e.key === 'Escape') setIsCreatingFile(false);
                        }}
                        onBlur={() => {
                          if (!newFileName.trim()) setIsCreatingFile(false);
                        }}
                      />
                      <button className="explorer-action-btn" onClick={confirmCreateFile} style={{ color: '#4ec9b0' }}>✓</button>
                      <button className="explorer-action-btn" onClick={() => setIsCreatingFile(false)} style={{ color: '#f44747' }}>✕</button>
                    </div>
                  )}
                  {files.sort((a,b) => {
                    if(a.isLibrary !== b.isLibrary) return a.isLibrary ? -1 : 1;
                    return (a.bundleOrder || 0) - (b.bundleOrder || 0);
                  }).map((f) => (
                    <div 
                      key={f.name} 
                      className={`explorer-item ${f.name === activeFileName ? 'active' : ''} ${f.isLibrary ? 'library-file' : ''} ${!f.isLinked ? 'unlinked' : ''}`}
                      onClick={() => setActiveFileName(f.name)}
                    >
                      <div className="file-icon-area" style={{ display: 'flex', gap: '5px', marginRight: '5px' }}>
                         <span 
                           className={`link-toggle ${f.isLinked ? 'active' : ''}`} 
                           title={f.isLinked ? "Связано (будет в бандле)" : "Не связано"}
                           onClick={(e) => {
                             e.stopPropagation();
                             setFiles(prev => {
                               const newFiles = prev.map(file => file.name === f.name ? { ...file, isLinked: !file.isLinked } : file);
                               saveProjectConfig(newFiles, projectPath);
                               return newFiles;
                             });
                           }}
                         >🔗</span>
                         <span 
                           className={`library-toggle ${f.isLibrary ? 'active' : ''}`} 
                           title={f.isLibrary ? "Библиотека (Библиотеки идут первыми)" : "Сделать библиотекой"}
                           onClick={(e) => {
                             e.stopPropagation();
                             setFiles(prev => {
                               const newFiles = prev.map(file => file.name === f.name ? { ...file, isLibrary: !file.isLibrary } : file);
                               saveProjectConfig(newFiles, projectPath);
                               return newFiles;
                             });
                           }}
                         >📚</span>
                      </div>
                      
                      <span className="file-name" style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>

                      <div className="order-input-area" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', marginLeft: '5px' }}>
                        <input 
                          type="number" 
                          className="bundle-order-input" 
                          value={f.bundleOrder} 
                          style={{ width: '30px', background: '#3c3c3c', border: '1px solid #555', color: '#ccc', fontSize: '10px', padding: '1px 2px', borderRadius: '2px', textAlign: 'center' }}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFiles(prev => {
                              const newFiles = prev.map(file => file.name === f.name ? { ...file, bundleOrder: val } : file);
                              saveProjectConfig(newFiles, projectPath);
                              return newFiles;
                            });
                          }}
                        />
                      </div>

                      <div className="explorer-actions">
                        <button className="explorer-action-btn" onClick={(e) => handleDeleteFile(e, f)} title="Удалить" style={{ fontSize: '12px' }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {viewMode === 'search' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ padding: '10px 20px' }}>
                    <input 
                      type="text" 
                      placeholder="Искать во всех файлах..." 
                      className="vs-input" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="search-results">
                    {searchResults.length > 0 ? (
                      searchResults.map((res, i) => (
                        <div key={i} className="search-result-item" onClick={() => {
                          setActiveFileName(res.fileName)
                          setTimeout(() => {
                            if (editorRef.current) {
                              editorRef.current.revealLineInCenter(res.line)
                              editorRef.current.setPosition({ lineNumber: res.line, column: 1 })
                              editorRef.current.focus()
                            }
                          }, 100)
                        }}>
                          <span className="search-result-file">{res.fileName}</span>
                          <span className="search-result-line">
                            Строка {res.line}: {res.text}
                          </span>
                        </div>
                      ))
                    ) : searchQuery && (
                      <div style={{ padding: '0 20px', fontSize: '12px', color: '#666' }}>Ничего не найдено.</div>
                    )}
                  </div>
                </div>
              )}

              {viewMode === 'settings' && (
                <div style={{ padding: '20px' }}>
                  <div className="setting-item">
                    <label>Режим языка</label>
                    <select value={languageMode} onChange={(e) => setLanguageMode(e.target.value as LanguageMode)}>
                      <option value="RbxEasy">RbxEasy (Рекомендуется)</option>
                      <option value="Luau">Luau (Нативный)</option>
                    </select>
                  </div>

                  <div className="setting-item">
                    <label>Тема оформления</label>
                    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                      {Object.entries(PRESET_THEMES).map(([id, t]) => (
                        <option key={id} value={id}>{t.name}</option>
                      ))}
                      <option value="custom">✨ Своя тема (Кастомная)</option>
                    </select>
                  </div>

                  {theme === 'custom' && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--vs-border)' }}>
                      <h4 style={{ fontSize: '11px', color: 'var(--vs-accent)', marginBottom: '15px', textTransform: 'uppercase' }}>Настройка кастомной темы</h4>
                      
                      <div className="setting-item">
                        <label>Фоновое изображение (URL)</label>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <input 
                            type="text" 
                            className="vs-input" 
                            style={{ flex: 1 }}
                            placeholder="https://example.com/image.jpg"
                            value={customTheme.bgImage} 
                            onChange={(e) => setCustomTheme({...customTheme, bgImage: e.target.value})} 
                          />
                          {!customTheme.bgImage.startsWith('file://') && customTheme.bgImage && (
                            <button 
                              className="vs-button" 
                              onClick={handleDownloadThemeImage}
                              disabled={isDownloading}
                              style={{ padding: '0 10px', fontSize: '10px', minWidth: '40px' }}
                            >
                              {isDownloading ? '...' : '💾'}
                            </button>
                          )}
                          {customTheme.bgImage && (
                            <button 
                              className="vs-button secondary" 
                              onClick={handleResetThemeImage}
                              style={{ padding: '0 10px', fontSize: '10px', minWidth: '40px' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                        {isDownloading && <div style={{ fontSize: '10px', color: 'var(--vs-accent)', marginTop: '4px' }}>Загрузка...</div>}
                        {customTheme.bgImage.startsWith('file://') && (
                          <div style={{ fontSize: '10px', color: '#8aa', marginTop: '4px' }}>✓ Сохранено локально</div>
                        )}
                      </div>

                      <div className="setting-item">
                        <label>Прозрачность фона ({Math.round(customTheme.bgOpacity * 100)}%)</label>
                        <input 
                          type="range" 
                          min="0" max="1" step="0.01" 
                          value={customTheme.bgOpacity} 
                          onChange={(e) => setCustomTheme({...customTheme, bgOpacity: parseFloat(e.target.value)})} 
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div className="setting-item">
                        <label>Размытие ({customTheme.blur}px)</label>
                        <input 
                          type="range" 
                          min="0" max="50" step="1" 
                          value={customTheme.blur} 
                          onChange={(e) => setCustomTheme({...customTheme, blur: parseInt(e.target.value)})} 
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="setting-item">
                          <label>Цвет тонировки</label>
                          <input 
                            type="color" 
                            value={customTheme.bgTint.startsWith('rgba') ? '#000000' : customTheme.bgTint} 
                            onChange={(e) => setCustomTheme({...customTheme, bgTint: e.target.value})} 
                          />
                        </div>
                        <div className="setting-item">
                          <label>Акцент</label>
                          <input 
                            type="color" 
                            value={customTheme.accentColor} 
                            onChange={(e) => setCustomTheme({...customTheme, accentColor: e.target.value})} 
                          />
                        </div>
                        <div className="setting-item">
                          <label>Боковая панель</label>
                          <input 
                            type="color" 
                            value={customTheme.sidebarColor} 
                            onChange={(e) => setCustomTheme({...customTheme, sidebarColor: e.target.value})} 
                          />
                        </div>
                        <div className="setting-item">
                          <label>Панель иконок</label>
                          <input 
                            type="color" 
                            value={customTheme.activityBarColor} 
                            onChange={(e) => setCustomTheme({...customTheme, activityBarColor: e.target.value})} 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="setting-item">
                    <label className="setting-toggle">
                      <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
                      Автосохранение
                    </label>
                  </div>

                  <div className="setting-item">
                    <label className="setting-toggle">
                      <input type="checkbox" checked={showMinimap} onChange={(e) => setShowMinimap(e.target.checked)} />
                      Миникарта
                    </label>
                  </div>

                  <div style={{ marginTop: '40px', borderTop: '1px solid #333', paddingTop: '20px' }}>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '10px' }}>ДИАГНОСТИКА</div>
                    <button className="vs-button secondary" style={{ width: '100%' }} onClick={() => setViewMode('welcome')}>Экран приветствия</button>
                    <button className="vs-button secondary" style={{ width: '100%', marginTop: '10px' }} onClick={() => setViewMode('tutorial')}>Начать обучение</button>
                  </div>
                </div>
              )}
            </aside>
          )}

          <section className="editor-section">
            {zoomVisible && (
              <div className="zoom-overlay">
                {Math.round((fontSize / 14) * 100)}%
              </div>
            )}
            {compilationStatus && (
              <div className="compilation-notification">
                {compilationStatus}
              </div>
            )}
            {viewMode === 'welcome' || (viewMode === 'explorer' && files.length === 0) ? (
              renderWelcome()
            ) : viewMode === 'tutorial' ? (
              <Tutorial 
                onBack={() => setViewMode('welcome')} 
                completedProgress={userProgress.completed} 
                onComplete={handleTutorialComplete} 
                fontSize={fontSize} 
                theme={theme} 
                />
            ) : (
              <>
                {files.length > 0 && (
                  <div className="tab-container">
                    {files.map(f => (
                      <div key={f.name} className={`tab ${f.name === activeFileName ? 'active' : ''}`} onClick={() => setActiveFileName(f.name)}>
                        {f.name}
                      </div>
                    ))}
                  </div>
                )}

                <div className="editor-wrapper" ref={containerRef}>
                  {isEditorLoading && (
                    <div className="loading-overlay">
                      <div className="spinner"></div>
                      <span>Загрузка окружения...</span>
                    </div>
                  )}
                  <Editor
                    height="100%"
                    theme={theme === 'custom' ? 'custom-theme' : (PRESET_THEMES[theme]?.monaco || 'vs-dark')}
                    language={languageMode === 'RbxEasy' ? 'rbxeasy' : 'lua'}

                    value={activeFile?.content || ""}
                    onChange={handleEditorChange}
                    onMount={(editor, monaco) => {
                      editorRef.current = editor
                      monacoRef.current = monaco
                      setIsEditorLoading(false)
                    }}
                    beforeMount={handleEditorWillMount}
                    options={{
                      minimap: { enabled: showMinimap },
                      fontSize: fontSize,
                      fontWeight: '900',
                      fontFamily: "'Consolas', 'Courier New', monospace",
                      letterSpacing: 0,
                      automaticLayout: true,
                      padding: { top: 10 },
                      tabCompletion: 'on',
                      bracketPairColorization: { enabled: true },

                      smoothScrolling: true,
                      cursorBlinking: 'smooth',
                      cursorSmoothCaretAnimation: 'on',
                      mouseWheelZoom: false
                      }}

                  />
                </div>

                <div className="bottom-panel">
                  <div className="panel-header">
                    <div className={`panel-tab ${activePanel === 'problems' ? 'active' : ''}`} onClick={() => setActivePanel('problems')}>
                      Проблемы ({errors.length}) {isThinking && <span className="thinking-dots">Анализ...</span>}
                    </div>
                    <div className={`panel-tab ${activePanel === 'project-check' ? 'active' : ''}`} onClick={() => setActivePanel('project-check')}>
                      Аудит проекта {projectErrors.length > 0 && <span className="project-error-count">{projectErrors.reduce((acc, curr) => acc + curr.errors.length, 0)}</span>}
                    </div>
                    <div className={`panel-tab ${activePanel === 'output' ? 'active' : ''}`} onClick={() => setActivePanel('output')}>
                      Вывод (Lua)
                    </div>
                    <div style={{ flexGrow: 1 }}></div>
                    {activePanel === 'problems' && errors.some(e => e.fix) && (
                      <button className="quick-fix-all proactive" onClick={handleQuickFixAll}>✨ ИСПРАВИТЬ ВСЁ</button>
                    )}
                    <div className="language-selector" style={{ marginLeft: '15px' }}>
                      <span>{languageMode}</span>
                    </div>
                  </div>
                  <div className="panel-content">
                    {activePanel === 'problems' ? (
                      isThinking && errors.length === 0 ? (
                        <div style={{ padding: '20px', color: '#858585' }}>⏳ Идет анализ кода...</div>
                      ) : errors.length === 0 ? (
                        <div style={{ padding: '20px', color: '#89d185' }}>✓ Проблем не обнаружено. Ваш код идеален!</div>
                      ) : (
                        <div className="problems-list">
                          {errors.map((err, i) => (
                            <div key={i} className={`error-msg-row ${err.severity}`}>
                              <span className="error-icon">{err.severity === 'error' ? '❌' : err.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                              <span className="error-line">Стр {err.line}</span>
                              {err.tag && <span className="error-tag">{err.tag}</span>}
                              <span className="error-text">{err.message}</span>
                              {err.fix && (
                                <button className="fix-btn proactive" onClick={() => applyFix(err)}>АВТО-ИСПРАВЛЕНИЕ</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    ) : activePanel === 'project-check' ? (
                      <div className="project-check-container">
                        <div style={{ padding: '10px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: '#ccc' }}>Анализ всех файлов проекта</span>
                          <button className="vs-button" onClick={handleRunProjectCheck} disabled={isCheckingProject}>
                            {isCheckingProject ? 'Проверка...' : 'Запустить полную проверку'}
                          </button>
                        </div>
                        <div className="problems-list">
                          {projectErrors.length === 0 && !isCheckingProject ? (
                            <div style={{ padding: '20px', color: '#858585' }}>Нажмите кнопку для запуска проверки проекта.</div>
                          ) : projectErrors.length === 0 && isCheckingProject ? (
                            <div style={{ padding: '20px', color: '#858585' }}>⏳ Идет анализ всего проекта...</div>
                          ) : projectErrors.length === 0 ? (
                            <div style={{ padding: '20px', color: '#89d185' }}>✓ Во всем проекте проблем не обнаружено!</div>
                          ) : (
                            projectErrors.map((fileRes, i) => (
                              <div key={i} className="project-file-group">
                                <div className="file-group-header" onClick={() => setActiveFileName(fileRes.fileName)}>
                                  📄 {fileRes.fileName} ({fileRes.errors.length})
                                </div>
                                <div className="file-group-errors">
                                  {fileRes.errors.map((err, j) => (
                                    <div key={j} className={`error-msg-row ${err.severity}`}>
                                      <span className="error-icon">{err.severity === 'error' ? '❌' : err.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                                      <span className="error-line">Стр {err.line}</span>
                                      <span className="error-text">{err.message}</span>
                                    </div>
                                   ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', padding: '10px' }}>
                        <div style={{ position: 'absolute', right: '20px', top: '10px', display: 'flex', gap: '10px' }}>
                          {copyStatus && <span style={{ color: '#89d185', fontSize: '12px', alignSelf: 'center', fontWeight: 'bold' }}>{copyStatus}</span>}
                          <button className="vs-button secondary" onClick={handleCopyCode}>КОПИРОВАТЬ ВЕСЬ СКРИПТ</button>
                          <button className="vs-button" onClick={() => window.api.saveFile(compiledCode)}>Экспорт</button>
                        </div>
                        <pre className="compiled-code">{compiledCode || "Готов к сборке..."}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <footer className="status-bar">
        <div style={{ display: 'flex', gap: '20px' }}>
          <div>📍 {projectPath || 'Папка не открыта'}</div>
          <div>🔥 {activeFileName || 'Нет активного файла'}</div>
        </div>
        <div className="status-bar-center">RbxEasy IDE v3.0 Ultra | Режим {languageMode}</div>
        <div style={{ opacity: 0.7 }}>Готово</div>
      </footer>
    </div>
  )
}

export default App
