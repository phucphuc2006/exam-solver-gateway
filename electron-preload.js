/**
 * Exam Solver AI Gateway - Electron Preload Script
 * Provides a secure bridge between the renderer and main process
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  isElectron: true,
  getVersion: () => ipcRenderer.invoke("get-version"),

  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),

  // Updater
  checkForUpdate: () => ipcRenderer.send("check-update"),
  onUpdateStatus: (callback) => ipcRenderer.on("update-status", (_e, status) => callback(status)),
});
