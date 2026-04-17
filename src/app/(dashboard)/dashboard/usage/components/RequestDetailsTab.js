"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Drawer from "@/shared/components/Drawer";
import Pagination from "@/shared/components/Pagination";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { cn } from "@/shared/utils/cn";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";

let providerNameCache = null;
let providerNodesCache = null;

async function fetchProviderNames() {
  if (providerNameCache && providerNodesCache) {
    return { providerNameCache, providerNodesCache };
  }

  const nodesRes = await fetch("/api/provider-nodes");
  const nodesData = await nodesRes.json();
  const nodes = nodesData.nodes || [];
  providerNodesCache = {};

  for (const node of nodes) {
    providerNodesCache[node.id] = node.name;
  }

  providerNameCache = {
    ...AI_PROVIDERS,
    ...providerNodesCache
  };

  return { providerNameCache, providerNodesCache };
}

function getProviderName(providerId, cache) {
  if (!providerId) return providerId;
  if (!cache) return providerId;

  const cached = cache[providerId];

  if (typeof cached === 'string') {
    return cached;
  }

  if (cached?.name) {
    return cached.name;
  }

  const providerConfig = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
  return providerConfig?.name || providerId;
}

function CollapsibleSection({ title, children, defaultOpen = false, icon = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-black/5 dark:border-white/5 rounded-lg overflow-hidden">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="material-symbols-outlined text-[18px] text-text-muted">{icon}</span>}
          <span className="font-semibold text-sm text-text-main">{title}</span>
        </div>
        <span className={cn(
          "material-symbols-outlined text-[20px] text-text-muted transition-transform duration-200",
          isOpen ? "rotate-90" : ""
        )}>
          chevron_right
        </span>
      </button>
      
      {isOpen && (
        <div className="p-4 border-t border-black/5 dark:border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function RequestDetailsTab() {
  const [details, setDetails] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0
  });
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [providerNameCache, setProviderNameCache] = useState(null);
  const [filters, setFilters] = useState({
    provider: "",
    startDate: "",
    endDate: ""
  });

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/providers");
      const data = await res.json();
      setProviders(data.providers || []);

      const cache = await fetchProviderNames();
      setProviderNameCache(cache.providerNameCache);
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    }
  }, []);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString()
      });
      if (filters.provider) params.append("provider", filters.provider);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

      const res = await fetch(`/api/usage/request-details?${params}`);
      const data = await res.json();

      setDetails(data.details || []);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (error) {
      console.error("Failed to fetch request details:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filters]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleViewDetail = (detail) => {
    setSelectedDetail(detail);
    setIsDrawerOpen(true);
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize) => {
    setPagination(prev => ({ ...prev, pageSize: newPageSize, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({ provider: "", startDate: "", endDate: "" });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Glassmorphic Filters */}
      <Card padding="md" className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 backdrop-blur-md relative overflow-hidden">
        {/* Subtle glowing effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10 pointer-events-none" />
        
        <div className="flex flex-wrap items-end gap-5 relative z-10">
          <div className="flex flex-col gap-2">
            <label htmlFor="provider-filter" className="text-sm font-medium text-text-main">Provider</label>
            <select
              id="provider-filter"
              value={filters.provider}
              onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
              className={cn(
                "h-9 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-sm",
                "text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all",
                "cursor-pointer min-w-[180px] shadow-sm hover:border-black/20 dark:hover:border-white/20"
              )}
            >
              <option value="">All Providers</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex flex-col gap-2">
            <label htmlFor="start-date-filter" className="text-sm font-medium text-text-main">Start Date</label>
            <input
              id="start-date-filter"
              type="datetime-local"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className={cn(
                "h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-sm",
                "text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all shadow-sm hover:border-black/20 dark:hover:border-white/20"
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="end-date-filter" className="text-sm font-medium text-text-main">End Date</label>
            <input
              id="end-date-filter"
              type="datetime-local"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className={cn(
                "h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-sm",
                "text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all shadow-sm hover:border-black/20 dark:hover:border-white/20"
              )}
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-main opacity-0" aria-hidden="true">Clear</span>
            <Button 
              variant="ghost" 
              onClick={handleClearFilters}
              disabled={!filters.provider && !filters.startDate && !filters.endDate}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5">
                <th className="text-left p-4 text-sm font-semibold text-text-main">Timestamp</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Model</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Provider</th>
                <th className="text-right p-4 text-sm font-semibold text-text-main">Input Tokens</th>
                <th className="text-right p-4 text-sm font-semibold text-text-main">Output Tokens</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Latency</th>
                <th className="text-center p-4 text-sm font-semibold text-text-main">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : details.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">
                    No request details found
                  </td>
                </tr>
              ) : (
                details.map((detail, index) => (
                  <tr
                    key={`${detail.id}-${index}`}
                    className="border-b border-black/5 dark:border-white/5 last:border-b-0 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                    onClick={() => handleViewDetail(detail)}
                  >
                    <td className="p-4 text-sm text-text-main">
                      <div className="flex items-center gap-1.5 opacity-80">
                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                        {new Date(detail.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-text-main font-mono">
                      <div className="inline-flex items-center px-2 py-1 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 text-xs">
                        {detail.model}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-text-main">
                       <div className="flex items-center gap-2">
                         <ProviderIcon providerId={detail.provider} className="w-5 h-5 rounded-sm object-contain" />
                         <span className="font-semibold tracking-wide text-xs">
                           {getProviderName(detail.provider, providerNameCache)}
                         </span>
                       </div>
                     </td>
                    <td className="p-4 text-sm text-right font-mono text-cyan-600 dark:text-cyan-400">
                      {detail.tokens?.prompt_tokens?.toLocaleString() || 0}
                    </td>
                    <td className="p-4 text-sm text-right font-mono text-purple-600 dark:text-purple-400">
                      {detail.tokens?.completion_tokens?.toLocaleString() || 0}
                    </td>
                    <td className="p-4 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-0.5 w-[70px]">
                          <span className="text-[10px] uppercase text-text-muted">TTFT</span>
                          <span className={cn(
                            "font-mono font-medium rounded px-1.5 py-0.5 text-xs max-w-min",
                            (detail.latency?.ttft || 0) < 1000 ? "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30" :
                            (detail.latency?.ttft || 0) < 3000 ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30" :
                            "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30"
                          )}>
                            {detail.latency?.ttft || 0}ms
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 w-[70px]">
                          <span className="text-[10px] uppercase text-text-muted">Total</span>
                          <span className={cn(
                            "font-mono font-medium rounded px-1.5 py-0.5 text-xs inline-block max-w-[80px]",
                            (detail.latency?.total || 0) < 2000 ? "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30" :
                            (detail.latency?.total || 0) < 5000 ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30" :
                            "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30"
                          )}>
                            {detail.latency?.total || 0}ms
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 hover:text-primary transition-all mx-auto group-hover:scale-110"
                        title="View Details"
                      >
                        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && details.length > 0 && (
          <div className="border-t border-black/5 dark:border-white/5">
            <Pagination
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        )}
      </Card>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Request Details"
        width="lg"
      >
        {selectedDetail && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Core Info */}
              <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-3">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5 mb-2"><span className="material-symbols-outlined text-[16px]">info</span> Metadata</h3>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">ID:</span>
                  <span className="text-text-main font-mono text-xs">{selectedDetail.id}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Timestamp:</span>
                  <span className="text-text-main">{new Date(selectedDetail.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-text-muted">Provider:</span>
                   <div className="flex items-center gap-2">
                     <ProviderIcon providerId={selectedDetail.provider} className="w-5 h-5 rounded-sm object-contain" />
                     <span className="text-text-main font-semibold text-xs tracking-wider border border-black/10 dark:border-white/10 px-2 shadow-sm py-0.5 bg-surface rounded-md">{getProviderName(selectedDetail.provider, providerNameCache)}</span>
                   </div>
                 </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Model:</span>
                  <span className="text-primary font-mono text-xs font-semibold px-2 py-0.5 bg-primary/10 rounded-md border border-primary/20">{selectedDetail.model}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Status:</span>
                  <span className={cn(
                    "font-medium text-xs px-2 py-0.5 rounded-md border border-current shadow-sm",
                    selectedDetail.status === "success" ? "text-green-600 bg-green-500/10 dark:text-green-400" : "text-red-600 bg-red-500/10 dark:text-red-400"
                  )}>
                    {selectedDetail.status}
                  </span>
                </div>
              </div>
              
              {/* Box 2: Metrics */}
              <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-3 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 blur-[40px] pointer-events-none rounded-full" />
                <h3 className="text-xs uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5 mb-2"><span className="material-symbols-outlined text-[16px]">speed</span> Analytics</h3>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">timer</span> Latency:</span>
                  <div className="flex gap-2">
                    <span className="text-xs bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono border border-black/10 dark:border-white/10">TTFT <span className={cn((selectedDetail.latency?.ttft || 0) > 2000 ? "text-red-500" : (selectedDetail.latency?.ttft || 0) > 1000 ? "text-amber-500" : "text-green-500")}>{selectedDetail.latency?.ttft || 0}ms</span></span>
                    <span className="text-xs bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono border border-black/10 dark:border-white/10">Total <span className={cn((selectedDetail.latency?.total || 0) > 4000 ? "text-red-500" : (selectedDetail.latency?.total || 0) > 2000 ? "text-amber-500" : "text-green-500")}>{selectedDetail.latency?.total || 0}ms</span></span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2 w-full pt-2">
                  <div className="bg-surface border border-black/5 dark:border-white/5 rounded-lg p-3 text-center shadow-sm">
                    <span className="text-[10px] uppercase text-text-muted block mb-1">Input Tokens</span>
                    <span className="text-lg font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                      {selectedDetail.tokens?.prompt_tokens?.toLocaleString() || 0}
                    </span>
                  </div>
                  <div className="bg-surface border border-black/5 dark:border-white/5 rounded-lg p-3 text-center shadow-sm">
                    <span className="text-[10px] uppercase text-text-muted block mb-1">Output Tokens</span>
                    <span className="text-lg font-mono font-semibold text-purple-600 dark:text-purple-400">
                      {selectedDetail.tokens?.completion_tokens?.toLocaleString() || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <CollapsibleSection title="1. Client Request (Input)" defaultOpen={true} icon="input">
                <pre className="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-black/5 dark:border-white/5">
                  {JSON.stringify(selectedDetail.request, null, 2)}
                </pre>
              </CollapsibleSection>

              {selectedDetail.providerRequest && (
                <CollapsibleSection title="2. Provider Request (Translated)" icon="translate">
                  <pre className="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-black/5 dark:border-white/5">
                    {JSON.stringify(selectedDetail.providerRequest, null, 2)}
                  </pre>
                </CollapsibleSection>
              )}

              {selectedDetail.providerResponse && (
                <CollapsibleSection title="3. Provider Response (Raw)" icon="data_object">
                  <pre className="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-black/5 dark:border-white/5">
                    {typeof selectedDetail.providerResponse === 'object'
                      ? JSON.stringify(selectedDetail.providerResponse, null, 2)
                      : selectedDetail.providerResponse
                    }
                  </pre>
                </CollapsibleSection>
              )}
              
              <CollapsibleSection title="4. Client Response (Final)" defaultOpen={true} icon="output">
                {selectedDetail.response?.thinking && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-text-main mb-2 flex items-center gap-2 text-xs uppercase tracking-wide opacity-70">
                      <span className="material-symbols-outlined text-[16px]">psychology</span>
                      Thinking Process
                    </h4>
                    <pre className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-lg overflow-auto max-h-[200px] text-xs font-mono text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800">
                      {selectedDetail.response.thinking}
                    </pre>
                  </div>
                )}
                
                <h4 className="font-semibold text-text-main mb-2 text-xs uppercase tracking-wide opacity-70">
                  Content
                </h4>
                <pre className="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-black/5 dark:border-white/5">
                  {selectedDetail.response?.content || "[No content]"}
                </pre>
              </CollapsibleSection>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
