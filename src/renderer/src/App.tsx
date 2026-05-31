import { useState, useEffect, useMemo, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import { Lexer, Parser, Generator, Linter, LinterError } from './compiler/compiler'
import { ALL_LESSONS } from './lessons'

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

  const steps = ALL_LESSONS;

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
          [/\/\/.*$/, 'comment'],
          [/--.*$/, 'comment'],
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
          [/[+\-*/=<>!&|~]=?/, 'operator'],
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

          <h2 style={{ marginTop: '30px' }}>Обучение (500 уроков)</h2>
          <div className="welcome-card tutorial-card" onClick={() => setViewMode('tutorial')}>
             <div className="welcome-card-icon">🎓</div>
             <div className="welcome-card-info">
               <h3>Академия Разработки</h3>
               <p>RbxEasy: {userProgress.completed.RbxEasy.length}/500 | Luau: {userProgress.completed.Luau.length}/500</p>
             </div>
             {userProgress.completed.RbxEasy.length === 500 && userProgress.completed.Luau.length === 500 && <div className="done-badge">🏆 МАСТЕР</div>}
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
