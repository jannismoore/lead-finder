"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { type ActorDefinition } from "@/lib/apify/registry";
import { useActors } from "@/hooks/use-actors";
import { toast } from "sonner";
import { Sparkles, Loader2, ArrowLeft, CheckCircle2, Pencil, Search, Zap, BarChart3, Plus, X, ToggleLeft, Type, Database, Hash, Link2, ToggleRight } from "lucide-react";
import type { KpiDefinition, LeadFieldDefinition } from "@/lib/db/schema";

interface CampaignPlan {
  targetNiche: string;
  suggestedSearchTerms: string[];
  suggestedActorConfigs?: Record<string, Record<string, string>>;
  scheduleFrequency: "once" | "daily" | "weekly";
  autoEnrich: boolean;
  reasoning: string;
  suggestedKpis?: KpiDefinition[];
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { getActorById, getActorsByPhase } = useActors();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiProvider, setAiProvider] = useState<"openai" | "anthropic">("openai");
  const [planning, setPlanning] = useState(false);
  const [creating, setCreating] = useState(false);

  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [editableNiche, setEditableNiche] = useState("");
  const [editableSchedule, setEditableSchedule] = useState<"once" | "daily" | "weekly">("once");
  const [editableAutoEnrich, setEditableAutoEnrich] = useState(true);

  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [editableActorConfigs, setEditableActorConfigs] = useState<Record<string, Record<string, string>>>({});
  const [leadFields, setLeadFields] = useState<LeadFieldDefinition[]>([]);
  const [suggestingFields, setSuggestingFields] = useState(false);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { key: string; value: string }[]) => {
        const providerSetting = data.find((s) => s.key === "ai_provider");
        if (providerSetting?.value === "anthropic") setAiProvider("anthropic");
      })
      .catch(() => {});
  }, []);

  const findActors = getActorsByPhase("find");
  const enrichActors = getActorsByPhase("enrich");

  const handlePlan = async () => {
    if (!name.trim() || !description.trim()) {
      toast.error("Please provide a campaign name and description");
      return;
    }
    setPlanning(true);
    try {
      const allActors = [...findActors, ...enrichActors];
      const actorSummaries = allActors.map((a) => ({
        id: a.id,
        name: a.name,
        phase: a.phase,
        fields: Object.keys(a.inputFieldDescriptions || {}).map((key) => {
          const desc = a.inputFieldDescriptions?.[key];
          return {
            key,
            label: desc?.label || key,
            type: desc?.type || "string",
            helpText: desc?.helpText,
          };
        }),
      }));

      const res = await fetch("/api/campaigns/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, actors: actorSummaries }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to plan campaign");
      }
      const result: CampaignPlan = await res.json();
      setPlan(result);
      setEditableNiche(result.targetNiche);
      setEditableSchedule(result.scheduleFrequency);
      setEditableAutoEnrich(result.autoEnrich);
      if (result.suggestedKpis?.length) setKpis(result.suggestedKpis);

      const initConfigs: Record<string, Record<string, string>> = {};
      if (result.suggestedActorConfigs) {
        for (const [actorId, fields] of Object.entries(result.suggestedActorConfigs)) {
          initConfigs[actorId] = {};
          for (const [key, val] of Object.entries(fields)) {
            initConfigs[actorId][key] = String(val);
          }
        }
      }
      for (const actor of allActors) {
        if (!initConfigs[actor.id]) {
          initConfigs[actor.id] = {};
        }
      }
      setEditableActorConfigs(initConfigs);

      setStep(2);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setPlanning(false);
    }
  };

  const toggleActor = (actorId: string) => {
    setSelectedActors((prev) => {
      const next = new Set(prev);
      if (next.has(actorId)) {
        next.delete(actorId);
      } else {
        next.add(actorId);
      }
      return next;
    });
  };

  const buildActorConfigs = (): Record<string, Record<string, unknown>> => {
    const configs: Record<string, Record<string, unknown>> = {};
    for (const actorId of selectedActors) {
      const actorDef = getActorById(actorId);
      if (!actorDef) continue;

      const input: Record<string, unknown> = { ...(actorDef.defaultInput || {}) };
      const editedFields = editableActorConfigs[actorId] || {};

      for (const [fieldName, rawValue] of Object.entries(editedFields)) {
        const desc = actorDef.inputFieldDescriptions?.[fieldName];
        if (!rawValue.trim()) continue;

        if (desc?.type === "boolean") {
          input[fieldName] = rawValue === "true";
        } else if (desc?.type === "string-array") {
          input[fieldName] = rawValue.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
        } else if (desc?.type === "number") {
          input[fieldName] = Number(rawValue) || 0;
        } else {
          input[fieldName] = rawValue;
        }
      }
      configs[actorId] = input;
    }
    return configs;
  };

  const handleGoToStep3 = async () => {
    const selectedFindActors = [...selectedActors].filter((id) => {
      const a = getActorById(id);
      return a && a.phase === "find";
    });
    if (selectedFindActors.length === 0) {
      toast.error("Select at least one actor to find leads");
      return;
    }
    setStep(3);

    if (leadFields.length > 0) return;

    setSuggestingFields(true);
    try {
      const actorSummaries = [...selectedActors].map((id) => {
        const a = getActorById(id);
        return {
          id,
          name: a?.name || id,
          phase: a?.phase || "find" as const,
          description: a?.description || "",
        };
      });

      const res = await fetch("/api/campaigns/suggest-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, actors: actorSummaries }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.leadFields?.length) setLeadFields(data.leadFields);
      }
    } catch {
      // non-blocking — user can still add fields manually
    } finally {
      setSuggestingFields(false);
    }
  };

  const handleGoToStep4 = () => {
    setStep(4);
  };

  const handleCreate = async () => {
    if (!plan) return;

    setCreating(true);
    try {
      const actorConfigs = buildActorConfigs();
      const allSelectedActors = [...selectedActors];

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          targetNiche: editableNiche,
          aiProvider,
          apifyActors: allSelectedActors,
          actorConfigs,
          kpiDefinitions: kpis,
          leadFieldDefinitions: leadFields,
          scheduleFrequency: editableSchedule,
          autoEnrich: editableAutoEnrich,
          status: "active",
        }),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      const campaign = await res.json();
      toast.success("Campaign created");
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCreating(false);
    }
  };

  const setActorFieldValue = (actorId: string, field: string, value: string) => {
    setEditableActorConfigs((prev) => ({
      ...prev,
      [actorId]: { ...(prev[actorId] || {}), [field]: value },
    }));
  };

  const addLeadField = () => {
    setLeadFields((prev) => [
      ...prev,
      { id: `field_${Date.now()}`, label: "", type: "text" },
    ]);
  };

  const removeLeadField = (id: string) => {
    setLeadFields((prev) => prev.filter((f) => f.id !== id));
  };

  const updateLeadField = (id: string, updates: Partial<LeadFieldDefinition>) => {
    setLeadFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const addKpi = () => {
    setKpis((prev) => [
      ...prev,
      { id: `kpi_${Date.now()}`, label: "", type: "text" },
    ]);
  };

  const removeKpi = (id: string) => {
    setKpis((prev) => prev.filter((k) => k.id !== id));
  };

  const updateKpi = (id: string, updates: Partial<KpiDefinition>) => {
    setKpis((prev) =>
      prev.map((k) => (k.id === id ? { ...k, ...updates } : k))
    );
  };

  const renderActorCard = (actor: ActorDefinition, isSelected: boolean) => {
    const fields = editableActorConfigs[actor.id] || {};

    return (
      <div
        key={actor.id}
        className={`rounded-lg border-2 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
      >
        <div
          className="flex cursor-pointer items-center gap-3 p-4"
          onClick={() => toggleActor(actor.id)}
        >
          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
            {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{actor.name}</p>
            <p className="text-xs text-muted-foreground">{actor.description}</p>
          </div>
          <Badge variant="outline" className="capitalize text-xs">{actor.category}</Badge>
        </div>

        {isSelected && (
          <div className="border-t px-4 pb-4 pt-3 space-y-3">
            {Object.keys(actor.inputFieldDescriptions || {}).map((fieldName) => {
              const desc = actor.inputFieldDescriptions?.[fieldName];
              const value = fields[fieldName] || "";

              return (
                <div key={fieldName} className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    {desc?.label || fieldName}
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  {desc?.type === "boolean" ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={value === "true"}
                        onCheckedChange={(checked) => setActorFieldValue(actor.id, fieldName, checked ? "true" : "false")}
                      />
                      <span className="text-sm text-muted-foreground">{value === "true" ? "Yes" : "No"}</span>
                    </div>
                  ) : desc?.type === "string-array" ? (
                    <Textarea
                      value={value}
                      onChange={(e) => setActorFieldValue(actor.id, fieldName, e.target.value)}
                      placeholder={desc?.placeholder}
                      rows={3}
                      className="resize-none text-sm"
                    />
                  ) : (
                    <Input
                      value={value}
                      onChange={(e) => setActorFieldValue(actor.id, fieldName, e.target.value)}
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
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3 | 4) : router.push("/campaigns")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">New Campaign</h1>
          <p className="text-muted-foreground">
            {step === 1 ? "Describe what leads you want to find" : step === 2 ? "Configure actors and settings" : step === 3 ? "Configure lead data fields" : "Review KPIs and create your campaign"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {step > 1 ? <CheckCircle2 className="h-4 w-4" /> : "1"}
        </div>
        <span className={`text-sm ${step >= 1 ? "font-medium" : "text-muted-foreground"}`}>Describe</span>
        <div className="h-px flex-1 bg-border" />
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {step > 2 ? <CheckCircle2 className="h-4 w-4" /> : "2"}
        </div>
        <span className={`text-sm ${step >= 2 ? "font-medium" : "text-muted-foreground"}`}>Actors</span>
        <div className="h-px flex-1 bg-border" />
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {step > 3 ? <CheckCircle2 className="h-4 w-4" /> : "3"}
        </div>
        <span className={`text-sm ${step >= 3 ? "font-medium" : "text-muted-foreground"}`}>Lead Fields</span>
        <div className="h-px flex-1 bg-border" />
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step >= 4 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          4
        </div>
        <span className={`text-sm ${step >= 4 ? "font-medium" : "text-muted-foreground"}`}>KPIs & Create</span>
      </div>

      {/* Step 1: Describe */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Describe Your Campaign
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                placeholder="e.g., Miami Dentists Q1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">What leads do you want to find?</Label>
              <Textarea
                id="description"
                placeholder={"Describe in plain English what you're looking for. For example:\n\nFind dentists and orthodontists in Miami FL. I need their email addresses, phone numbers, and websites. Focus on practices with good ratings that might need help with their online presence."}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Be specific about the business type, location, and what information you need. AI will generate search terms and campaign settings for you.
              </p>
            </div>

            <Button
              className="w-full"
              onClick={handlePlan}
              disabled={planning || !name.trim() || !description.trim()}
            >
              {planning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI is analyzing your campaign...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Plan Campaign with AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Actors & Create */}
      {step === 2 && plan && (
        <div className="space-y-4">
          {/* AI Reasoning */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">AI Recommendation</p>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.reasoning}</p>
                  {plan.suggestedSearchTerms.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Suggested search terms (pre-filled in actors below):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {plan.suggestedSearchTerms.map((term, i) => (
                          <Badge key={i} variant="secondary" className="text-xs font-normal">{term}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Target Niche</Label>
                <Input value={editableNiche} onChange={(e) => setEditableNiche(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Select value={editableSchedule} onValueChange={(v) => setEditableSchedule(v as "once" | "daily" | "weekly")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Run Once</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <div className="space-y-2">
                    <Label>Auto-Enrich Leads</Label>
                    <div className="flex items-center gap-2">
                      <Switch checked={editableAutoEnrich} onCheckedChange={setEditableAutoEnrich} />
                      <span className="text-sm text-muted-foreground">
                        {editableAutoEnrich ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Find Leads - Discovery Actors */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Step 1 — Find Leads</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Select which tools to use for discovering leads. These run first to find businesses matching your criteria.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {findActors.map((actor) => renderActorCard(actor, selectedActors.has(actor.id)))}
            </CardContent>
          </Card>

          {/* Enrich Leads - Enrichment Actors */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Step 2 — Enrich Leads</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Select which tools to use for enriching leads with additional data. These run after discovery to gather contact info, website content, and data for AI scoring.
                {editableAutoEnrich
                  ? " Enrichment runs automatically after discovery."
                  : " Enrichment can be triggered manually from the campaign page."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {enrichActors.map((actor) => (
                <div
                  key={actor.id}
                  className={`rounded-lg border-2 transition-colors cursor-pointer ${selectedActors.has(actor.id) ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
                  onClick={() => toggleActor(actor.id)}
                >
                  <div className="flex items-center gap-3 p-4">
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${selectedActors.has(actor.id) ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                      {selectedActors.has(actor.id) && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{actor.name}</p>
                      <p className="text-xs text-muted-foreground">{actor.description}</p>
                    </div>
                    <Badge variant="outline" className="capitalize text-xs">{actor.category}</Badge>
                  </div>
                  {selectedActors.has(actor.id) && (
                    <div className="border-t px-4 py-2.5">
                      <p className="text-xs text-muted-foreground">Inputs filled automatically from lead data during enrichment</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Next button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleGoToStep3}
            disabled={selectedActors.size === 0}
          >
            Next: Configure Lead Fields
          </Button>
        </div>
      )}

      {/* Step 3: Lead Fields */}
      {step === 3 && plan && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Lead Data Fields</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={addLeadField} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Field
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {suggestingFields
                  ? "AI is analyzing your actors to suggest relevant fields..."
                  : "These fields will be extracted from each lead based on the actors you selected. Remove any you don't need."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestingFields ? (
                <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing actor outputs...
                </div>
              ) : leadFields.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No additional lead fields configured. Click &quot;Add Field&quot; to track extra data per lead.
                </div>
              ) : (
                leadFields.map((field) => (
                  <div key={field.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={field.label}
                          onChange={(e) => updateLeadField(field.id, { label: e.target.value })}
                          placeholder="Field label, e.g. Instagram Handle"
                          className="font-medium"
                        />
                        <Input
                          value={field.description || ""}
                          onChange={(e) => updateLeadField(field.id, { description: e.target.value })}
                          placeholder="Description (optional)"
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant={field.type === "text" ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateLeadField(field.id, { type: "text" })}
                          className="gap-1 h-8 px-2"
                          title="Text value"
                        >
                          <Type className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={field.type === "number" ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateLeadField(field.id, { type: "number" })}
                          className="gap-1 h-8 px-2"
                          title="Number value"
                        >
                          <Hash className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={field.type === "boolean" ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateLeadField(field.id, { type: "boolean" })}
                          className="gap-1 h-8 px-2"
                          title="Yes/No flag"
                        >
                          <ToggleRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={field.type === "url" ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateLeadField(field.id, { type: "url" })}
                          className="gap-1 h-8 px-2"
                          title="URL"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLeadField(field.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleGoToStep4}
          >
            Next: Configure KPIs
          </Button>
        </div>
      )}

      {/* Step 4: KPIs & Create */}
      {step === 4 && plan && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Lead KPIs to Track</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={addKpi} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add KPI
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                These KPIs will be automatically filled by AI during lead enrichment. You can edit them per-lead later.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {kpis.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No KPIs configured. Click &quot;Add KPI&quot; to track custom metrics for your leads.
                </div>
              ) : (
                kpis.map((kpi) => (
                  <div key={kpi.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={kpi.label}
                          onChange={(e) => updateKpi(kpi.id, { label: e.target.value })}
                          placeholder="KPI label, e.g. Has online booking"
                          className="font-medium"
                        />
                        <Input
                          value={kpi.description || ""}
                          onChange={(e) => updateKpi(kpi.id, { description: e.target.value })}
                          placeholder="Description (optional)"
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant={kpi.type === "boolean" ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateKpi(kpi.id, { type: "boolean" })}
                          className="gap-1 h-8 px-2.5"
                          title="Yes/No flag"
                        >
                          <ToggleLeft className="h-3.5 w-3.5" /> Yes/No
                        </Button>
                        <Button
                          variant={kpi.type === "text" ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateKpi(kpi.id, { type: "text" })}
                          className="gap-1 h-8 px-2.5"
                          title="Free text value"
                        >
                          <Type className="h-3.5 w-3.5" /> Text
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeKpi(kpi.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating campaign...
              </>
            ) : (
              `Create Campaign${kpis.length > 0 ? ` with ${kpis.length} KPI${kpis.length > 1 ? "s" : ""}` : ""}`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
