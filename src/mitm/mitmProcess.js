const { exec, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const https = require("https");
const { MITM_DIR } = require("./paths");

const IS_WIN = process.platform === "win32";
const MITM_PORT = 443;
const PID_FILE = path.join(MITM_DIR, ".mitm.pid");

function resolveServerPath() {
  if (process.env.MITM_SERVER_PATH) return process.env.MITM_SERVER_PATH;
  const sibling = path.join(__dirname, "server.js");
  if (fs.existsSync(sibling)) return sibling;
  const fromCwd = path.join(process.cwd(), "src", "mitm", "server.js");
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromNext = path.join(process.cwd(), "..", "src", "mitm", "server.js");
  if (fs.existsSync(fromNext)) return fromNext;
  return fromCwd;
}

function getProcessUsingPort443() {
  try {
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command ` +
        `"$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } else { 0 }"`;
      const pidStr = execSync(psCmd, { encoding: "utf8", windowsHide: true }).trim();
      const pid = parseInt(pidStr, 10);
      if (pid && pid > 4) {
        const tasklistResult = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8", windowsHide: true });
        const processMatch = tasklistResult.match(/"([^"]+)"/);
        if (processMatch) return processMatch[1].replace(".exe", "");
      }
    } else {
      const result = execSync("lsof -i :443", { encoding: "utf8" });
      const lines = result.trim().split("\n");
      if (lines.length > 1) return lines[1].split(/\s+/)[0];
    }
  } catch {
    return null;
  }
  return null;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EACCES";
  }
}

function killProcess(pid, force = false, sudoPassword = null) {
  if (IS_WIN) {
    const flag = force ? "/F " : "";
    exec(`taskkill ${flag}/PID ${pid}`, { windowsHide: true }, () => { });
  } else {
    const sig = force ? "SIGKILL" : "SIGTERM";
    const cmd = `pkill -${sig} -P ${pid} 2>/dev/null; kill -${sig} ${pid} 2>/dev/null`;
    if (sudoPassword) {
      const { execWithPassword } = require("./dns/dnsConfig");
      execWithPassword(cmd, sudoPassword).catch(() => exec(cmd, () => { }));
    } else {
      exec(cmd, () => { });
    }
  }
}

function checkPort443Free() {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve("in-use");
      else resolve("no-permission");
    });
    tester.once("listening", () => { tester.close(() => resolve("free")); });
    tester.listen(MITM_PORT, "127.0.0.1");
  });
}

function getPort443Owner(sudoPassword) {
  return new Promise((resolve) => {
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "` +
        `$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
        `if ($c) { $c.OwningProcess } else { 0 }"`;
      exec(psCmd, { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null);
        const pid = parseInt(stdout.trim(), 10);
        if (!pid || pid <= 4) return resolve(null);
        exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { windowsHide: true }, (e2, out2) => {
          const m = out2?.match(/"([^"]+)"/);
          resolve({ pid, name: m ? m[1] : "unknown" });
        });
      });
    } else {
      exec(`ps aux | grep "[s]erver.js"`, (err, stdout) => {
        if (!stdout?.trim()) return resolve(null);
        for (const line of stdout.split("\n")) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[1], 10);
          if (!isNaN(pid)) return resolve({ pid, name: "node" });
        }
        resolve(null);
      });
    }
  });
}

async function killLeftoverMitm(serverProcess, sudoPassword, SERVER_PATH) {
  if (serverProcess && !serverProcess.killed) {
    try { serverProcess.kill("SIGKILL"); } catch { /* ignore */ }
  }
  try {
    if (fs.existsSync(PID_FILE)) {
      const savedPid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (savedPid && isProcessAlive(savedPid)) {
        killProcess(savedPid, true, sudoPassword);
        await new Promise(r => setTimeout(r, 500));
      }
      fs.unlinkSync(PID_FILE);
    }
  } catch { /* ignore */ }
  if (!IS_WIN && SERVER_PATH) {
    try {
      const escaped = SERVER_PATH.replace(/'/g, "'\\''");
      if (sudoPassword) {
        const { execWithPassword } = require("./dns/dnsConfig");
        await execWithPassword(`pkill -SIGKILL -f "${escaped}" 2>/dev/null || true`, sudoPassword).catch(() => { });
      } else {
        exec(`pkill -SIGKILL -f "${escaped}" 2>/dev/null || true`, () => { });
      }
      await new Promise(r => setTimeout(r, 500));
    } catch { /* ignore */ }
  }
}

function pollMitmHealth(timeoutMs, port = MITM_PORT) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const req = https.request(
        { hostname: "127.0.0.1", port, path: "/_mitm_health", method: "GET", rejectUnauthorized: false },
        (res) => {
          let body = "";
          res.on("data", (d) => { body += d; });
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              resolve(json.ok === true ? { ok: true, pid: json.pid || null } : null);
            } catch { resolve(null); }
          });
        }
      );
      req.on("error", () => {
        if (Date.now() < deadline) setTimeout(check, 500);
        else resolve(null);
      });
      req.end();
    };
    check();
  });
}

function getSavedPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const savedPid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (savedPid && isProcessAlive(savedPid)) return savedPid;
      fs.unlinkSync(PID_FILE);
    }
  } catch { /* ignore */ }
  return null;
}

function writePid(pid) {
  fs.writeFileSync(PID_FILE, String(pid));
}

function removePid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

module.exports = {
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
};
