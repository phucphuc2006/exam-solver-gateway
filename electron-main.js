/**
 * Exam Solver AI Gateway - Electron Main Process
 * Creates a native Desktop window wrapping the Next.js server
 */

const { app, BrowserWindow, dialog, Menu, Tray, nativeImage } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

// ─── Configuration ───────────────────────────────────────────
const PORT = 21088;
const SERVER_URL = `http://localhost:${PORT}`;
const IS_DEV = !app.isPackaged;

let mainWindow = null;
let serverProcess = null;
let tray = null;
let isQuitting = false;

// ─── Single Instance Lock ────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Auto Updater Setup ──────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] Update available: v${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        `document.title = "Exam Solver Gateway - Dang tai ban cap nhat v${info.version}..."`
      );
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[Updater] Already up to date.");
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[Updater] Downloading: ${pct}%`);
    if (mainWindow) {
      mainWindow.setProgressBar(pct / 100);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    if (mainWindow) {
      mainWindow.setProgressBar(-1); // remove progress bar
    }

    const response = dialog.showMessageBoxSync(mainWindow, {
      type: "info",
      title: "Cap nhat moi",
      message: `Phien ban v${info.version} da san sang. Khoi dong lai de cap nhat?`,
      detail: info.releaseNotes
        ? info.releaseNotes.replace(/<[^>]*>/g, "").slice(0, 300)
        : "",
      buttons: ["Khoi dong lai ngay", "De sau"],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err.message);
  });

  // Check for update after 5 seconds, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(
    () => autoUpdater.checkForUpdates().catch(() => {}),
    4 * 60 * 60 * 1000
  );
}

// ─── Start Next.js Server ────────────────────────────────────
function getServerPath() {
  if (IS_DEV) {
    // Dev: use server-entry.js from project root
    return {
      script: path.join(__dirname, "server-entry.js"),
      cwd: __dirname,
    };
  }
  // Production: resources/app contains the standalone server
  const resourcesPath = path.join(process.resourcesPath, "standalone");
  return {
    script: path.join(resourcesPath, "server.js"),
    cwd: resourcesPath,
  };
}

function startServer() {
  return new Promise((resolve, reject) => {
    const { script, cwd } = getServerPath();
    const fs = require("fs");

    if (!fs.existsSync(script)) {
      reject(new Error(`Server file not found: ${script}`));
      return;
    }

    const env = {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      DATA_DIR: path.join(app.getPath("userData"), "data"),
    };

    // Ensure data directory
    if (!fs.existsSync(env.DATA_DIR)) {
      fs.mkdirSync(env.DATA_DIR, { recursive: true });
    }

    // Copy .env file to userData if not exists
    const userEnvPath = path.join(app.getPath("userData"), ".env");
    if (!fs.existsSync(userEnvPath)) {
      const bundledEnv = IS_DEV
        ? path.join(__dirname, ".env")
        : path.join(process.resourcesPath, "standalone", ".env");
      if (fs.existsSync(bundledEnv)) {
        fs.copyFileSync(bundledEnv, userEnvPath);
      }
    }

    // Load env file
    if (fs.existsSync(userEnvPath)) {
      const content = fs.readFileSync(userEnvPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          env[key] = value;
        }
      }
    }

    console.log(`[Server] Starting: node ${script}`);
    console.log(`[Server] CWD: ${cwd}`);
    console.log(`[Server] Data: ${env.DATA_DIR}`);

    serverProcess = spawn("node", [script], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    serverProcess.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(`[Server] ${text}`);
    });

    serverProcess.stderr.on("data", (data) => {
      const text = data.toString();
      process.stderr.write(`[Server] ${text}`);
    });

    serverProcess.on("error", (err) => {
      console.error("[Server] Failed to start:", err.message);
      reject(err);
    });

    serverProcess.on("exit", (code) => {
      console.log(`[Server] Exited with code: ${code}`);
      serverProcess = null;
      if (!isQuitting) {
        // Server crashed, show error
        dialog.showErrorBox(
          "Server Error",
          `Server bi dung bat ngo (code: ${code}). Ung dung se dong lai.`
        );
        app.quit();
      }
    });

    // Wait for server to be ready by polling the port
    waitForPort(PORT, 30000)
      .then(() => {
        console.log(`[Server] Ready on port ${PORT}`);
        resolve();
      })
      .catch((err) => {
        console.error("[Server] Timeout waiting for server");
        reject(err);
      });
  });
}

function waitForPort(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function tryConnect() {
      if (Date.now() - start > timeout) {
        reject(new Error(`Port ${port} did not open within ${timeout}ms`));
        return;
      }

      const socket = new net.Socket();
      socket.setTimeout(500);

      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.on("error", () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });

      socket.on("timeout", () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });

      socket.connect(port, "127.0.0.1");
    }

    tryConnect();
  });
}

// ─── Kill Server ─────────────────────────────────────────────
function killServer() {
  if (serverProcess) {
    console.log("[Server] Killing server process...");
    try {
      // On Windows, need to kill the entire process tree
      if (process.platform === "win32") {
        const { execSync } = require("child_process");
        execSync(`taskkill /PID ${serverProcess.pid} /T /F`, {
          stdio: "ignore",
        });
      } else {
        serverProcess.kill("SIGTERM");
      }
    } catch {
      // Process may already be dead
    }
    serverProcess = null;
  }
}

// ─── Create Window ───────────────────────────────────────────
function createWindow() {
  const iconPath = IS_DEV
    ? path.join(__dirname, "assets", "icon.ico")
    : path.join(process.resourcesPath, "icon.ico");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Exam Solver AI Gateway",
    icon: iconPath,
    backgroundColor: "#0a0f1a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      const response = dialog.showMessageBoxSync(mainWindow, {
        type: "question",
        title: "Thoat ung dung",
        message: "Ban co muon tat Exam Solver Gateway?",
        detail: "Server se dung hoat dong khi tat ung dung.",
        buttons: ["Tat", "Thu nho", "Huy"],
        defaultId: 2,
        cancelId: 2,
      });

      if (response === 0) {
        // Quit
        isQuitting = true;
        killServer();
        app.quit();
      } else if (response === 1) {
        // Minimize to tray
        mainWindow.hide();
      }
      // else: Cancel, do nothing
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Load the app
  mainWindow.loadURL(SERVER_URL);

  // Handle navigation errors (server not ready)
  mainWindow.webContents.on("did-fail-load", () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(SERVER_URL);
      }
    }, 1000);
  });
}

// ─── System Tray ─────────────────────────────────────────────
function createTray() {
  const iconPath = IS_DEV
    ? path.join(__dirname, "assets", "icon.ico")
    : path.join(process.resourcesPath, "icon.ico");

  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip("Exam Solver AI Gateway");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Mo cua so",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: "separator" },
      {
        label: "Kiem tra cap nhat",
        click: () => autoUpdater.checkForUpdates().catch(() => {}),
      },
      { type: "separator" },
      {
        label: "Thoat",
        click: () => {
          isQuitting = true;
          killServer();
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch {
    // Tray icon is optional
  }
}

// ─── App Lifecycle ───────────────────────────────────────────
app.on("ready", async () => {
  try {
    createTray();

    // Show splash / loading
    const splash = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
    });

    splash.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
      <html>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:rgba(10,15,26,0.95);border-radius:16px;font-family:system-ui,-apple-system,sans-serif;color:white;-webkit-app-region:drag;">
        <div style="text-align:center">
          <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,#00d4ff,#1e3a5f,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:20px;box-shadow:0 0 30px rgba(0,212,255,0.3);">ES</div>
          <h2 style="margin:0 0 8px;font-size:18px;">Exam Solver AI Gateway</h2>
          <p style="margin:0;color:#94a3b8;font-size:13px;">Dang khoi dong server...</p>
          <div style="margin-top:16px;width:200px;height:3px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-left:auto;margin-right:auto;">
            <div style="width:30%;height:100%;background:linear-gradient(90deg,#00d4ff,#7c3aed);border-radius:3px;animation:loading 1.5s infinite ease-in-out;"></div>
          </div>
        </div>
        <style>@keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}</style>
      </body>
      </html>`)}`
    );

    await startServer();

    splash.close();
    createWindow();
    setupAutoUpdater();
  } catch (err) {
    dialog.showErrorBox(
      "Khoi dong that bai",
      `Khong the khoi dong server:\n\n${err.message}\n\nHay dam bao Node.js da duoc cai dat.`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // On macOS, keep app running
  if (process.platform !== "darwin") {
    // Don't quit, keep in tray
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  killServer();
});
