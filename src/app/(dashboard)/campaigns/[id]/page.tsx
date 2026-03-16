"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActors } from "@/hooks/use-actors";
import { toast } from "sonner";
import { Play, Pause, ArrowLeft, AlertCircle, ExternalLink, Loader2, CheckCircle2, XCircle, Clock, Trash2, Settings, ChevronsRight, Info, Zap, Power, BarChart3, ToggleLeft, Type, Tag, RotateCw, SlidersHorizontal, Plus, X, Hash, Link2, ToggleRight, ChevronDown, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScoreBadgeCompact } from "@/components/score-badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLeadEvents } from "@/hooks/use-lead-events";
import { getLeadDisplayName } from "@/lib/utils/lead-display";
import { SortableList } from "@/components/sortable-list";
import type { LeadFieldDefinition, KpiDefinition } from "@/lib/db/schema";

interface CampaignDetail {
  id: number;
  name: string;
  targetNiche: string;
  status: string;
  aiProvider: string;
  apifyActors: string[];
  actorConfigs: Record<string, Record<string, unknown>>;
  scheduleFrequency: string;
  autoEnrich: boolean;
  lastDiscoveryAt: string | null;
  searchParams: Record<string, unknown>;
  kpiDefinitions?: Array<{ id: string; label: string; type: "boolean" | "text"; description?: string }>;
  leadFieldDefinitions?: LeadFieldDefinition[];
  leads: Array<{
    id: number;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    score: number;
    status: string;
    source: string;
    rawData?: Record<string, unknown> | null;
    mappedData?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  }>;
  runs: Array<{
    id: number;
    actorId: string;
    status: string;
    resultCount: number;
    costUsd: number | null;
    startedAt: string;
  }>;
  stats: {
    totalLeads: number;
    qualifiedLeads: number;
    convertedLeads: number;
    enrichedLeads: number;
    avgScore: number;
    apifyCost: number;
    llmCost: number;
    totalCost: number;
    avgCostPerLead: number;
    avgDiscoveryCost: number;
    avgEnrichmentCost: number;
  };
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { allActors, getActorById, getActorsByPhase } = useActors();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [discoveryError, setDiscoveryError] = useState<{ message: string; actionUrl?: string; actionLabel?: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningActor, setRunningActor] = useState<string | null>(null);
  const [enrichingNow, setEnrichingNow] = useState(false);
  const [enrichAbort, setEnrichAbort] = useState<AbortController | null>(null);
  const [lastActorResult, setLastActorResult] = useState<{ actorId: string; inserted: number; total: number } | null>(null);
  const [disabledEnrichActors, setDisabledEnrichActors] = useState<Set<string>>(new Set());
  const [discoveryProgress, setDiscoveryProgress] = useState<{ index: number; total: number } | null>(null);
  const [extraColumns, setExtraColumns] = useState<Set<string>>(new Set());
  const [reEnrichingLeads, setReEnrichingLeads] = useState<Set<number>>(new Set());
  const [editSettings, setEditSettings] = useState<{
    targetNiche: string;
    aiProvider: string;
    scheduleFrequency: string;
    autoEnrich: boolean;
    enrichmentConcurrency: number | "";
    actorConfigs: Record<string, Record<string, string>>;
    actorOrder: string[];
  } | null>(null);
  const [globalEnrichConcurrency, setGlobalEnrichConcurrency] = useState<number>(1);
  const [editLeadFields, setEditLeadFields] = useState<LeadFieldDefinition[]>([]);
  const [editKpis, setEditKpis] = useState<KpiDefinition[]>([]);
  const [collapsedActors, setCollapsedActors] = useState<Set<string>>(new Set());
  const [addActorOpen, setAddActorOpen] = useState(false);

  const openSettings = () => {
    if (!campaign) return;
    const configs: Record<string, Record<string, string>> = {};
    for (const actorId of campaign.apifyActors || []) {
      const actorConfig = campaign.actorConfigs?.[actorId] || {};
      configs[actorId] = {};
      for (const [key, value] of Object.entries(actorConfig)) {
        configs[actorId][key] = Array.isArray(value) ? value.join(", ") : String(value);
      }
    }
    setEditSettings({
      targetNiche: campaign.targetNiche,
      aiProvider: campaign.aiProvider,
      scheduleFrequency: campaign.scheduleFrequency,
      autoEnrich: campaign.autoEnrich ?? true,
      enrichmentConcurrency: ((campaign as unknown as Record<string, unknown>).enrichmentConcurrency as number) || "",
      actorConfigs: configs,
      actorOrder: [...(campaign.apifyActors || [])],
    });
    setEditLeadFields(campaign.leadFieldDefinitions ? campaign.leadFieldDefinitions.map((f) => ({ ...f })) : []);
    setEditKpis(campaign.kpiDefinitions ? campaign.kpiDefinitions.map((k) => ({ ...k })) : []);
    setCollapsedActors(new Set(campaign.apifyActors || []));
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (!editSettings || !campaign) return;
    setSavingSettings(true);
    try {
      const actorConfigs: Record<string, Record<string, unknown>> = {};
      for (const actorId of editSettings.actorOrder || []) {
        const actorDef = getActorById(actorId);
        if (!actorDef) continue;
        const input: Record<string, unknown> = { ...(actorDef.defaultInput || {}) };
        const edited = editSettings.actorConfigs[actorId] || {};
        for (const [fieldName, rawValue] of Object.entries(edited)) {
          const desc = actorDef.inputFieldDescriptions?.[fieldName];
          if (!rawValue.trim()) continue;
          if (desc?.type === "string-array") {
            input[fieldName] = rawValue.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
          } else if (desc?.type === "number") {
            input[fieldName] = Number(rawValue) || 0;
          } else {
            input[fieldName] = rawValue;
          }
        }
        actorConfigs[actorId] = input;
      }

      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetNiche: editSettings.targetNiche,
          aiProvider: editSettings.aiProvider,
          scheduleFrequency: editSettings.scheduleFrequency,
          autoEnrich: editSettings.autoEnrich,
          enrichmentConcurrency: editSettings.enrichmentConcurrency === "" ? 0 : editSettings.enrichmentConcurrency,
          actorConfigs,
          apifyActors: editSettings.actorOrder,
          leadFieldDefinitions: editLeadFields.filter((f) => f.label.trim()),
          kpiDefinitions: editKpis.filter((k) => k.label.trim()),
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      if (!editSettings.autoEnrich && enrichAbort) {
        enrichAbort.abort();
        setEnrichAbort(null);
        setEnrichingNow(false);
        await fetch(`/api/campaigns/${campaign.id}/enrich`, { method: "DELETE" }).catch(() => {});
        load();
      }
      toast.success("Campaign settings saved");
      setSettingsOpen(false);
      load();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNow = useCallback(() => {
    fetch(`/api/campaigns/${params.id}`).then((r) => r.json()).then(setCampaign);
  }, [params.id]);

  const load = useCallback(() => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(loadNow, 300);
  }, [loadNow]);

  useEffect(() => { loadNow(); }, [params.id]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((data: { key: string; value: string }[]) => {
      const ec = data.find((s) => s.key === "enrichment_concurrency");
      if (ec?.value) setGlobalEnrichConcurrency(parseInt(ec.value) || 1);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (campaign) {
      const disabled = (campaign.actorConfigs as Record<string, unknown>)?._disabledEnrichActors;
      if (Array.isArray(disabled)) {
        setDisabledEnrichActors(new Set(disabled as string[]));
      }
    }
  }, [campaign?.id]);

  useLeadEvents(
    {
      onLeadDiscovered: (data) => {
        setDiscoveryProgress({ index: data.index, total: data.totalItems });
        setCampaign((prev) => {
          if (!prev || data.campaignId !== prev.id) return prev;
          const alreadyExists = prev.leads.some((l) => l.id === data.leadId);
          if (alreadyExists) return prev;
          const newLead = {
            id: data.leadId,
            displayName: data.displayName,
            email: data.email,
            phone: data.phone,
            score: 0,
            status: data.status,
            source: data.source,
            rawData: data.rawData,
            mappedData: data.mappedData,
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          };
          return {
            ...prev,
            leads: [...prev.leads, newLead],
            stats: { ...prev.stats, totalLeads: prev.stats.totalLeads + 1 },
          };
        });
      },
      onKpiUpdated: () => load(),
      onEnrichmentCompleted: (data) => {
        setReEnrichingLeads((prev) => {
          const next = new Set(prev);
          next.delete(data.leadId);
          return next;
        });
        load();
      },
      onStatusChanged: () => load(),
      onDiscoveryStarted: (data) => {
        if (data.actorIds.length > 0) setRunningActor(data.actorIds[0]);
        setDiscoveryProgress(null);
      },
      onDiscoveryCompleted: () => {
        setRunningActor(null);
        setDiscoveryProgress(null);
        load();
      },
      onEnrichmentProgress: () => load(),
    },
    { campaignId: campaign?.id }
  );

  if (!campaign) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  const hasUnenrichedLeads = campaign.leads.some(
    (l) => l.status === "new" || l.status === "enriching"
  );
  const unenrichedCount = campaign.leads.filter(
    (l) => l.status === "new" || l.status === "enriching"
  ).length;

  const serverIsEnriching = campaign.leads.some((l) => l.status === "enriching");
  const isEnrichmentActive = enrichingNow || serverIsEnriching || reEnrichingLeads.size > 0;

  const triggerEnrichment = async () => {
    setEnrichingNow(true);
    const abort = new AbortController();
    setEnrichAbort(abort);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: true, enrichAll: true }),
        signal: abort.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Enrichment failed");
        return;
      }
      if (data.enriched > 0) {
        toast.success(`Enriched ${data.enriched} leads`);
      } else if (data.skipped > 0) {
        toast.info(`${data.skipped} leads could not be enriched (missing data)`);
      } else {
        toast.info("All leads have been enriched");
      }
      load();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(String(err));
    } finally {
      setEnrichingNow(false);
      setEnrichAbort(null);
    }
  };

  const handleRunActor = async (actorId: string) => {
    if (!campaign) return;
    setRunningActor(actorId);
    setDiscoveryError(null);
    try {
      const actorConfig = campaign.actorConfigs?.[actorId] || {};
      const res = await fetch("/api/apify/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, input: actorConfig, campaignId: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiscoveryError({ message: data.error || "Actor run failed", actionUrl: data.actionUrl, actionLabel: data.actionLabel });
        return;
      }
      setLastActorResult({ actorId, inserted: data.inserted ?? 0, total: data.totalResults ?? 0 });
      setTimeout(() => setLastActorResult(null), 10_000);
      if (data.inserted > 0) {
        toast.success(`${data.inserted} new leads from ${getActorById(actorId)?.name || actorId}`);
      } else {
        toast.info("Actor completed — no new leads found");
      }
      load();
      if (data.inserted > 0 && campaign.autoEnrich && !enrichingNow) {
        triggerEnrichment();
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setRunningActor(null);
      setDiscoveryProgress(null);
    }
  };

  const handleSkipEnrichment = async (leadId: number) => {
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "qualified", score: 0 }),
      });
      toast.success("Enrichment skipped — lead marked as qualified");
      load();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleReEnrich = (leadId: number) => {
    setReEnrichingLeads((prev) => new Set(prev).add(leadId));
    setCampaign((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        leads: prev.leads.map((l) =>
          l.id === leadId ? { ...l, status: "enriching" } : l
        ),
      };
    });

    fetch(`/api/leads/${leadId}/enrich`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("Re-enrichment failed");
        toast.success("Lead re-enriched");
      })
      .catch((err) => toast.error(String(err)))
      .finally(() => {
        setReEnrichingLeads((prev) => {
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
        load();
      });
  };

  const addEditLeadField = () => {
    setEditLeadFields((prev) => [...prev, { id: `field_${Date.now()}`, label: "", type: "text" }]);
  };
  const removeEditLeadField = (id: string) => {
    setEditLeadFields((prev) => prev.filter((f) => f.id !== id));
  };
  const updateEditLeadField = (id: string, updates: Partial<LeadFieldDefinition>) => {
    setEditLeadFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const addEditKpi = () => {
    setEditKpis((prev) => [...prev, { id: `kpi_${Date.now()}`, label: "", type: "text" }]);
  };
  const removeEditKpi = (id: string) => {
    setEditKpis((prev) => prev.filter((k) => k.id !== id));
  };
  const updateEditKpi = (id: string, updates: Partial<KpiDefinition>) => {
    setEditKpis((prev) => prev.map((k) => (k.id === id ? { ...k, ...updates } : k)));
  };

  const addActorToCampaign = (actorId: string) => {
    if (!editSettings) return;
    const actorDef = getActorById(actorId);
    if (!actorDef) return;

    const prefilled: Record<string, string> = {};
    if (actorDef.phase === "find" && actorDef.inputFieldDescriptions) {
      const existingSearchTerms = findExistingSearchTerms(editSettings);
      for (const [fieldName, desc] of Object.entries(actorDef.inputFieldDescriptions)) {
        if (desc.type === "string-array" && existingSearchTerms) {
          prefilled[fieldName] = existingSearchTerms;
        } else if (desc.type === "number" && actorDef.defaultInput?.[fieldName] != null) {
          prefilled[fieldName] = String(actorDef.defaultInput[fieldName]);
        }
      }
    }
    if (actorDef.defaultInput) {
      for (const [key, val] of Object.entries(actorDef.defaultInput)) {
        if (!prefilled[key] && val != null) {
          prefilled[key] = Array.isArray(val) ? val.join(", ") : String(val);
        }
      }
    }

    setEditSettings({
      ...editSettings,
      actorOrder: [...editSettings.actorOrder, actorId],
      actorConfigs: { ...editSettings.actorConfigs, [actorId]: prefilled },
    });
    const hasFields = actorDef.phase !== "enrich" && Object.keys(actorDef.inputFieldDescriptions || {}).length > 0;
    setCollapsedActors((prev) => {
      const next = new Set(prev);
      if (hasFields) next.delete(actorId);
      else next.add(actorId);
      return next;
    });
    setAddActorOpen(false);
  };

  const removeActorFromCampaign = (actorId: string) => {
    if (!editSettings) return;
    const { [actorId]: _, ...remainingConfigs } = editSettings.actorConfigs;
    setEditSettings({
      ...editSettings,
      actorOrder: editSettings.actorOrder.filter((id) => id !== actorId),
      actorConfigs: remainingConfigs,
    });
  };

  const findExistingSearchTerms = (settings: NonNullable<typeof editSettings>): string | null => {
    for (const existingActorId of settings.actorOrder) {
      const existingDef = getActorById(existingActorId);
      if (existingDef?.phase !== "find") continue;
      const existingConfig = settings.actorConfigs[existingActorId] || {};
      for (const [fieldName, desc] of Object.entries(existingDef.inputFieldDescriptions || {})) {
        if (desc.type === "string-array" && existingConfig[fieldName]?.trim()) {
          return existingConfig[fieldName];
        }
      }
    }
    return null;
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete campaign");
      toast.success("Campaign deleted");
      router.push("/campaigns");
    } catch (err) {
      toast.error(String(err));
      setDeleting(false);
    }
  };

  const displayStatus = (lead: { id: number; status: string }) => {
    if (reEnrichingLeads.has(lead.id)) return "enriching";
    if (lead.status === "enriching" && isEnrichmentActive) return "enriching";
    if (lead.status === "new" || lead.status === "enriching") return "awaiting enrichment";
    return lead.status;
  };

  const statusColor: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    enriching: "bg-orange-100 text-orange-800 animate-pulse",
    "awaiting enrichment": "bg-slate-100 text-slate-700",
    qualified: "bg-green-100 text-green-800",
    converted: "bg-emerald-100 text-emerald-800",
    declined: "bg-red-100 text-red-800",
    archived: "bg-gray-100 text-gray-800",
  };

  const latestRunByActor = new Map<string, { status: string; resultCount: number; startedAt: string }>();
  for (const run of campaign.runs) {
    const existing = latestRunByActor.get(run.actorId);
    if (!existing || new Date(run.startedAt) > new Date(existing.startedAt)) {
      latestRunByActor.set(run.actorId, run);
    }
  }

  const isRunning = runningActor !== null || campaign.runs.some((r) => r.status === "running");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/campaigns")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          <p className="text-muted-foreground">{campaign.targetNiche}</p>
        </div>
        <Button variant="default" onClick={openSettings}>
          <Settings className="mr-2 h-4 w-4" /> Settings
        </Button>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Campaign</DialogTitle>
              <DialogDescription>
                This will permanently delete <strong>{campaign.name}</strong> and all its leads and run history. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="py-0">
        <CardContent className="py-3">
          <TooltipProvider>
            <div className="flex flex-wrap items-start divide-x">
              <div className="flex-1 min-w-[100px] px-4 first:pl-0">
                <p className="text-xs text-muted-foreground">Leads</p>
                <p className="text-lg font-semibold">{campaign.stats.totalLeads}</p>
              </div>
              <div className="flex-1 min-w-[100px] px-4">
                <p className="text-xs text-muted-foreground">Enriched</p>
                <p className="text-lg font-semibold">{campaign.stats.enrichedLeads}</p>
              </div>
              <div className="flex-1 min-w-[100px] px-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-muted-foreground cursor-help inline-flex items-center gap-1">Avg Score <Info className="h-2.5 w-2.5" /></p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">{"AI-generated lead fit score (0–100).\n80–100: Perfect fit\n60–79: Good fit\n40–59: Moderate fit\n20–39: Low fit\n0–19: Not a fit"}</TooltipContent>
                </Tooltip>
                <p className="text-lg font-semibold">{campaign.stats.avgScore}</p>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <div className="flex-1 min-w-[120px] px-4 cursor-pointer hover:bg-muted/50 rounded-md -my-1 py-1 transition-colors">
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">Total Cost <Info className="h-2.5 w-2.5" /></p>
                    <p className="text-lg font-semibold">${campaign.stats.totalCost.toFixed(4)}</p>
                  </div>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-56 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Cost Breakdown</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg / Lead</span>
                      <span className="font-medium">${campaign.stats.avgCostPerLead.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Discovery</span>
                      <span className="font-medium">${campaign.stats.avgDiscoveryCost.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Enrichment</span>
                      <span className="font-medium">${campaign.stats.avgEnrichmentCost.toFixed(4)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Apify</span>
                      <span className="font-medium">${campaign.stats.apifyCost.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">LLM</span>
                      <span className="font-medium">${campaign.stats.llmCost.toFixed(4)}</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Discovery Configuration</CardTitle>
            <Badge variant="outline" className="capitalize">
              <Clock className="mr-1 h-3 w-3" />
              {campaign.scheduleFrequency}
            </Badge>
          </div>
          {campaign.lastDiscoveryAt && (
            <p className="text-xs text-muted-foreground">
              Last run: {new Date(campaign.lastDiscoveryAt).toLocaleString()}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const findActors = (campaign.apifyActors || []).filter((id) => getActorById(id)?.phase === "find");
            const enrichActors = (campaign.apifyActors || []).filter((id) => getActorById(id)?.phase === "enrich");

            return (
              <>
                {findActors.map((actorId) => {
                  const actor = getActorById(actorId);
                  const latestRun = latestRunByActor.get(actorId);
                  const actorIsRunning = runningActor === actorId || latestRun?.status === "running";
                  const anyActorRunning = runningActor !== null || campaign.runs.some((r) => r.status === "running");
                  return (
                    <div key={actorId} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{actor?.name || actorId}</p>
                          <p className="text-xs text-muted-foreground">{actor?.description || ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {actorIsRunning && (
                            <Badge variant="secondary" className="gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Running
                            </Badge>
                          )}
                          {!actorIsRunning && latestRun?.status === "succeeded" && (
                            <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
                              <CheckCircle2 className="h-3 w-3" /> {latestRun.resultCount} results
                            </Badge>
                          )}
                          {!actorIsRunning && latestRun?.status === "failed" && (
                            <Badge variant="outline" className="gap-1 border-red-300 text-red-700">
                              <XCircle className="h-3 w-3" /> Failed
                            </Badge>
                          )}
                          {!latestRun && !anyActorRunning && (
                            <Badge variant="secondary">Not run yet</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer"
                            disabled={anyActorRunning}
                            onClick={() => handleRunActor(actorId)}
                            title={`Run ${actor?.name || actorId}`}
                          >
                            {actorIsRunning
                              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Running...</>
                              : <><Play className="mr-1.5 h-3.5 w-3.5" /> Run Scraper</>}
                          </Button>
                        </div>
                      </div>
                      {lastActorResult?.actorId === actorId && (
                        <p className="text-xs text-green-600 mt-2">
                          Found {lastActorResult.total} results, {lastActorResult.inserted} new leads added
                        </p>
                      )}
                      {actorIsRunning && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {discoveryProgress
                            ? `Processing lead ${discoveryProgress.index} of ${discoveryProgress.total}...`
                            : "Scraping in progress — this may take 1-2 minutes..."}
                        </p>
                      )}
                    </div>
                  );
                })}

                {enrichActors.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Lead Enrichment</p>
                        <p className="text-xs text-muted-foreground">These actors run automatically during enrichment</p>
                      </div>
                      {campaign.autoEnrich && isEnrichmentActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            enrichAbort?.abort();
                            fetch(`/api/campaigns/${campaign.id}/enrich`, { method: "DELETE" }).then(() => load()).catch(() => {});
                          }}
                        >
                          <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause Enrichment
                        </Button>
                      ) : campaign.autoEnrich && !isEnrichmentActive && hasUnenrichedLeads ? (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={triggerEnrichment}
                        >
                          <Play className="mr-1.5 h-3.5 w-3.5" /> Resume Enrichment
                        </Button>
                      ) : !campaign.autoEnrich && isEnrichmentActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            enrichAbort?.abort();
                            fetch(`/api/campaigns/${campaign.id}/enrich`, { method: "DELETE" }).then(() => load()).catch(() => {});
                          }}
                        >
                          <Power className="mr-1.5 h-3.5 w-3.5" /> Stop Enrichment
                        </Button>
                      ) : !campaign.autoEnrich && !isEnrichmentActive && hasUnenrichedLeads ? (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={triggerEnrichment}
                        >
                          <Zap className="mr-1.5 h-3.5 w-3.5" /> Start Enrichment
                        </Button>
                      ) : null}
                    </div>
                    <SortableList
                      items={enrichActors.map((id) => ({ id }))}
                      onReorder={async (newItems) => {
                        const findActorIds = (campaign.apifyActors || []).filter((id) => getActorById(id)?.phase === "find");
                        const newOrder = [...findActorIds, ...newItems.map((i) => i.id)];
                        setCampaign((prev) => prev ? { ...prev, apifyActors: newOrder } : prev);
                        await fetch(`/api/campaigns/${campaign.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ apifyActors: newOrder }),
                        }).catch(() => {});
                      }}
                      className="space-y-2"
                      renderItem={(item) => {
                        const actor = getActorById(item.id);
                        const isDisabled = disabledEnrichActors.has(item.id);
                        return (
                          <div className={`rounded-lg border p-3 ${isDisabled ? "opacity-50" : ""}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{actor?.name || item.id}</p>
                                <p className="text-xs text-muted-foreground">{actor?.description || ""}</p>
                              </div>
                              <Button
                                size="sm"
                                variant={isDisabled ? "default" : "outline"}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const next = new Set(disabledEnrichActors);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  setDisabledEnrichActors(next);
                                  const updatedConfigs = { ...(campaign.actorConfigs || {}), _disabledEnrichActors: Array.from(next) };
                                  await fetch(`/api/campaigns/${campaign.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ actorConfigs: updatedConfigs }),
                                  }).catch(() => {});
                                }}
                              >
                                {isDisabled ? "Activate" : "Deactivate"}
                              </Button>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </>
                )}
              </>
            );
          })()}

          {discoveryError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Discovery Error</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{discoveryError.message}</p>
                {discoveryError.actionUrl && (
                  <a
                    href={discoveryError.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {discoveryError.actionLabel || "Learn more"}
                  </a>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Leads ({campaign.leads.length})</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(campaign.leadFieldDefinitions ?? []).map((f) => (
                    <DropdownMenuCheckboxItem
                      key={f.id}
                      checked={extraColumns.has(`field:${f.id}`)}
                      onCheckedChange={(checked) => {
                        setExtraColumns((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(`field:${f.id}`);
                          else next.delete(`field:${f.id}`);
                          return next;
                        });
                      }}
                    >
                      {f.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {unenrichedCount > 0 && (
              <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                {isEnrichmentActive && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{unenrichedCount} of {campaign.leads.length} awaiting enrichment</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const dynFields = campaign.leadFieldDefinitions ?? [];

            const resolveFieldValue = (
              lead: (typeof campaign.leads)[number],
              field: LeadFieldDefinition
            ): string => {
              const mapped = lead.mappedData as Record<string, unknown> | undefined;
              const raw = lead.rawData as Record<string, unknown> | undefined;
              const val = mapped?.[field.id] ?? raw?.[field.id];
              if (val == null) return "—";
              if (field.type === "boolean") return val === true || val === "true" ? "Yes" : val === false || val === "false" ? "No" : String(val);
              if (field.type === "number" && typeof val === "number") return val.toLocaleString();
              if (field.type === "url" && typeof val === "string" && val.startsWith("http")) return val;
              if (typeof val === "object") {
                if (Array.isArray(val)) {
                  if (val.length === 0) return "—";
                  if (val.every((v) => typeof v !== "object" || v === null)) return val.filter((v) => v != null).join(", ");
                  return val.map((item) => {
                    if (typeof item !== "object" || item === null) return String(item);
                    return Object.values(item as Record<string, unknown>).filter((v) => v != null).map(String).join(": ");
                  }).join(", ");
                }
                return Object.entries(val as Record<string, unknown>).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(", ");
              }
              return String(val);
            };

            const formatRelativeTime = (dateStr: string) => {
              const diff = Date.now() - new Date(dateStr).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 1) return "just now";
              if (mins < 60) return `${mins}m ago`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs}h ago`;
              const days = Math.floor(hrs / 24);
              if (days < 7) return `${days}d ago`;
              return new Date(dateStr).toLocaleDateString();
            };

            return campaign.leads.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center space-y-2">
                {runningActor && discoveryProgress ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    <p>Processing lead {discoveryProgress.index} of {discoveryProgress.total}...</p>
                  </>
                ) : runningActor ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    <p>Discovery is running — leads will appear here shortly.</p>
                  </>
                ) : (
                  <p>No leads yet. Run a scraper from Discovery Configuration above.</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px] max-w-[200px]">Label</TableHead>
                      {dynFields.filter((f) => extraColumns.has(`field:${f.id}`)).map((f) => (
                        <TableHead key={f.id} className="min-w-[120px] max-w-[200px]">{f.label}</TableHead>
                      ))}
                      <TableHead className="min-w-[80px] max-w-[200px]">Added</TableHead>
                      <TableHead className="min-w-[70px] max-w-[200px]">Score</TableHead>
                      <TableHead className="min-w-[100px] max-w-[200px]">Status</TableHead>
                      <TableHead className="min-w-[60px] max-w-[200px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaign.leads.map((lead) => {
                      const status = displayStatus(lead);
                      const label = getLeadDisplayName({
                        displayName: lead.displayName,
                        rawData: lead.rawData ?? undefined,
                        mappedData: lead.mappedData ?? undefined,
                      });

                      return (
                        <TableRow key={lead.id}>
                          <TableCell className="overflow-hidden max-w-[200px]">
                            <Link href={`/leads/${lead.id}`} className="font-medium hover:underline break-words line-clamp-2">
                              {label}
                            </Link>
                          </TableCell>
                          {dynFields.filter((f) => extraColumns.has(`field:${f.id}`)).map((f) => {
                            const val = resolveFieldValue(lead, f);
                            if ((f.type === "url" || val.startsWith("http")) && val !== "—") {
                              return (
                                <TableCell key={f.id} className="text-xs truncate max-w-[200px]">
                                  <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {val.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                                  </a>
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={f.id} className="text-sm truncate max-w-[200px]">
                                {val}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap max-w-[200px]">
                            {formatRelativeTime(lead.createdAt)}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {lead.status === "new" || lead.status === "enriching"
                              ? <Badge variant="outline">---</Badge>
                              : <ScoreBadgeCompact score={lead.score} />}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <Badge className={statusColor[status] || ""}>{status}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {reEnrichingLeads.has(lead.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (lead.status === "new" || lead.status === "enriching") ? (
                              <div className="flex items-center gap-0.5">
                                {lead.status === "new" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="cursor-pointer"
                                    onClick={() => handleReEnrich(lead.id)}
                                    title="Enrich lead"
                                  >
                                    <Zap className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="cursor-pointer"
                                  onClick={() => handleSkipEnrichment(lead.id)}
                                  title="Skip enrichment"
                                >
                                  <ChevronsRight className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (lead.status === "qualified" || lead.status === "converted" || lead.status === "declined") ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="cursor-pointer"
                                onClick={() => handleReEnrich(lead.id)}
                                title="Re-enrich"
                              >
                                <RotateCw className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {campaign.runs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Run History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.runs.map((run) => {
                  const actor = getActorById(run.actorId);
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm">{actor?.name || run.actorId}</TableCell>
                      <TableCell>
                        <Badge variant={run.status === "succeeded" ? "default" : run.status === "running" ? "secondary" : "destructive"}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{run.resultCount}</TableCell>
                      <TableCell className="text-sm">{run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(run.startedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Campaign Settings</SheetTitle>
            <SheetDescription>Edit configuration for {campaign.name}</SheetDescription>
          </SheetHeader>

          {editSettings && (
            <div className="space-y-6 p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Niche</Label>
                  <Input
                    value={editSettings.targetNiche}
                    onChange={(e) => setEditSettings({ ...editSettings, targetNiche: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>AI Provider</Label>
                    <Select value={editSettings.aiProvider} onValueChange={(v) => setEditSettings({ ...editSettings, aiProvider: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI (GPT-4o)</SelectItem>
                        <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Schedule</Label>
                    <Select value={editSettings.scheduleFrequency} onValueChange={(v) => setEditSettings({ ...editSettings, scheduleFrequency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">Run Once</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Lead Enrichment</Label>
                    <Select
                      value={editSettings.autoEnrich ? "automatic" : "off"}
                      onValueChange={(v) => setEditSettings({ ...editSettings, autoEnrich: v === "automatic" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automatic">Automatic</SelectItem>
                        <SelectItem value="off">Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Enrichment Concurrency</Label>
                    <Input
                      type="number"
                      min={1}
                      value={editSettings.enrichmentConcurrency}
                      onChange={(e) => setEditSettings({ ...editSettings, enrichmentConcurrency: e.target.value === "" ? "" : parseInt(e.target.value) || 1 })}
                      placeholder={`Global default (${globalEnrichConcurrency})`}
                    />
                  </div>
                </div>

              </div>

              {(() => {
                const actorsForSettings = (editSettings.actorOrder || campaign.apifyActors || []).filter((id) => getActorById(id));
                const usedActorIds = new Set(editSettings.actorOrder || []);
                const availableFind = getActorsByPhase("find").filter((a) => !usedActorIds.has(a.id));
                const availableEnrich = getActorsByPhase("enrich").filter((a) => !usedActorIds.has(a.id));
                const hasAvailableActors = availableFind.length > 0 || availableEnrich.length > 0;

                return (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Actors</Label>
                        {hasAvailableActors && (
                          <Popover open={addActorOpen} onOpenChange={setAddActorOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5 h-7">
                                <Plus className="h-3.5 w-3.5" /> Add Actor
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-72 p-2">
                              <div className="space-y-1">
                                {availableFind.length > 0 && (
                                  <>
                                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Scraping</p>
                                    {availableFind.map((actor) => (
                                      <button
                                        key={actor.id}
                                        type="button"
                                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted transition-colors"
                                        onClick={() => addActorToCampaign(actor.id)}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium truncate">{actor.name}</p>
                                          <p className="text-xs text-muted-foreground line-clamp-1">{actor.description}</p>
                                        </div>
                                      </button>
                                    ))}
                                  </>
                                )}
                                {availableEnrich.length > 0 && (
                                  <>
                                    {availableFind.length > 0 && <Separator className="my-1" />}
                                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Enrichment</p>
                                    {availableEnrich.map((actor) => (
                                      <button
                                        key={actor.id}
                                        type="button"
                                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted transition-colors"
                                        onClick={() => addActorToCampaign(actor.id)}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium truncate">{actor.name}</p>
                                          <p className="text-xs text-muted-foreground line-clamp-1">{actor.description}</p>
                                        </div>
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Drag to reorder. Actors run top to bottom during discovery and enrichment.</p>
                      {actorsForSettings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No actors configured. Click &quot;Add Actor&quot; to get started.</p>
                      ) : (
                        <SortableList
                          items={actorsForSettings.map((id) => ({ id }))}
                          onReorder={(newItems) => setEditSettings({ ...editSettings, actorOrder: newItems.map((i) => i.id) })}
                          className="space-y-3"
                          renderItem={(item) => {
                            const actorId = item.id;
                            const actorDef = getActorById(actorId);
                            if (!actorDef) return <div />;
                            const fields = editSettings.actorConfigs[actorId] || {};
                            const hasInputFields = actorDef.phase !== "enrich" && Object.keys(actorDef.inputFieldDescriptions || {}).length > 0;
                            const isCollapsed = collapsedActors.has(actorId);

                            return (
                              <div className="rounded-lg border">
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    className="flex flex-1 items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors min-w-0"
                                    onClick={() => setCollapsedActors((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(actorId)) next.delete(actorId);
                                      else next.add(actorId);
                                      return next;
                                    })}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium">{actorDef.name}</p>
                                        <Badge variant="outline" className="text-xs capitalize shrink-0">{actorDef.phase}</Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground">{actorDef.description}</p>
                                    </div>
                                    {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                  </button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 mr-2 text-muted-foreground hover:text-destructive shrink-0"
                                    onClick={() => removeActorFromCampaign(actorId)}
                                    title="Remove actor"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                {!isCollapsed && hasInputFields && (
                                  <div className="space-y-3 border-t px-4 pb-4 pt-3">
                                    {Object.keys(actorDef.inputFieldDescriptions || {}).map((fieldName) => {
                                      const desc = actorDef.inputFieldDescriptions?.[fieldName];
                                      const value = fields[fieldName] || "";
                                      return (
                                        <div key={fieldName} className="space-y-1.5">
                                          <Label className="text-sm">{desc?.label || fieldName}</Label>
                                          {desc?.type === "string-array" ? (
                                            <Textarea
                                              value={value}
                                              onChange={(e) => {
                                                const updated = { ...editSettings };
                                                if (!updated.actorConfigs[actorId]) updated.actorConfigs[actorId] = {};
                                                updated.actorConfigs[actorId][fieldName] = e.target.value;
                                                setEditSettings({ ...updated });
                                              }}
                                              placeholder={desc?.placeholder}
                                              rows={3}
                                              className="resize-none text-sm"
                                            />
                                          ) : (
                                            <Input
                                              value={value}
                                              onChange={(e) => {
                                                const updated = { ...editSettings };
                                                if (!updated.actorConfigs[actorId]) updated.actorConfigs[actorId] = {};
                                                updated.actorConfigs[actorId][fieldName] = e.target.value;
                                                setEditSettings({ ...updated });
                                              }}
                                              placeholder={desc?.placeholder}
                                              type={desc?.type === "number" ? "number" : "text"}
                                            />
                                          )}
                                          {desc?.helpText && (
                                            <p className="text-xs text-muted-foreground">{desc.helpText}</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {!isCollapsed && !hasInputFields && (
                                  <div className="border-t px-4 py-3">
                                    <p className="text-xs text-muted-foreground">No configurable fields — inputs are filled from lead data during enrichment.</p>
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />
                      )}
                    </div>
                  </>
                );
              })()}

              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Tag className="h-4 w-4" /> Lead Data Fields
                  </Label>
                  <Button variant="outline" size="sm" onClick={addEditLeadField} className="gap-1.5 h-7">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Fields extracted from each lead during enrichment.</p>
                {editLeadFields.length > 0 ? (
                  <div className="space-y-2">
                    {editLeadFields.map((field) => (
                      <div key={field.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-1.5 min-w-0">
                            <Input
                              value={field.label}
                              onChange={(e) => updateEditLeadField(field.id, { label: e.target.value })}
                              placeholder="Field label"
                              className="h-8 text-sm font-medium"
                            />
                            <Input
                              value={field.description || ""}
                              onChange={(e) => updateEditLeadField(field.id, { description: e.target.value })}
                              placeholder="Description (optional)"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant={field.type === "text" ? "default" : "outline"} size="sm" onClick={() => updateEditLeadField(field.id, { type: "text" })} className="h-7 w-7 p-0" title="Text"><Type className="h-3 w-3" /></Button>
                            <Button variant={field.type === "number" ? "default" : "outline"} size="sm" onClick={() => updateEditLeadField(field.id, { type: "number" })} className="h-7 w-7 p-0" title="Number"><Hash className="h-3 w-3" /></Button>
                            <Button variant={field.type === "boolean" ? "default" : "outline"} size="sm" onClick={() => updateEditLeadField(field.id, { type: "boolean" })} className="h-7 w-7 p-0" title="Yes/No"><ToggleRight className="h-3 w-3" /></Button>
                            <Button variant={field.type === "url" ? "default" : "outline"} size="sm" onClick={() => updateEditLeadField(field.id, { type: "url" })} className="h-7 w-7 p-0" title="URL"><Link2 className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => removeEditLeadField(field.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No custom lead fields configured. Click &quot;Add&quot; to track extra data per lead.</p>
                )}
              </div>

              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Tracked KPIs
                  </Label>
                  <Button variant="outline" size="sm" onClick={addEditKpi} className="gap-1.5 h-7">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">KPIs automatically filled by AI during enrichment. Editable per lead.</p>
                {editKpis.length > 0 ? (
                  <div className="space-y-2">
                    {editKpis.map((kpi) => (
                      <div key={kpi.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-1.5 min-w-0">
                            <Input
                              value={kpi.label}
                              onChange={(e) => updateEditKpi(kpi.id, { label: e.target.value })}
                              placeholder="KPI label"
                              className="h-8 text-sm font-medium"
                            />
                            <Input
                              value={kpi.description || ""}
                              onChange={(e) => updateEditKpi(kpi.id, { description: e.target.value })}
                              placeholder="Description (optional)"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant={kpi.type === "boolean" ? "default" : "outline"} size="sm" onClick={() => updateEditKpi(kpi.id, { type: "boolean" })} className="gap-1 h-7 px-2 text-xs"><ToggleLeft className="h-3 w-3" /> Yes/No</Button>
                            <Button variant={kpi.type === "text" ? "default" : "outline"} size="sm" onClick={() => updateEditKpi(kpi.id, { type: "text" })} className="gap-1 h-7 px-2 text-xs"><Type className="h-3 w-3" /> Text</Button>
                            <Button variant="ghost" size="sm" onClick={() => removeEditKpi(kpi.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No KPIs configured. Click &quot;Add&quot; to track custom metrics.</p>
                )}
              </div>
            </div>
          )}

          <SheetFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
