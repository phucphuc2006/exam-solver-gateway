"use client";

import { useState, useEffect } from "react";
import { Card, Button, Toggle, Input } from "@/shared/components";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import { useProfileSettings } from "./useProfileSettings";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "system", label: "System", icon: "computer" },
  { id: "ai-engine", label: "AI Engine", icon: "auto_awesome" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "routing", label: "Routing", icon: "route" },
  { id: "network", label: "Network", icon: "wifi" },
  { id: "observability", label: "Observability", icon: "monitoring" },
];

export default function ProfilePage() {
  const { theme, setTheme, isDark } = useTheme();
  const profile = useProfileSettings();
  const [activeSection, setActiveSection] = useState("appearance");

  // Track which section is visible using IntersectionObserver
  useEffect(() => {
    const sectionIds = SECTIONS.map(s => s.id);
    const observers = [];
    sectionIds.forEach((id) => {
      const el = document.getElementById(`section-${id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveSection(id);
            }
          });
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const {
    settings, loading,
    passwords, setPasswords, passStatus, passLoading,
    dbLoading, dbStatus, importFileRef,
    proxyForm, setProxyForm, proxyStatus, proxyLoading, proxyTestLoading,
    launchAtLogin, isElectron,
    effortTesting, effortTestResult,
    passwordStrength,
    toggleLaunchAtLogin,
    updateAutoStartProxy, updateProxyPort, updateReasoningEffort,
    updateOutboundProxy, testOutboundProxy, updateOutboundProxyEnabled,
    handlePasswordChange, updateFallbackStrategy, updateComboStrategy,
    updateStickyLimit, updateRequireLogin, updateObservabilityEnabled,
    handleExportDatabase, handleImportDatabase, runEffortTest,
  } = profile;

  const observabilityEnabled = settings.enableObservability === true;

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <nav className="hidden lg:flex flex-col gap-1 w-48 shrink-0 sticky top-0 self-start pt-2">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            onClick={() => scrollToSection(sec.id)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
              activeSection === sec.id
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">{sec.icon}</span>
            {sec.label}
          </button>
        ))}
        {/* App Info */}
        <div className="mt-auto pt-6 px-3 text-[11px] text-text-muted">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-0.5">Local Mode</p>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-6 pb-8 min-w-0">
        {/* Appearance */}
        <div id="section-appearance">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-pink-500/10 text-pink-500">
                <span className="material-symbols-outlined text-[20px]">palette</span>
              </div>
              <h3 className="text-lg font-semibold">Appearance</h3>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-text-muted">Choose your preferred color scheme</p>
                </div>
                <div className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5">
                  {["light", "dark", "system"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setTheme(option)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all",
                        theme === option
                          ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                          : "text-text-muted hover:text-text-main"
                      )}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                      </span>
                      <span className="capitalize text-sm">{option}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* System / Database */}
        <div id="section-system">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                  <span className="material-symbols-outlined text-[20px]">computer</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">System</h3>
                  <p className="text-sm text-text-muted">Running on your machine</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border">
                <div>
                  <p className="font-medium">Database Location</p>
                  <p className="text-sm text-text-muted font-mono">~/.es-gateway/db.json</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon="download" onClick={handleExportDatabase} loading={dbLoading}>
                  Download Backup
                </Button>
                <Button variant="outline" icon="upload" onClick={() => importFileRef.current?.click()} disabled={dbLoading}>
                  Import Backup
                </Button>
                <input ref={importFileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportDatabase} />
              </div>
              {dbStatus.message && (
                <p className={`text-sm ${dbStatus.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                  {dbStatus.message}
                </p>
              )}
              {/* Launch at login (Electron only) */}
              {isElectron && (
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div>
                    <p className="font-medium">Launch at login</p>
                    <p className="text-sm text-text-muted">Start automatically when you log in</p>
                  </div>
                  <Toggle checked={launchAtLogin} onChange={() => toggleLaunchAtLogin(!launchAtLogin)} />
                </div>
              )}
              {/* Auto-start proxy */}
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <div>
                  <p className="font-medium">Auto-start proxy</p>
                  <p className="text-sm text-text-muted">Start the proxy server when app launches</p>
                </div>
                <Toggle checked={settings.autoStartProxy === true} onChange={() => updateAutoStartProxy(!settings.autoStartProxy)} disabled={loading} />
              </div>
              {/* Proxy Port */}
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <div>
                  <p className="font-medium">Port</p>
                  <p className="text-sm text-text-muted">The port where the proxy server will listen</p>
                </div>
                <Input type="number" min="1" max="65535" value={settings.proxyPort || 8317} onChange={(e) => updateProxyPort(e.target.value)} disabled={loading} className="w-24 text-center" />
              </div>
            </div>
          </Card>
        </div>

        {/* AI Engine - Reasoning Effort */}
        <div id="section-ai-engine">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
                <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              </div>
              <h3 className="text-lg font-semibold">AI Engine</h3>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-medium">Reasoning Effort</p>
                <p className="text-sm text-text-muted mb-3">
                  Default reasoning effort for GPT/Codex models. Override per-request using model suffix like <code className="px-1 py-0.5 rounded bg-bg-subtle text-xs font-mono">gpt-5(high)</code>
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { value: "xhigh", label: "Extra High", desc: "~32,768 tokens", color: "#f637ec" },
                    { value: "high", label: "High", desc: "~16,384 tokens", color: "#6366f1" },
                    { value: "medium", label: "Medium", desc: "~8,192 tokens", color: "#22c55e" },
                    { value: "low", label: "Low", desc: "~4,096 tokens", color: "#f59e0b" },
                  ].map((opt) => {
                    const selected = (settings.defaultReasoningEffort || "high") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => updateReasoningEffort(opt.value)}
                        disabled={loading}
                        className={cn(
                          "flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-left",
                          selected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/30 hover:bg-bg-subtle"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selected ? opt.color : 'var(--color-border)' }} />
                          <div>
                            <span className={cn("font-medium text-sm", selected ? "text-text-main" : "text-text-muted")}>{opt.label}</span>
                            <span className="text-xs text-text-muted ml-2">{opt.desc}</span>
                          </div>
                        </div>
                        {selected && (<span className="text-xs font-medium text-primary">Active</span>)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-text-muted mt-2 italic">
                  Current: {settings.defaultReasoningEffort || "high"}
                </p>
              </div>

              {/* Test Panel */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">Test Effort</p>
                    <p className="text-sm text-text-muted">Simulate a request to see how each provider handles it</p>
                  </div>
                  <Button variant="secondary" icon="science" loading={effortTesting} onClick={runEffortTest}>
                    Run Test
                  </Button>
                </div>

                {effortTestResult && !effortTestResult.error && (
                  <div className="space-y-3">
                    {/* Test 1 Result */}
                    <div className="p-3 rounded-lg bg-bg border border-border">
                      <p className="text-xs font-semibold text-green-500 uppercase mb-2">Test 1: Request without explicit effort</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-text-muted">Default from settings:</div>
                        <div className="font-mono font-semibold">{effortTestResult.withoutEffort.input.defaultEffort || "none"}</div>
                        <div className="text-text-muted">Applied effort:</div>
                        <div className="font-mono font-semibold text-primary">{effortTestResult.withoutEffort.result.appliedEffort || "none"}</div>
                        <div className="text-text-muted">Source:</div>
                        <div className="font-mono">{effortTestResult.withoutEffort.result.source}</div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-xs font-semibold mb-1">Provider Mapping:</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-500/10 text-blue-400">
                            <span className="font-semibold">Gemini:</span> {effortTestResult.withoutEffort.providerMapping.gemini.label}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-orange-500/10 text-orange-400">
                            <span className="font-semibold">Codex:</span> {effortTestResult.withoutEffort.providerMapping.codex.label}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-400">
                            <span className="font-semibold">OpenAI:</span> {effortTestResult.withoutEffort.providerMapping.openai.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Test 2 Result */}
                    <div className="p-3 rounded-lg bg-bg border border-border">
                      <p className="text-xs font-semibold text-amber-500 uppercase mb-2">Test 2: Override with explicit effort=&quot;low&quot;</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-text-muted">Request effort:</div>
                        <div className="font-mono font-semibold">{effortTestResult.withExplicit.input.requestEffort}</div>
                        <div className="text-text-muted">Applied effort:</div>
                        <div className="font-mono font-semibold text-amber-400">{effortTestResult.withExplicit.result.appliedEffort}</div>
                        <div className="text-text-muted">Source:</div>
                        <div className="font-mono">{effortTestResult.withExplicit.result.source}</div>
                        <div className="text-text-muted">Override works?</div>
                        <div className={cn("font-semibold", effortTestResult.withExplicit.result.appliedEffort === "low" ? "text-green-500" : "text-red-500")}>
                          {effortTestResult.withExplicit.result.appliedEffort === "low" ? "YES" : "NO - BUG!"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {effortTestResult?.error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    Error: {effortTestResult.error}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Security */}
        <div id="section-security">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[20px]">shield</span>
              </div>
              <h3 className="text-lg font-semibold">Security</h3>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Require login</p>
                  <p className="text-sm text-text-muted">
                    When ON, dashboard requires password. When OFF, access without login.
                  </p>
                </div>
                <Toggle checked={settings.requireLogin === true} onChange={() => updateRequireLogin(!settings.requireLogin)} disabled={loading} />
              </div>
              {settings.requireLogin === true && (
                <form onSubmit={handlePasswordChange} className="flex flex-col gap-4 pt-4 border-t border-border/50">
                  {settings.hasPassword && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Current Password</label>
                      <Input type="password" placeholder="Enter current password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} required />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">New Password</label>
                      <Input type="password" placeholder="Enter new password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} required />
                      {passwords.new && (
                        <div className="flex flex-col gap-1">
                          <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-300" style={{ width: passwordStrength.width, backgroundColor: passwordStrength.color }} />
                          </div>
                          <span className="text-[11px] font-medium" style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Confirm New Password</label>
                      <Input type="password" placeholder="Confirm new password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} required />
                      {passwords.confirm && passwords.new !== passwords.confirm && (
                        <span className="text-[11px] text-red-500">Passwords do not match</span>
                      )}
                    </div>
                  </div>

                  {passStatus.message && (
                    <p className={`text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                      {passStatus.message}
                    </p>
                  )}

                  <div className="pt-2">
                    <Button type="submit" variant="primary" loading={passLoading}>
                      {settings.hasPassword ? "Update Password" : "Set Password"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </Card>
        </div>

        {/* Routing Preferences */}
        <div id="section-routing">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <span className="material-symbols-outlined text-[20px]">route</span>
              </div>
              <h3 className="text-lg font-semibold">Routing Strategy</h3>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Round Robin</p>
                  <p className="text-sm text-text-muted">Cycle through accounts to distribute load</p>
                </div>
                <Toggle
                  checked={settings.fallbackStrategy === "round-robin"}
                  onChange={() => updateFallbackStrategy(settings.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin")}
                  disabled={loading}
                />
              </div>

              {settings.fallbackStrategy === "round-robin" && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div>
                    <p className="font-medium">Sticky Limit</p>
                    <p className="text-sm text-text-muted">Calls per account before switching</p>
                  </div>
                  <Input type="number" min="1" max="10" value={settings.stickyRoundRobinLimit || 3} onChange={(e) => updateStickyLimit(e.target.value)} disabled={loading} className="w-20 text-center" />
                </div>
              )}

              {/* Combo Round Robin */}
              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div>
                  <p className="font-medium">Combo Round Robin</p>
                  <p className="text-sm text-text-muted">Cycle through providers in combos instead of always starting with first</p>
                </div>
                <Toggle
                  checked={settings.comboStrategy === "round-robin"}
                  onChange={() => updateComboStrategy(settings.comboStrategy === "round-robin" ? "fallback" : "round-robin")}
                  disabled={loading}
                />
              </div>

              <p className="text-xs text-text-muted italic pt-2 border-t border-border/50">
                {settings.fallbackStrategy === "round-robin"
                  ? `Currently distributing requests across all available accounts with ${settings.stickyRoundRobinLimit || 3} calls per account.`
                  : "Currently using accounts in priority order (Fill First)."}
              </p>
            </div>
          </Card>
        </div>

        {/* Network */}
        <div id="section-network">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                <span className="material-symbols-outlined text-[20px]">wifi</span>
              </div>
              <h3 className="text-lg font-semibold">Network</h3>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Outbound Proxy</p>
                  <p className="text-sm text-text-muted">Enable proxy for OAuth + provider outbound requests.</p>
                </div>
                <Toggle
                  checked={settings.outboundProxyEnabled === true}
                  onChange={() => updateOutboundProxyEnabled(!(settings.outboundProxyEnabled === true))}
                  disabled={loading || proxyLoading}
                />
              </div>

              {settings.outboundProxyEnabled === true && (
                <form onSubmit={updateOutboundProxy} className="flex flex-col gap-4 pt-2 border-t border-border/50">
                  <div className="flex flex-col gap-2">
                    <label className="font-medium">Proxy URL</label>
                    <Input
                      placeholder="http://127.0.0.1:7897"
                      value={proxyForm.outboundProxyUrl}
                      onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundProxyUrl: e.target.value }))}
                      disabled={loading || proxyLoading}
                    />
                    <p className="text-sm text-text-muted">Leave empty to inherit existing env proxy (if any).</p>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                    <label className="font-medium">No Proxy</label>
                    <Input
                      placeholder="localhost,127.0.0.1"
                      value={proxyForm.outboundNoProxy}
                      onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundNoProxy: e.target.value }))}
                      disabled={loading || proxyLoading}
                    />
                    <p className="text-sm text-text-muted">Comma-separated hostnames/domains to bypass the proxy.</p>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                    <Button type="button" variant="secondary" loading={proxyTestLoading} disabled={loading || proxyLoading} onClick={testOutboundProxy}>
                      Test proxy URL
                    </Button>
                    <Button type="submit" variant="primary" loading={proxyLoading}>
                      Apply
                    </Button>
                  </div>
                </form>
              )}

              {proxyStatus.message && (
                <p className={`text-sm ${proxyStatus.type === "error" ? "text-red-500" : "text-green-500"} pt-2 border-t border-border/50`}>
                  {proxyStatus.message}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Observability Settings */}
        <div id="section-observability">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                <span className="material-symbols-outlined text-[20px]">monitoring</span>
              </div>
              <h3 className="text-lg font-semibold">Observability</h3>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Observability</p>
                <p className="text-sm text-text-muted">
                  Record request details for inspection in the logs view
                </p>
              </div>
              <Toggle checked={observabilityEnabled} onChange={updateObservabilityEnabled} disabled={loading} />
            </div>
          </Card>
        </div>

        {/* App Info (mobile only, desktop shows in sidebar) */}
        <div className="lg:hidden text-center text-sm text-text-muted py-4">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-1">Local Mode - All data stored on your machine</p>
        </div>
      </div>
    </div>
  );
}
