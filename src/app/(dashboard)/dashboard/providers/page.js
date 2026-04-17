"use client";

import { useState, useEffect } from "react";
import {
  CardSkeleton,
  Button,
  Input,
  Toggle,
} from "@/shared/components";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
} from "@/shared/constants/providers";
import { useNotificationStore } from "@/store/notificationStore";
import { getProviderStats } from "./providerUtils";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import ProviderCard from "./components/ProviderCard";
import ApiKeyProviderCard from "./components/ApiKeyProviderCard";
import AddOpenAICompatibleModal from "./components/AddOpenAICompatibleModal";
import AddAnthropicCompatibleModal from "./components/AddAnthropicCompatibleModal";
import ProviderTestResultsView from "./components/ProviderTestResultsView";

export default function ProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCompatibleModal, setShowAddCompatibleModal] = useState(false);
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState(false);
  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [activeTab, setActiveTab] = useState("oauth");
  const [searchQuery, setSearchQuery] = useState("");
  const notify = useNotificationStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [connectionsRes, nodesRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/provider-nodes"),
        ]);
        const connectionsData = await connectionsRes.json();
        const nodesData = await nodesRes.json();
        if (connectionsRes.ok)
          setConnections(connectionsData.connections || []);
        if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
      } catch (error) {
        console.log("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Toggle all connections for a provider on/off
  const handleToggleProvider = async (providerId, authType, newActive) => {
    const providerConns = connections.filter(
      (c) => c.provider === providerId && c.authType === authType,
    );
    setConnections((prev) =>
      prev.map((c) =>
        c.provider === providerId && c.authType === authType
          ? { ...c, isActive: newActive }
          : c,
      ),
    );
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        }),
      ),
    );
  };

  const handleBatchTest = async (mode, providerId = null) => {
    if (testingMode) return;
    setTestingMode(mode === "provider" ? providerId : mode);
    setTestResults(null);
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, providerId }),
      });
      const data = await res.json();
      setTestResults(data);
      if (data.summary) {
        const { passed, failed, total } = data.summary;
        if (failed === 0) notify.success(`All ${total} tests passed`);
        else notify.warning(`${passed}/${total} passed, ${failed} failed`);
      }
    } catch (error) {
      setTestResults({ error: "Test request failed" });
      notify.error("Provider test failed");
    } finally {
      setTestingMode(null);
    }
  };

  const filterProviders = (entries) => {
    if (!searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter(([key, info]) => 
      info.name.toLowerCase().includes(query) || key.toLowerCase().includes(query)
    );
  };

  const oauthList = filterProviders(Object.entries(OAUTH_PROVIDERS));
  const freeList = filterProviders(Object.entries(FREE_PROVIDERS));
  const freeTierList = filterProviders(Object.entries(FREE_TIER_PROVIDERS));
  const apikeyList = filterProviders(Object.entries(APIKEY_PROVIDERS));

  const compatibleProviders = providerNodes
    .filter((node) => node.type === "openai-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "OpenAI Compatible",
      color: "#10A37F",
      textIcon: "OC",
      apiType: node.apiType,
    }))
    .filter(info => !searchQuery.trim() || info.name.toLowerCase().includes(searchQuery.toLowerCase()) || info.id.toLowerCase().includes(searchQuery.toLowerCase()));

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Anthropic Compatible",
      color: "#D97757",
      textIcon: "AC",
    }))
    .filter(info => !searchQuery.trim() || info.name.toLowerCase().includes(searchQuery.toLowerCase()) || info.id.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-3 rounded-xl border border-border">
        {/* Tabs */}
        <div className="flex gap-2 p-1.5 bg-black/5 dark:bg-white/5 rounded-lg overflow-x-auto w-full sm:w-auto custom-scrollbar">
            {[{ id: 'oauth', label: 'OAuth', count: Object.keys(OAUTH_PROVIDERS).length },
              { id: 'free', label: 'Free', count: Object.keys(FREE_PROVIDERS).length + Object.keys(FREE_TIER_PROVIDERS).length },
              { id: 'apikey', label: 'API Key', count: Object.keys(APIKEY_PROVIDERS).length },
              { id: 'compatible', label: 'Compatible', count: providerNodes.length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearchQuery(""); }}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id && !searchQuery
                    ? "bg-surface shadow-sm text-[#f637ec] ring-1 ring-[#f637ec]/20"
                    : "text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id && !searchQuery ? "bg-[#f637ec]/10" : "bg-black/5 dark:bg-white/10"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
        </div>
        
        {/* Search */}
        <div className="w-full sm:w-64 relative">
           <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
           <Input 
             placeholder="Search providers..." 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="!py-2 !pl-9 !text-sm w-full"
           />
        </div>
      </div>

      {searchQuery && oauthList.length === 0 && freeList.length === 0 && freeTierList.length === 0 && apikeyList.length === 0 && compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <span className="material-symbols-outlined text-[48px] text-border mb-4">search_off</span>
          <h3 className="text-lg font-medium text-text-main">No providers found</h3>
          <p className="text-sm text-text-muted mt-1">Try adjusting your search query</p>
        </div>
      )}

      {/* OAuth Providers */}
      {((!searchQuery && activeTab === 'oauth') || (searchQuery && oauthList.length > 0)) && (
      <div className="flex flex-col gap-4 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            OAuth
          </h2>
          <div className="flex items-center gap-2">
            <ModelAvailabilityBadge />
            <button
              onClick={() => handleBatchTest("oauth")}
              disabled={!!testingMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                testingMode === "oauth"
                  ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
                  : "bg-bg border-border text-text-muted hover:text-text-main hover:border-primary/40"
              }`}
            >
              <span className={`material-symbols-outlined text-[14px]${testingMode === "oauth" ? " animate-spin" : ""}`}>
                {testingMode === "oauth" ? "sync" : "play_arrow"}
              </span>
              {testingMode === "oauth" ? "Testing..." : "Test All"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {oauthList.map(([key, info]) => (
            <ProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(connections, key, "oauth")}
              authType="oauth"
              onToggle={(active) => handleToggleProvider(key, "oauth", active)}
            />
          ))}
        </div>
      </div>
      )}

      {/* Free & Free Tier Providers */}
      {((!searchQuery && activeTab === 'free') || (searchQuery && (freeList.length > 0 || freeTierList.length > 0))) && (
      <div className="flex flex-col gap-4 animate-fade-in-up" style={{animationDelay: '0.05s'}}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Free
          </h2>
          <button
            onClick={() => handleBatchTest("free")}
            disabled={!!testingMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              testingMode === "free"
                ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
                : "bg-bg border-border text-text-muted hover:text-text-main hover:border-primary/40"
            }`}
          >
            <span className={`material-symbols-outlined text-[14px]${testingMode === "free" ? " animate-spin" : ""}`}>
              {testingMode === "free" ? "sync" : "play_arrow"}
            </span>
            {testingMode === "free" ? "Testing..." : "Test All"}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {freeList.map(([key, info]) => (
            <ProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(connections, key, "oauth")}
              authType="free"
              onToggle={(active) => handleToggleProvider(key, "oauth", active)}
            />
          ))}
          {freeTierList.map(([key, info]) => (
            <ApiKeyProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(connections, key, "apikey")}
              authType="apikey"
              onToggle={(active) => handleToggleProvider(key, "apikey", active)}
            />
          ))}
        </div>
      </div>
      )}

      {/* API Key Providers */}
      {((!searchQuery && activeTab === 'apikey') || (searchQuery && apikeyList.length > 0)) && (
      <div className="flex flex-col gap-4 animate-fade-in-up" style={{animationDelay: '0.1s'}}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            API Key
          </h2>
          <button
            onClick={() => handleBatchTest("apikey")}
            disabled={!!testingMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              testingMode === "apikey"
                ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
                : "bg-bg border-border text-text-muted hover:text-text-main hover:border-primary/40"
            }`}
          >
            <span className={`material-symbols-outlined text-[14px]${testingMode === "apikey" ? " animate-spin" : ""}`}>
              {testingMode === "apikey" ? "sync" : "play_arrow"}
            </span>
            {testingMode === "apikey" ? "Testing..." : "Test All"}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {apikeyList.map(([key, info]) => (
            <ApiKeyProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(connections, key, "apikey")}
              authType="apikey"
              onToggle={(active) => handleToggleProvider(key, "apikey", active)}
            />
          ))}
        </div>
      </div>
      )}

      {/* API Key Compatible Providers */}
      {((!searchQuery && activeTab === 'compatible') || (searchQuery && (compatibleProviders.length > 0 || anthropicCompatibleProviders.length > 0))) && (
      <div className="flex flex-col gap-4 animate-fade-in-up" style={{animationDelay: '0.15s'}}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            API Key Compatible
          </h2>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              size="sm"
              icon="add"
              onClick={() => setShowAddAnthropicCompatibleModal(true)}
            >
              Add Anthropic Compatible
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon="add"
              onClick={() => setShowAddCompatibleModal(true)}
              className="!bg-white !text-black hover:!bg-gray-100"
            >
              Add OpenAI Compatible
            </Button>
          </div>
        </div>
        {!searchQuery && compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <span className="material-symbols-outlined text-[32px] text-text-muted mb-2">
              extension
            </span>
            <p className="text-text-muted text-sm">
              No compatible providers added yet
            </p>
            <p className="text-text-muted text-xs mt-1">
              Use the buttons above to add OpenAI or Anthropic compatible
              endpoints
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...compatibleProviders, ...anthropicCompatibleProviders].map(
              (info) => (
                <ApiKeyProviderCard
                  key={info.id}
                  providerId={info.id}
                  provider={info}
                  stats={getProviderStats(connections, info.id, "apikey")}
                  authType="compatible"
                  onToggle={(active) =>
                    handleToggleProvider(info.id, "apikey", active)
                  }
                />
              ),
            )}
          </div>
        )}
      </div>
      )}

      <AddOpenAICompatibleModal
        isOpen={showAddCompatibleModal}
        onClose={() => setShowAddCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddCompatibleModal(false);
        }}
      />
      <AddAnthropicCompatibleModal
        isOpen={showAddAnthropicCompatibleModal}
        onClose={() => setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddAnthropicCompatibleModal(false);
        }}
      />

      {/* Test Results Modal */}
      {testResults && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
          onClick={() => setTestResults(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-surface border border-border rounded-xl w-full max-w-[600px] max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-border bg-surface/95 backdrop-blur-sm rounded-t-xl">
              <h3 className="font-semibold">Test Results</h3>
              <button
                onClick={() => setTestResults(null)}
                className="p-1 rounded-lg hover:bg-bg text-text-muted hover:text-text-main transition-colors"
                aria-label="Close test results"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-5">
              <ProviderTestResultsView results={testResults} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
