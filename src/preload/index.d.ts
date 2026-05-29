import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      saveFile: (content: string) => Promise<boolean>
      openProjectDir: (path?: string) => Promise<any>
      saveProjectFile: (filePath: string, content: string) => Promise<boolean>
      createProject: (template?: string) => Promise<any>
      saveSettings: (settings: any) => Promise<boolean>
      getSettings: () => Promise<any>
      getRecentProjects: () => Promise<string[]>
      addRecentProject: (path: string) => Promise<string[]>
      saveWorkspaceState: (state: any) => Promise<boolean>
      getWorkspaceState: () => Promise<any>
      getUserProgress: () => Promise<any>
      saveUserProgress: (progress: any) => Promise<boolean>
      createFile: (dirPath: string, fileName: string) => Promise<any>
      deleteFile: (filePath: string) => Promise<boolean>
      downloadThemeImage: (url: string) => Promise<string>
      clearThemeAssets: () => Promise<boolean>
      saveProjectConfig: (dirPath: string, config: any) => Promise<boolean>
    }
  }
}
