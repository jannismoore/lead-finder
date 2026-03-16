"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Users, Sparkles, Loader2, X, Download, Target } from "lucide-react";
import { ScoreBadgeCompact } from "@/components/score-badge";
import { getLeadDisplayName } from "@/lib/utils/lead-display";

interface LeadFieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "url";
  description?: string;
}

interface Campaign {
  id: number;
  name: string;
  leadFieldDefinitions?: LeadFieldDefinition[];
}

interface Lead {
  id: number;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  score: number;
  status: string;
  source: string;
  campaignId: number | null;
  rawData?: Record<string, unknown>;
  mappedData?: Record<string, unknown>;
  llmCostUsd?: number;
  apifyCostUsd?: number;
  createdAt: string;
}

interface LeadFilter {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean;
  label: string;
}

const STATUS_OPTIONS = [
  "new",
  "enriching",
  "qualified",
  "converted",
  "declined",
  "archived",
] as const;

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  enriching: "bg-orange-100 text-orange-800",
  qualified: "bg-green-100 text-green-800",
  converted: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  archived: "bg-gray-100 text-gray-800",
};

function resolveFieldValue(lead: Lead, field: string): unknown {
  const coreVal = lead[field as keyof Lead];
  if (coreVal !== undefined && coreVal !== null) return coreVal;

  if (lead.mappedData?.[field] !== undefined) return lead.mappedData[field];
  if (lead.rawData?.[field] !== undefined) return lead.rawData[field];

  return null;
}

function formatFieldValue(value: unknown, type?: string): string {
  if (value == null) return "—";
  if (type === "boolean") return value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : String(value);
  if (type === "number" && typeof value === "number") return value.toLocaleString();
  if (type === "url" && typeof value === "string" && value.startsWith("http")) return value;
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      if (value.length === 0) return "—";
      if (value.every((v) => typeof v !== "object" || v === null)) return value.filter((v) => v != null).join(", ");
      return value.map((item) => {
        if (typeof item !== "object" || item === null) return String(item);
        return Object.values(item as Record<string, unknown>).filter((v) => v != null).map(String).join(": ");
      }).join(", ");
    }
    return Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(", ");
  }
  return String(value);
}

function matchesFilter(lead: Lead, filter: LeadFilter): boolean {
  const raw = resolveFieldValue(lead, filter.field);
  const val = raw == null ? "" : raw;

  switch (filter.operator) {
    case "eq":
      return String(val).toLowerCase() === String(filter.value).toLowerCase();
    case "neq":
      return String(val).toLowerCase() !== String(filter.value).toLowerCase();
    case "gt":
      return Number(val) > Number(filter.value);
    case "gte":
      return Number(val) >= Number(filter.value);
    case "lt":
      return Number(val) < Number(filter.value);
    case "lte":
      return Number(val) <= Number(filter.value);
    case "contains":
      return String(val).toLowerCase().includes(String(filter.value).toLowerCase());
    case "not_contains":
      return !String(val).toLowerCase().includes(String(filter.value).toLowerCase());
    case "exists":
      return raw != null && String(raw).trim() !== "";
    case "not_exists":
      return raw == null || String(raw).trim() === "";
    case "starts_with":
      return String(val).toLowerCase().startsWith(String(filter.value).toLowerCase());
    case "ends_with":
      return String(val).toLowerCase().endsWith(String(filter.value).toLowerCase());
    default:
      return true;
  }
}

function applyFilters(leads: Lead[], filters: LeadFilter[]): Lead[] {
  if (filters.length === 0) return leads;
  return leads.filter((lead) => filters.every((f) => matchesFilter(lead, f)));
}

function generateCsv(
  leads: Lead[],
  dynFields: LeadFieldDefinition[]
): string {
  const headers = [
    "ID",
    "Display Name",
    ...dynFields.map((f) => f.label),
    "Score",
    "Status",
    "Email",
    "Phone",
    "Website",
  ];

  const escape = (v: string) =>
    v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;

  const rows = leads.map((lead) => {
    const displayName = lead.displayName || getLeadDisplayName({
      displayName: lead.displayName,
      rawData: lead.rawData ?? undefined,
      mappedData: lead.mappedData ?? undefined,
    });

    const values = [
      String(lead.id),
      displayName,
      ...dynFields.map((f) => formatFieldValue(resolveFieldValue(lead, f.id), f.type)),
      String(lead.score ?? 0),
      lead.status,
      lead.email || "",
      lead.phone || "",
      lead.website || "",
    ];

    return values.map(escape).join(",");
  });

  return [headers.map(escape).join(","), ...rows].join("\n");
}

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCampaignId = searchParams.get("campaign")
    ? parseInt(searchParams.get("campaign")!)
    : null;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [aiQuery, setAiQuery] = useState("");
  const [aiFilters, setAiFilters] = useState<LeadFilter[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(data));
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) {
      setSelectedCampaign(null);
      setLeads([]);
      setTotal(0);
      return;
    }
    fetch(`/api/campaigns/${selectedCampaignId}`)
      .then((r) => r.json())
      .then((data) => {
        setSelectedCampaign({
          id: data.id,
          name: data.name,
          leadFieldDefinitions: data.leadFieldDefinitions || [],
        });
      });
  }, [selectedCampaignId]);

  const loadLeads = useCallback(() => {
    if (!selectedCampaignId) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("campaignId", String(selectedCampaignId));
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("limit", "500");
    fetch(`/api/leads?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLeads(d.leads);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [selectedCampaignId, statusFilter]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleCampaignChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "none") {
      params.delete("campaign");
    } else {
      params.set("campaign", value);
    }
    setAiFilters([]);
    setAiQuery("");
    router.push(`/leads?${params.toString()}`);
  };

  const handleAiFilter = async () => {
    if (!aiQuery.trim() || !selectedCampaignId) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/leads/ai-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery, campaignId: selectedCampaignId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Filter generation failed");
      }
      const data = await res.json();
      setAiFilters(data.filters || []);
      if (data.filters?.length === 0) {
        toast.info("No filters could be generated from that query");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate filters");
    } finally {
      setAiLoading(false);
    }
  };

  const removeFilter = (filterId: string) => {
    setAiFilters((prev) => prev.filter((f) => f.id !== filterId));
  };

  const clearAllFilters = () => {
    setAiFilters([]);
    setAiQuery("");
  };

  const updateLeadStatus = async (id: number, newStatus: string) => {
    await fetch(`/api/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    toast.success(`Lead updated to ${newStatus}`);
    loadLeads();
  };

  const handleExportCsv = () => {
    const dynFields = selectedCampaign?.leadFieldDefinitions || [];
    const csv = generateCsv(filtered, dynFields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${selectedCampaign?.name || "export"}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} leads to CSV`);
  };

  const filtered = applyFilters(leads, aiFilters);
  const dynFields = selectedCampaign?.leadFieldDefinitions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leads</h1>
          <p className="text-muted-foreground">
            {selectedCampaign
              ? `${filtered.length} of ${total} leads in ${selectedCampaign.name}`
              : "Select a campaign to view leads"}
          </p>
        </div>
        {selectedCampaign && filtered.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <Select
          value={selectedCampaignId ? String(selectedCampaignId) : "none"}
          onValueChange={handleCampaignChange}
        >
          <SelectTrigger className="w-64">
            <div className="flex items-center gap-2 truncate">
              <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Select campaign" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select campaign...</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedCampaign && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedCampaign && (
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAiFilter();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder='Filter with AI, e.g. "leads with more than 1000 followers that are business accounts"'
                className="pl-10"
                disabled={aiLoading}
              />
            </div>
            <Button type="submit" disabled={aiLoading || !aiQuery.trim()} className="gap-2">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Filter
            </Button>
          </form>

          {aiFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
              {aiFilters.map((f) => (
                <Badge
                  key={f.id}
                  variant="secondary"
                  className="gap-1 pl-2.5 pr-1 py-1"
                >
                  {f.label}
                  <button
                    onClick={() => removeFilter(f.id)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <button
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {!selectedCampaign ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Target className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-1">Select a campaign to view its leads</p>
            <p className="text-sm text-muted-foreground/70">
              Each campaign has its own dynamic lead fields and data columns
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {aiFilters.length > 0
                ? "No leads match the current filters"
                : "No leads found in this campaign"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Name</TableHead>
                    {dynFields.map((f) => (
                      <TableHead key={f.id} className="min-w-[120px]">
                        {f.label}
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[70px]">Score</TableHead>
                    <TableHead className="min-w-[80px]">Cost</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => {
                    const displayName = lead.displayName || getLeadDisplayName({
                      displayName: lead.displayName,
                      rawData: lead.rawData ?? undefined,
                      mappedData: lead.mappedData ?? undefined,
                    });

                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="overflow-hidden">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="font-medium hover:underline break-words line-clamp-2"
                          >
                            {displayName}
                          </Link>
                        </TableCell>
                        {dynFields.map((f) => {
                          const val = formatFieldValue(resolveFieldValue(lead, f.id), f.type);
                          if ((f.type === "url" || val.startsWith("http")) && val !== "—") {
                            return (
                              <TableCell key={f.id} className="text-xs truncate max-w-[180px]">
                                <a
                                  href={val}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {val.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                                </a>
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={f.id} className="text-sm truncate max-w-[180px]">
                              {val}
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <ScoreBadgeCompact score={lead.score} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {((lead.llmCostUsd ?? 0) + (lead.apifyCostUsd ?? 0)) > 0
                            ? `$${((lead.llmCostUsd ?? 0) + (lead.apifyCostUsd ?? 0)).toFixed(4)}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="focus:outline-none">
                                <Badge
                                  className={`${statusColors[lead.status] || ""} cursor-pointer hover:opacity-80 transition-opacity`}
                                >
                                  {lead.status}
                                </Badge>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {STATUS_OPTIONS.map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => updateLeadStatus(lead.id, s)}
                                  disabled={s === lead.status}
                                >
                                  <Badge className={`${statusColors[s] || ""} mr-2`}>
                                    {s}
                                  </Badge>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
