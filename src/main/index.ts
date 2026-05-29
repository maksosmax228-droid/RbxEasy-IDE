import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, extname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { pathToFileURL } from 'url'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers
  ipcMain.on('ping', () => console.log('pong'))

  const CONFIG_PATH = join(app.getPath('userData'), 'rbxeasy_config.json')
  const PROGRESS_PATH = join(app.getPath('userData'), 'user_progress.json')

  const getConfig = () => {
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      } catch (e) {
        return {}
      }
    }
    return {}
  }

  const saveConfig = (config: any) => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  }

  const getProgress = () => {
    if (fs.existsSync(PROGRESS_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'))
        // Migration/Safety: Ensure the new structure exists
        if (data.completedTutorials && !data.completed) {
          data.completed = {
            RbxEasy: data.completedTutorials,
            Luau: []
          }
          delete data.completedTutorials
        }
        if (!data.completed) {
          data.completed = { RbxEasy: [], Luau: [] }
        }
        return data
      } catch (e) {
        return { completed: { RbxEasy: [], Luau: [] }, lastProject: null }
      }
    }
    return { completed: { RbxEasy: [], Luau: [] }, lastProject: null }
  }

  const saveProgress = (progress: any) => {
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2))
  }

  ipcMain.handle('get-user-progress', async () => {
    return getProgress()
  })

  ipcMain.handle('save-user-progress', async (_, progress: any) => {
    saveProgress(progress)
    return true
  })

  ipcMain.handle('get-recent-projects', async () => {
    return getConfig().recentProjects || []
  })

  ipcMain.handle('add-recent-project', async (_, path: string) => {
    const config = getConfig()
    const recent = config.recentProjects || []
    const updated = [path, ...recent.filter((p: string) => p !== path)].slice(0, 10)
    saveConfig({ ...config, recentProjects: updated })
    return updated
  })

  ipcMain.handle('save-workspace-state', async (_, state: any) => {
    const config = getConfig()
    saveConfig({ ...config, lastWorkspace: state })
    return true
  })

  ipcMain.handle('get-workspace-state', async () => {
    return getConfig().lastWorkspace || null
  })

  ipcMain.handle('save-file', async (_, content: string) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Compiled Script',
      defaultPath: 'script.lua',
      filters: [
        { name: 'Lua Script', extensions: ['lua'] },
        { name: 'Text File', extensions: ['txt'] }
      ]
    })

    if (filePath) {
      try {
        fs.writeFileSync(filePath, content)
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    }
    return false
  })

  ipcMain.handle('open-project-dir', async (_, specificPath?: string) => {
    let dirPath: string
    if (specificPath) {
      dirPath = specificPath
      if (!fs.existsSync(dirPath)) return null
    } else {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      if (canceled) return null
      dirPath = filePaths[0]
    }

    try {
      const files = fs.readdirSync(dirPath)
      
      let projectConfig: Record<string, any> = {}
      const configPath = join(dirPath, '.rbxeasy-project.json')
      if (fs.existsSync(configPath)) {
        try {
          projectConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        } catch(e) {}
      }

      const projectFiles = files
        .filter((f) => f.endsWith('.rbxe') || f.endsWith('.lua'))
        .map((f, idx) => {
          const fileConfig = projectConfig[f] || {};
          return {
            name: f,
            content: fs.readFileSync(join(dirPath, f), 'utf-8'),
            path: join(dirPath, f),
            isLinked: fileConfig.isLinked ?? true,
            isLibrary: fileConfig.isLibrary ?? false,
            bundleOrder: fileConfig.bundleOrder ?? idx
          };
        })

      return { path: dirPath, files: projectFiles }
    } catch (e) {
      console.error(e)
      return null
    }
  })

  ipcMain.handle('save-project-config', async (_, dirPath: string, config: any) => {
    try {
      if (!dirPath || !config) return false
      fs.writeFileSync(join(dirPath, '.rbxeasy-project.json'), JSON.stringify(config, null, 2))
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  })

  ipcMain.handle('save-project-file', async (_, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content)
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  })

  ipcMain.handle('save-settings', async (_, settings: any) => {
    const config = getConfig()
    saveConfig({ ...config, settings })
    return true
  })

  ipcMain.handle('get-settings', async () => {
    return getConfig().settings || null
  })

  ipcMain.handle('create-project', async (_, templateName: string = 'Empty') => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: `Выберите папку для нового проекта (${templateName})`
    })
    if (canceled) return null

    const dirPath = filePaths[0]
    const mainFile = join(dirPath, 'Main.rbxe')
    const libFile = join(dirPath, 'Library.rbxe')
    
    let defaultContent = `// RbxEasy - Новый проект\nfunc start() {\n    print("Привет из RbxEasy!")\n}\n\nstart()`
    let files = [{ name: 'Main.rbxe', content: defaultContent, path: mainFile, isLinked: true, isLibrary: false, bundleOrder: 0 }]
    
    if (templateName === 'Roblox Part') {
      defaultContent = `// Контроллер детали Roblox\nvar part = Workspace.Part\n\nfunc colorize() {\n    part.Color = Color3.fromRGB(math.random(0,255), math.random(0,255), math.random(0,255))\n}\n\nwhile (true) {\n    colorize()\n    task.wait(1)\n}`
    } else if (templateName === 'UI Controller') {
      defaultContent = `// UI Контроллер (Venyx Style)
include "Library"

var player = Game.Players.LocalPlayer
var pGui = player:WaitForChild("PlayerGui")

func init() {
    print("Инициализация Venyx UI...")
    
    // Пример создания современного меню
    var menu = createMenu("RbxEasy Hub", Color3.fromRGB(45, 45, 45))
    var tab = menu:AddTab("Главная")
    var section = tab:AddSection("Основные настройки")
    
    section:AddButton("Ускорение", func() {
        player.Character.Humanoid.WalkSpeed = 50
    })
    
    section:AddToggle("Бесконечные прыжки", false, func(state) {
        print("Статус прыжков: " + tostring(state))
    })
    
    showGreeting(player.Name)
}

init()`
      const libContent = `// Библиотека интерфейсов
func createMenu(title, theme) {
    print("Создание меню: " + title)
    // Здесь обычно идет код инициализации фреймворка
    return {
        AddTab: func(name) {
            print("Добавлена вкладка: " + name)
            return {
                AddSection: func(sName) {
                    print("Секция: " + sName)
                    return {
                        AddButton: func(bName, callback) { print("Кнопка: " + bName) },
                        AddToggle: func(tName, def, callback) { print("Переключатель: " + tName) }
                    }
                }
            }
        }
    }
}

func showGreeting(name) {
    print("Привет, " + name + "! Добро пожаловать в RbxEasy IDE.")
}`
      files[0].content = defaultContent
      files.push({ name: 'Library.rbxe', content: libContent, path: libFile, isLinked: true, isLibrary: true, bundleOrder: 0 })
      if (!fs.existsSync(libFile)) {
        fs.writeFileSync(libFile, libContent)
      }
    }

    try {
      if (!fs.existsSync(mainFile)) {
        fs.writeFileSync(mainFile, files[0].content)
      }

      return { path: dirPath, files }
    } catch (e) {
      console.error(e)
      return null
    }
  })


  ipcMain.handle('create-file', async (_, dirPath: string, fileName: string) => {
    try {
      console.log(`Creating file: ${fileName} in ${dirPath}`)
      if (!dirPath || !fileName) {
        return { error: 'Invalid directory path or file name' }
      }
      
      const filePath = join(dirPath, fileName.trim())
      if (fs.existsSync(filePath)) {
        console.log(`File already exists: ${filePath}`)
        return { error: 'File already exists' }
      }
      
      fs.writeFileSync(filePath, '')
      console.log(`File created successfully: ${filePath}`)
      return { 
        name: fileName.trim(), 
        content: '', 
        path: filePath, 
        isLinked: true,
        isLibrary: false,
        bundleOrder: 999
      }
    } catch (e: any) {
      console.error(`Error creating file: ${e.message}`)
      return { error: e.message }
    }
  })

  ipcMain.handle('delete-file', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        return true
      }
      return false
    } catch (e) {
      console.error(e)
      return false
    }
  })

  ipcMain.handle('download-theme-image', async (_, imageUrl: string) => {
    try {
      const assetsDir = join(app.getPath('userData'), 'theme_assets')
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true })
      }

      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)
      
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      const parsedUrl = new URL(imageUrl)
      const extension = extname(parsedUrl.pathname) || '.png'
      const fileName = `background_${Date.now()}${extension}`
      
      // Cleanup old images
      const files = fs.readdirSync(assetsDir)
      for (const file of files) {
        if (file.startsWith('background_')) {
          try {
            fs.unlinkSync(join(assetsDir, file))
          } catch (e) {
            console.error('Failed to delete old theme image:', e)
          }
        }
      }

      const filePath = join(assetsDir, fileName)
      fs.writeFileSync(filePath, buffer)
      
      return pathToFileURL(filePath).href
    } catch (e) {
      console.error('Error downloading theme image:', e)
      throw e
    }
  })

  ipcMain.handle('clear-theme-assets', async () => {
    try {
      const assetsDir = join(app.getPath('userData'), 'theme_assets')
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir)
        for (const file of files) {
          if (file.startsWith('background_')) {
            fs.unlinkSync(join(assetsDir, file))
          }
        }
      }
      return true
    } catch (e) {
      console.error('Error clearing theme assets:', e)
      return false
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
