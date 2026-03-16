"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Globe, Phone, Mail, ExternalLink, ChevronsRight, Save, BarChart3, RotateCw, Loader2, Copy, Maximize2, Tag, Hash, Link2, Zap, DollarSign, Pencil, Check, X, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScoreBadge } from "@/components/score-badge";
import { useActors } from "@/hooks/use-actors";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLeadEvents } from "@/hooks/use-lead-events";

interface KpiDefinition {
  id: string;
  label: string;
  type: "boolean" | "text";
  description?: string;
}

interface LeadFieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "url";
  description?: string;
}

interface LeadDetail {
  id: number;
  campaignId: number | null;
  displayName: string;
  email: string;
  phone: string;
  website: string;
  score: number;
  status: string;
  source: string;
  createdAt: string;
  rawData: Record<string, unknown>;
  mappedData?: Record<string, unknown>;
  llmCostUsd?: number;
  apifyCostUsd?: number;
  discoveryLlmCostUsd?: number;
  discoveryApifyCostUsd?: number;
  kpiDefinitions: KpiDefinition[];
  leadFieldDefinitions: LeadFieldDefinition[];
  enrichActorIds: string[];
  personalization: {
    personalizationSummary: string;
    painPoints: string[];
    websiteTechStack: string[];
    hasChatbot: boolean;
    hasBookingSystem: boolean;
    companyDescription: string;
    lastBlogPost: string;
    campaignKpis: Record<string, boolean | string>;
    rawEnrichmentData?: Record<string, unknown>;
  } | null;
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getActorById } = useActors();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [jsonDialog, setJsonDialog] = useState<{ title: string; data: unknown } | null>(null);
  const [kpiValues, setKpiValues] = useState<Record<string, boolean | string>>({});
  const [kpiDirty, setKpiDirty] = useState(false);
  const [savingKpis, setSavingKpis] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editContactValues, setEditContactValues] = useState<Record<string, string>>({});
  const [savingContact, setSavingContact] = useState(false);

  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNow = useCallback(() => {
    fetch(`/api/leads/${params.id}`).then((r) => r.json()).then((data: LeadDetail) => {
      setLead(data);
      const rawKpis = data.personalization?.campaignKpis;
      setKpiValues(typeof rawKpis === "string" ? JSON.parse(rawKpis) : rawKpis || {});
      setKpiDirty(false);
    });
  }, [params.id]);

  const load = useCallback(() => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(loadNow, 300);
  }, [loadNow]);

  useEffect(() => { loadNow(); }, [params.id]);

  const isEnrichingFromServer = lead?.status === "enriching";
  const isEnriching = enriching || !!isEnrichingFromServer;

  useLeadEvents(
    {
      onKpiUpdated: (data) => {
        if (!kpiDirty) {
          setKpiValues(data.campaignKpis);
        }
      },
      onEnrichmentCompleted: () => load(),
      onStatusChanged: () => load(),
    },
    { leadId: lead?.id }
  );

  const handleEnrich = async (actorIds?: string[]) => {
    setEnriching(true);
    try {
      const res = await fetch(`/api/leads/${params.id}/enrich`, {
        method: "POST",
        ...(actorIds ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorIds }),
        } : {}),
      });
      if (!res.ok) throw new Error("Enrichment failed");
      toast.success(actorIds ? "Actor enrichment started" : "Lead enriched successfully");
      load();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setEnriching(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast.success(`Status updated to ${status}`);
    load();
  };

  const updateKpiValue = (id: string, value: boolean | string) => {
    setKpiValues((prev) => ({ ...prev, [id]: value }));
    setKpiDirty(true);
  };

  const saveKpis = async () => {
    setSavingKpis(true);
    try {
      await fetch(`/api/leads/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignKpis: kpiValues }),
      });
      toast.success("KPIs saved");
      setKpiDirty(false);
    } catch {
      toast.error("Failed to save KPIs");
    } finally {
      setSavingKpis(false);
    }
  };

  const startEditingContact = () => {
    if (!lead) return;
    const mapped = lead.mappedData as Record<string, unknown> | undefined;
    const raw = lead.rawData as Record<string, unknown> | undefined;
    const values: Record<string, string> = {
      email: lead.email || "",
      phone: lead.phone || "",
      website: lead.website || "",
    };
    for (const field of lead.leadFieldDefinitions || []) {
      const val = mapped?.[field.id] ?? raw?.[field.id];
      values[`field:${field.id}`] = val != null ? String(val) : "";
    }
    setEditContactValues(values);
    setIsEditingContact(true);
  };

  const discardContactEdit = () => {
    setIsEditingContact(false);
    setEditContactValues({});
  };

  const saveContactEdit = async () => {
    if (!lead) return;
    setSavingContact(true);
    try {
      const body: Record<string, unknown> = {};
      if (editContactValues.email !== (lead.email || "")) body.email = editContactValues.email || null;
      if (editContactValues.phone !== (lead.phone || "")) body.phone = editContactValues.phone || null;
      if (editContactValues.website !== (lead.website || "")) body.website = editContactValues.website || null;

      const mapped = (lead.mappedData as Record<string, unknown>) || {};
      const updatedMapped = { ...mapped };
      let mappedChanged = false;
      for (const field of lead.leadFieldDefinitions || []) {
        const key = `field:${field.id}`;
        const oldVal = mapped[field.id] != null ? String(mapped[field.id]) : "";
        if (editContactValues[key] !== oldVal) {
          updatedMapped[field.id] = editContactValues[key] || null;
          mappedChanged = true;
        }
      }
      if (mappedChanged) body.mappedData = JSON.stringify(updatedMapped);

      if (Object.keys(body).length > 0) {
        const res = await fetch(`/api/leads/${params.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to save");
        toast.success("Contact info updated");
        load();
      }
      setIsEditingContact(false);
      setEditContactValues({});
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingContact(false);
    }
  };

  if (!lead) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  const statusColors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    enriching: "bg-orange-100 text-orange-800",
    qualified: "bg-green-100 text-green-800",
    converted: "bg-emerald-100 text-emerald-800",
    declined: "bg-red-100 text-red-800",
    archived: "bg-gray-100 text-gray-800",
  };

  const p = lead.personalization;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{lead.displayName || "Unknown"}</h1>
        </div>
        <ScoreBadge score={lead.score} size="lg" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contact Information</CardTitle>
                {isEditingContact ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={discardContactEdit} disabled={savingContact} className="h-7 gap-1 text-xs text-muted-foreground">
                      <X className="h-3.5 w-3.5" /> Discard
                    </Button>
                    <Button size="sm" onClick={saveContactEdit} disabled={savingContact} className="h-7 gap-1 text-xs">
                      {savingContact ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={startEditingContact} className="h-7 gap-1 text-xs text-muted-foreground">
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEditingContact ? (
                <>
                  <EditableRow icon={Mail} label="Email" value={editContactValues.email || ""} onChange={(v) => setEditContactValues({ ...editContactValues, email: v })} placeholder="email@example.com" />
                  <EditableRow icon={Phone} label="Phone" value={editContactValues.phone || ""} onChange={(v) => setEditContactValues({ ...editContactValues, phone: v })} placeholder="+1 (555) 000-0000" />
                  <EditableRow icon={Globe} label="Website" value={editContactValues.website || ""} onChange={(v) => setEditContactValues({ ...editContactValues, website: v })} placeholder="https://example.com" />
                  {(lead.leadFieldDefinitions || []).map((field) => {
                    const icon = field.type === "number" ? Hash : field.type === "url" ? Link2 : Tag;
                    return (
                      <EditableRow
                        key={field.id}
                        icon={icon}
                        label={field.label}
                        value={editContactValues[`field:${field.id}`] || ""}
                        onChange={(v) => setEditContactValues({ ...editContactValues, [`field:${field.id}`]: v })}
                        placeholder={field.description || field.label}
                      />
                    );
                  })}
                </>
              ) : (
                <>
                  <InfoRow icon={Mail} label="Email" value={lead.email} />
                  <InfoRow icon={Phone} label="Phone" value={lead.phone} />
                  <InfoRow icon={Globe} label="Website" value={lead.website} link />
                  {lead.leadFieldDefinitions && lead.leadFieldDefinitions.length > 0 && (() => {
                    const mapped = lead.mappedData as Record<string, unknown> | undefined;
                    const raw = lead.rawData as Record<string, unknown> | undefined;

                    const formatVal = (val: unknown, type: string): string => {
                      if (val == null) return "";
                      if (type === "boolean") return val === true || val === "true" ? "Yes" : val === false || val === "false" ? "No" : String(val);
                      if (type === "number" && typeof val === "number") return val.toLocaleString();
                      if (typeof val === "object") {
                        if (Array.isArray(val)) {
                          if (val.length === 0) return "";
                          if (val.every((v) => typeof v !== "object" || v === null)) return val.filter((v) => v != null).join(", ");
                          return val.map((item) => {
                            if (typeof item !== "object" || item === null) return String(item);
                            return Object.values(item as Record<string, unknown>).filter((v) => v != null).map(String).join(": ");
                          }).join(", ");
                        }
                        const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v != null);
                        if (entries.length === 0) return "";
                        return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
                      }
                      return String(val);
                    };

                    return lead.leadFieldDefinitions.map((field) => {
                      const val = mapped?.[field.id] ?? raw?.[field.id];
                      const strVal = val != null ? formatVal(val, field.type) : "";
                      const isUrl = field.type === "url" || (typeof strVal === "string" && strVal.startsWith("http"));
                      const icon = field.type === "number" ? Hash : isUrl ? Link2 : Tag;
                      return <InfoRow key={field.id} icon={icon} label={field.label} value={strVal || undefined} link={isUrl} />;
                    });
                  })()}
                </>
              )}
            </CardContent>
          </Card>

          {p && (
            <Card>
              <CardHeader><CardTitle>Personalization Insights</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {p.personalizationSummary && (
                  <div>
                    <p className="text-sm font-medium mb-1">Summary</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.personalizationSummary}</p>
                  </div>
                )}
                {Array.isArray(p.painPoints) && p.painPoints.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Pain Points</p>
                    <div className="flex flex-wrap gap-1">
                      {p.painPoints.map((pp, i) => (
                        <Badge key={i} variant="secondary">{pp}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(p.websiteTechStack) && p.websiteTechStack.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Tech Stack</p>
                    <div className="flex flex-wrap gap-1">
                      {p.websiteTechStack.map((t, i) => (
                        <Badge key={i} variant="outline">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {p.companyDescription && (
                  <div>
                    <p className="text-sm font-medium mb-1">About</p>
                    <p className="text-sm text-muted-foreground">{p.companyDescription}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {lead.kpiDefinitions && lead.kpiDefinitions.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <CardTitle>Campaign KPIs</CardTitle>
                  </div>
                  {kpiDirty && (
                    <Button size="sm" onClick={saveKpis} disabled={savingKpis} className="gap-1.5">
                      <Save className="h-3.5 w-3.5" />
                      {savingKpis ? "Saving..." : "Save"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {lead.kpiDefinitions.map((kpi) => (
                  <div key={kpi.id} className="flex items-center gap-4">
                    {kpi.type === "boolean" ? (
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <Label className="text-sm">{kpi.label}</Label>
                          {kpi.description && <p className="text-xs text-muted-foreground">{kpi.description}</p>}
                        </div>
                        <Switch
                          checked={kpiValues[kpi.id] === true}
                          onCheckedChange={(checked) => updateKpiValue(kpi.id, checked)}
                        />
                      </div>
                    ) : (
                      <div className="w-full space-y-1">
                        <Label className="text-sm">{kpi.label}</Label>
                        {kpi.description && <p className="text-xs text-muted-foreground">{kpi.description}</p>}
                        <Input
                          value={typeof kpiValues[kpi.id] === "string" ? kpiValues[kpi.id] as string : ""}
                          onChange={(e) => updateKpiValue(kpi.id, e.target.value)}
                          placeholder="Not set"
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(lead.status === "new" || lead.status === "enriching") ? (
                <>
                  <Button onClick={() => handleEnrich()} disabled={isEnriching} className="w-full">
                    {isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    {isEnriching ? "Enriching..." : "Enrich Lead"}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => handleStatusChange("qualified")} disabled={isEnriching}>
                    <ChevronsRight className="mr-2 h-4 w-4" /> Skip Enrichment
                  </Button>
                </>
              ) : (
                <div className="flex gap-1">
                  <Button variant="outline" onClick={() => handleEnrich()} disabled={isEnriching} className="flex-1">
                    <RotateCw className={`mr-2 h-4 w-4 ${isEnriching ? "animate-spin" : ""}`} />
                    {isEnriching ? "Re-enriching..." : "Re-enrich"}
                  </Button>
                  {lead.enrichActorIds && lead.enrichActorIds.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" disabled={isEnriching} className="shrink-0">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => handleEnrich()}>
                          <RotateCw className="mr-2 h-3.5 w-3.5" />
                          All actors
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {lead.enrichActorIds.map((actorId) => (
                          <DropdownMenuItem key={actorId} onClick={() => handleEnrich([actorId])}>
                            <Zap className="mr-2 h-3.5 w-3.5" />
                            {getActorById(actorId)?.name || actorId}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
              <Separator />
              <p className="text-xs text-muted-foreground font-medium">Status</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full focus:outline-none">
                    <Badge className={`${statusColors[lead.status] || "bg-gray-100 text-gray-800"} cursor-pointer hover:opacity-80 transition-opacity w-full justify-center py-1.5 text-sm`}>
                      {lead.status}
                    </Badge>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {["new", "enriching", "qualified", "converted", "declined", "archived"].map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={s === lead.status}
                      className="capitalize"
                    >
                      <Badge className={`${statusColors[s] || ""} mr-2`}>{s}</Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Raw Data</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowRaw(!showRaw)}>
                  {showRaw ? "Hide" : "Show"}
                </Button>
              </div>
            </CardHeader>
            {showRaw && (
              <CardContent className="space-y-3">
                <RawDataBlock title="Source Data" data={lead.rawData} onExpand={setJsonDialog} />
                {p?.rawEnrichmentData && Object.keys(p.rawEnrichmentData).length > 0 && (() => {
                  const entries = Object.entries(p.rawEnrichmentData);
                  const isPerActor = entries.every(([k, v]) => k.includes("/") && v != null && typeof v === "object" && !Array.isArray(v));
                  if (isPerActor) {
                    return entries.map(([actorId, data]) => (
                      <RawDataBlock
                        key={actorId}
                        title={`Enrichment: ${getActorById(actorId)?.name || actorId}`}
                        data={data}
                        onExpand={setJsonDialog}
                      />
                    ));
                  }
                  return <RawDataBlock title="Enrichment Data" data={p.rawEnrichmentData} onExpand={setJsonDialog} />;
                })()}
                {lead.mappedData && Object.keys(lead.mappedData).length > 0 && (
                  <RawDataBlock title="Mapped Data" data={lead.mappedData} onExpand={setJsonDialog} />
                )}
              </CardContent>
            )}
          </Card>

          <Dialog open={!!jsonDialog} onOpenChange={(open) => !open && setJsonDialog(null)}>
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{jsonDialog?.title}</DialogTitle>
              </DialogHeader>
              <pre className="overflow-auto rounded bg-muted p-4 text-xs max-h-[60vh]">
                {jsonDialog ? JSON.stringify(jsonDialog.data, null, 2) : ""}
              </pre>
            </DialogContent>
          </Dialog>

          {(() => {
            const discoveryLlm = lead.discoveryLlmCostUsd ?? 0;
            const discoveryApify = lead.discoveryApifyCostUsd ?? 0;
            const totalLlm = (lead.llmCostUsd ?? 0) as number;
            const totalApify = lead.apifyCostUsd ?? 0;
            const enrichmentLlm = totalLlm - discoveryLlm;
            const enrichmentApify = totalApify - discoveryApify;
            const discoveryCost = discoveryLlm + discoveryApify;
            const enrichmentCost = enrichmentLlm + enrichmentApify;
            const totalCost = totalLlm + totalApify;
            const isEnriched = lead.status !== "new" && lead.status !== "enriching";

            if (totalCost <= 0) return null;

            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">Cost Breakdown</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-medium">Total Cost</span>
                    <span className="text-lg font-bold tabular-nums">${totalCost.toFixed(4)}</span>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Discovery</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">LLM</span>
                      <span className="text-right tabular-nums">${discoveryLlm.toFixed(4)}</span>
                      <span className="text-muted-foreground">Apify</span>
                      <span className="text-right tabular-nums">${discoveryApify.toFixed(4)}</span>
                      <span className="font-medium">Subtotal</span>
                      <span className="text-right font-medium tabular-nums">${discoveryCost.toFixed(4)}</span>
                    </div>
                  </div>
                  {isEnriched && enrichmentCost > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Enrichment</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">LLM</span>
                        <span className="text-right tabular-nums">${enrichmentLlm.toFixed(4)}</span>
                        <span className="text-muted-foreground">Apify</span>
                        <span className="text-right tabular-nums">${enrichmentApify.toFixed(4)}</span>
                        <span className="font-medium">Subtotal</span>
                        <span className="text-right font-medium tabular-nums">${enrichmentCost.toFixed(4)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardContent className="py-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <a
                  href={`https://apify.com/${lead.source}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  {getActorById(lead.source)?.name || lead.source}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">
                  {new Date(lead.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  link,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | undefined | null;
  link?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
      {value ? (
        link ? (
          <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline min-w-0 break-words">
            {value}
          </a>
        ) : (
          <span className="text-sm min-w-0 break-words">{value}</span>
        )
      ) : (
        <span className="text-sm text-muted-foreground/50 italic">Not set</span>
      )}
    </div>
  );
}

function EditableRow({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
      <span className="text-sm text-muted-foreground w-32 shrink-0 mt-2">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm flex-1"
      />
    </div>
  );
}

function RawDataBlock({
  title,
  data,
  onExpand,
}: {
  title: string;
  data: unknown;
  onExpand: (v: { title: string; data: unknown }) => void;
}) {
  const json = JSON.stringify(data, null, 2);
  const copyToClipboard = () => {
    navigator.clipboard.writeText(json).then(() => {
      toast.success("Copied to clipboard");
    });
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="flex gap-1">
          <button onClick={copyToClipboard} className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors" title="Copy JSON">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onExpand({ title, data })} className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors" title="Expand">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
        {json}
      </pre>
    </div>
  );
}
