const { spawn, execSync, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { addDNSEntry, removeDNSEntry, removeAllDNSEntries, checkAllDNSStatus, TOOL_HOSTS, isSudoAvailable } = require("./dns/dnsConfig");
const { generateCert } = require("./cert/generate");
const { installCert, uninstallCert, checkCertInstalled } = require("./cert/install");
const { isCertExpired } = require("./cert/rootCA");
const { MITM_DIR } = require("./paths");
const { log, err } = require("./logger");

const {
  initDbHooks,
  getCachedPassword,
  setCachedPassword,
  saveMitmSettings,
  updateMitmCertStatus,
  clearEncryptedPassword,
  loadEncryptedPassword,
  _getSettings,
} = require("./mitmSettings");

const {
  resolveServerPath,
  getProcessUsingPort443,
  isProcessAlive,
  killProcess,
  checkPort443Free,
  getPort443Owner,
  killLeftoverMitm,
  pollMitmHealth,
  getSavedPid,
  writePid,
  removePid,
  IS_WIN,
  MITM_PORT,
} = require("./mitmProcess");

const MITM_MAX_RESTARTS = 5;
const MITM_RESTART_DELAYS_MS = [5000, 10000, 20000, 30000, 60000];
const MITM_RESTART_RESET_MS = 60000;
const SERVER_PATH = resolveServerPath();

let mitmRestartCount = 0;
let mitmLastStartTime = 0;
let mitmIsRestarting = false;
let serverProcess = null;
let serverPid = null;

async function getMitmStatus() {
  let running = serverProcess !== null && !serverProcess.killed;
  let pid = serverPid;

  if (!running) {
    const savedPid = getSavedPid();
    if (savedPid) {
      running = true;
      pid = savedPid;
    }
  }

  const dnsStatus = checkAllDNSStatus();
  const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
  const certExists = fs.existsSync(rootCACertPath);
  const certTrusted = certExists ? await checkCertInstalled(rootCACertPath) : false;

  return { running, pid, certExists, certTrusted, dnsStatus };
}

async function scheduleMitmRestart(apiKey) {
  if (mitmIsRestarting) return;

  const aliveMs = Date.now() - mitmLastStartTime;
  if (aliveMs >= MITM_RESTART_RESET_MS) mitmRestartCount = 0;

  if (mitmRestartCount >= MITM_MAX_RESTARTS) {
    err("Max restart attempts reached. Giving up.");
    return;
  }

  const attempt = mitmRestartCount;
  const delay = MITM_RESTART_DELAYS_MS[Math.min(attempt, MITM_RESTART_DELAYS_MS.length - 1)];
  mitmRestartCount++;
  mitmIsRestarting = true;

  log(`Restarting in ${delay / 1000}s... (${mitmRestartCount}/${MITM_MAX_RESTARTS})`);
  await new Promise((r) => setTimeout(r, delay));

  try {
    const settings = _getSettings();
    const settingsObj = settings instanceof Promise ? await settings : settings;
    if (settingsObj && !settingsObj.mitmEnabled) {
      log("MITM disabled, skipping restart");
      mitmIsRestarting = false;
      return;
    }
    const password = getCachedPassword() || await loadEncryptedPassword();
    if (!password && !IS_WIN) {
      err("No cached password, cannot auto-restart");
      mitmIsRestarting = false;
      return;
    }
    await startServer(apiKey, password);
    log("🔄 Restarted successfully");
    mitmRestartCount = 0;
    mitmIsRestarting = false;
  } catch (e) {
    err(`Restart attempt ${mitmRestartCount}/${MITM_MAX_RESTARTS} failed: ${e.message}`);
    mitmIsRestarting = false;
    scheduleMitmRestart(apiKey);
  }
}

async function startServer(apiKey, sudoPassword) {
  // 1. Check existing
  if (!serverProcess || serverProcess.killed) {
    const savedPid = getSavedPid();
    if (savedPid) {
      serverPid = savedPid;
      log(`♻️ Reusing existing process (PID: ${savedPid})`);
      await saveMitmSettings(true, sudoPassword);
      if (sudoPassword) setCachedPassword(sudoPassword);
      return { running: true, pid: savedPid };
    }
  }

  if (serverProcess && !serverProcess.killed) {
    throw new Error("MITM server is already running");
  }

  // 2. Kill leftover
  await killLeftoverMitm(serverProcess, sudoPassword, SERVER_PATH);
  serverProcess = null;
  serverPid = null;

  // 3. Port access check
  if (!IS_WIN) {
    const portStatus = await checkPort443Free();
    if (portStatus === "in-use" || portStatus === "no-permission") {
      const owner = await getPort443Owner(sudoPassword);
      if (owner && owner.name === "node") {
        log(`Killing orphan node process on port 443 (PID ${owner.pid})...`);
        try {
          const { execWithPassword } = require("./dns/dnsConfig");
          await execWithPassword(`kill -9 ${owner.pid}`, sudoPassword);
          await new Promise(r => setTimeout(r, 800));
        } catch { /* best effort */ }
      } else if (owner) {
        const shortName = owner.name.includes("/") ? owner.name.split("/").filter(Boolean).pop() : owner.name;
        throw new Error(`Port 443 is already in use by "${shortName}" (PID ${owner.pid}). Stop that process first.`);
      }
    }
  }

  // 4. cert gen
  const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
  const rootCAKeyPath = path.join(MITM_DIR, "rootCA.key");
  const certExists = fs.existsSync(rootCACertPath) && fs.existsSync(rootCAKeyPath);

  if (!certExists || isCertExpired(rootCACertPath)) {
    if (certExists) {
      log("🔐 Cert expired — uninstalling old cert...");
      const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
      try { await uninstallCert(password, rootCACertPath); } catch { /* best effort */ }
    }
    log("🔐 Generating Root CA...");
    await generateCert();
  }

  // 5. Cert install
  const rootCATrusted = await checkCertInstalled(rootCACertPath);
  const linuxNoSystemTrust = !IS_WIN && process.platform !== "darwin" && !isSudoAvailable();
  if (!rootCATrusted) {
    log("🔐 Cert: not trusted → installing...");
    const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
    if (linuxNoSystemTrust) {
      log(`🔐 Cert: skipping system trust (no sudo). Install ${rootCACertPath} as a trusted CA on machines that use this proxy.`);
    } else {
      if (!password && !IS_WIN) throw new Error("Sudo password required to install Root CA certificate");
      try {
        await installCert(password, rootCACertPath);
        log("🔐 Cert: ✅ trusted");
      } catch (e) {
        throw new Error(`Failed to trust certificate: ${e.message}`);
      }
    }
  } else {
    log("🔐 Cert: already trusted ✅");
  }

  // 6. Spawn Server Process
  log("🚀 Starting server...");
  if (IS_WIN) {
    try {
      const psKill = `$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c -and $c.OwningProcess -gt 4) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }`;
      execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "${psKill}"`, { windowsHide: true });
      await new Promise(r => setTimeout(r, 500));
    } catch { /* best effort */ }

    serverProcess = spawn(
      process.execPath,
      [SERVER_PATH],
      {
        detached: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ROUTER_API_KEY: apiKey, NODE_ENV: "production" },
      }
    );
    await updateMitmCertStatus(true);
  } else if (isSudoAvailable()) {
    const inlineCmd = `ROUTER_API_KEY='${apiKey}' NODE_ENV='production' '${process.execPath}' '${SERVER_PATH}'`;
    serverProcess = spawn(
      "sudo", ["-S", "-E", "sh", "-c", inlineCmd],
      { detached: false, stdio: ["pipe", "pipe", "pipe"] }
    );
    serverProcess.stdin.write(`${sudoPassword}\n`);
    serverProcess.stdin.end();
  } else {
    serverProcess = spawn(process.execPath, [SERVER_PATH], {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ROUTER_API_KEY: apiKey, NODE_ENV: "production" },
    });
  }

  if (serverProcess) {
    serverPid = serverProcess.pid;
    writePid(serverPid);
    mitmLastStartTime = Date.now();
  }

  let startError = null;
  if (serverProcess) {
    serverProcess.stdout.on("data", (data) => process.stdout.write(data));
    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg && (IS_WIN || (!msg.includes("Password:") && !msg.includes("password for")))) {
        err(msg);
        startError = msg;
      }
      if (!IS_WIN && (msg.includes("incorrect password") || msg.includes("no password was provided"))) {
        setCachedPassword(null);
        clearEncryptedPassword();
        mitmIsRestarting = true; // prevent auto-restart
      }
    });

    serverProcess.on("exit", (code) => {
      log(`Server exited (code: ${code})`);
      serverProcess = null;
      serverPid = null;
      removePid();
      if (code !== 0 && !mitmIsRestarting) scheduleMitmRestart(apiKey);
    });
  }

  const health = await pollMitmHealth(8000, MITM_PORT);
  if (!health) {
    if (serverProcess && !serverProcess.killed) { try { serverProcess.kill(); } catch { /* ignore */ } serverProcess = null; }
    const processUsing443 = getProcessUsingPort443();
    const portInfo = processUsing443 ? ` Port 443 already in use by ${processUsing443}.` : "";
    const reason = startError || `Check sudo password or port 443 access.${portInfo}`;
    throw new Error(`MITM server failed to start. ${reason}`);
  }

  await updateMitmCertStatus(true);
  log(`✅ Server healthy (PID: ${serverPid || health.pid})`);

  const dnsStatus = checkAllDNSStatus();
  for (const [tool, active] of Object.entries(dnsStatus)) {
    log(`🌐 DNS ${tool}: ${active ? "✅ active" : "❌ inactive"}`);
  }

  await saveMitmSettings(true, sudoPassword);
  if (sudoPassword) setCachedPassword(sudoPassword);

  return { running: true, pid: serverPid };
}

async function stopServer(sudoPassword) {
  mitmIsRestarting = true;
  mitmRestartCount = 0;
  log("⏹ Stopping server...");

  const pidToKill = (serverProcess && !serverProcess.killed) ? serverProcess.pid : getSavedPid();
  if (pidToKill) {
    log(`Killing server (PID: ${pidToKill})...`);
    killProcess(pidToKill, false, sudoPassword);
    await new Promise(r => setTimeout(r, 1000));
    if (isProcessAlive(pidToKill)) killProcess(pidToKill, true, sudoPassword);
  }
  
  serverProcess = null;
  serverPid = null;

  if (IS_WIN) {
    const hostsFile = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
    const allHosts = Object.values(TOOL_HOSTS).flat();
    try {
      const hostsContent = fs.readFileSync(hostsFile, "utf8");
      const filtered = hostsContent.split(/\r?\n/).filter(l => !allHosts.some(h => l.includes(h))).join("\r\n");
      fs.writeFileSync(hostsFile, filtered, "utf8");
      execSync("ipconfig /flushdns", { windowsHide: true });
    } catch (e) { err(`Failed to clean hosts: ${e.message}`); }
  } else {
    await removeAllDNSEntries(sudoPassword);
  }

  removePid();
  await saveMitmSettings(false, null);
  mitmIsRestarting = false;

  return { running: false, pid: null };
}

async function enableToolDNS(tool, sudoPassword) {
  const status = await getMitmStatus();
  if (!status.running) throw new Error("MITM server is not running. Start the server first.");
  
  const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
  await addDNSEntry(tool, password);
  return { success: true };
}

async function disableToolDNS(tool, sudoPassword) {
  const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
  await removeDNSEntry(tool, password);
  return { success: true };
}

async function trustCert(sudoPassword) {
  const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
  if (!fs.existsSync(rootCACertPath)) throw new Error("Root CA not found. Start server first to generate it.");
  
  if (!IS_WIN && process.platform !== "darwin" && !isSudoAvailable()) {
    log(`🔐 Cert: system trust unavailable (no sudo). Use file: ${rootCACertPath}`);
    return;
  }
  
  const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
  if (!password && !IS_WIN) throw new Error("Sudo password required to trust certificate");
  
  await installCert(password, rootCACertPath);
  if (password) setCachedPassword(password);
}

module.exports = {
  getMitmStatus,
  startServer,
  stopServer,
  enableToolDNS,
  disableToolDNS,
  trustCert,
  // Legacy
  startMitm: startServer,
  stopMitm: stopServer,
  getCachedPassword,
  setCachedPassword,
  loadEncryptedPassword,
  clearEncryptedPassword,
  initDbHooks,
};
