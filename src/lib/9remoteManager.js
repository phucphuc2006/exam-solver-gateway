// 9remote process lifecycle manager
const remoteManagerState = globalThis.__nineRemoteManagerState ??= {
  remoteProcess: null,
  cleanupHandler: null,
  beforeExitHandler: null,
};

export function setRemoteProcess(child) {
  remoteManagerState.remoteProcess = child;
}

export function getRemoteProcess() {
  return remoteManagerState.remoteProcess;
}

export function killRemote() {
  const remoteProcess = remoteManagerState.remoteProcess;
  if (!remoteProcess) return;
  
  try {
    remoteProcess.kill("SIGTERM");
    console.log(`[9remote] Killed process ${remoteProcess.pid}`);
    remoteManagerState.remoteProcess = null;
  } catch (err) {
    console.log(`[9remote] Failed to kill:`, err.message);
    remoteManagerState.remoteProcess = null;
  }
}

// Register cleanup handlers
if (typeof process !== "undefined") {
  const previousCleanup = remoteManagerState.cleanupHandler;
  const previousBeforeExit = remoteManagerState.beforeExitHandler;
  if (previousCleanup) {
    process.off("SIGTERM", previousCleanup);
    process.off("SIGINT", previousCleanup);
  }
  if (previousBeforeExit) {
    process.off("beforeExit", previousBeforeExit);
  }

  const cleanup = () => {
    killRemote();
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  process.on("beforeExit", killRemote);
  remoteManagerState.cleanupHandler = cleanup;
  remoteManagerState.beforeExitHandler = killRemote;
}
