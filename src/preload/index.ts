import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  saveFile: (content: string) => ipcRenderer.invoke('save-file', content),
  openProjectDir: (path?: string) => ipcRenderer.invoke('open-project-dir', path),
  saveProjectFile: (filePath: string, content: string) => ipcRenderer.invoke('save-project-file', filePath, content),
  createProject: (template?: string) => ipcRenderer.invoke('create-project', template),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  addRecentProject: (path: string) => ipcRenderer.invoke('add-recent-project', path),
  saveWorkspaceState: (state: any) => ipcRenderer.invoke('save-workspace-state', state),
  getWorkspaceState: () => ipcRenderer.invoke('get-workspace-state'),
  getUserProgress: () => ipcRenderer.invoke('get-user-progress'),
  saveUserProgress: (progress: any) => ipcRenderer.invoke('save-user-progress', progress),
  createFile: (dirPath: string, fileName: string) => ipcRenderer.invoke('create-file', dirPath, fileName),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  downloadThemeImage: (url: string) => ipcRenderer.invoke('download-theme-image', url),
  clearThemeAssets: () => ipcRenderer.invoke('clear-theme-assets'),
  saveProjectConfig: (dirPath: string, config: any) => ipcRenderer.invoke('save-project-config', dirPath, config)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
