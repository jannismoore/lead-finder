"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Search,
  Trash2,
  Pencil,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";

interface CustomActorRow {
  id: number;
  actorId: string;
  name: string;
  phase: "find" | "enrich";
  description: string | null;
  requiredInputFields: string[];
  inputFieldDescriptions: Record<string, { label: string; placeholder: string; type: string; helpText: string }>;
  defaultInput: Record<string, unknown>;
  pageLimitKey: string | null;
  isEnabled: boolean;
}

interface ValidatedActor {
  actorId: string;
  name: string;
  description: string;
  suggestedPhase: "find" | "enrich";
  classificationConfidence: "high" | "low";
  suggestedPageLimitKey?: string | null;
  inputFields: {
    key: string;
    title: string;
    type: string;
    description: string;
    isRequired: boolean;
    default?: unknown;
    editor?: string;
    prefill?: unknown;
    enum?: string[];
  }[];
}

interface InputFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  type: "string" | "string-array" | "number" | "boolean";
  helpText: string;
  included: boolean;
}

const BUILTIN_ACTORS = [
  { id: "compass/crawler-google-places", name: "Google Maps Scraper", phase: "find" as const },
  { id: "poidata/google-maps-email-extractor", name: "Google Maps Email Extractor", phase: "find" as const },
  { id: "apify/google-search-scraper", name: "Google Search Scraper", phase: "find" as const },
  { id: "vdrmota/contact-info-scraper", name: "Contact Info Scraper", phase: "enrich" as const },
  { id: "apify/facebook-pages-scraper", name: "Facebook Pages Scraper", phase: "enrich" as const },
  { id: "apify/instagram-profile-scraper", name: "Instagram Profile Scraper", phase: "enrich" as const },
];

export function ActorManager() {
  const [customActors, setCustomActors] = useState<CustomActorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActor, setEditingActor] = useState<CustomActorRow | null>(null);

  const loadActors = useCallback(async () => {
    try {
      const res = await fetch("/api/actors");
      if (res.ok) {
        setCustomActors(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadActors(); }, [loadActors]);

  const handleToggleEnabled = async (actor: CustomActorRow) => {
    try {
      await fetch(`/api/actors/${actor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !actor.isEnabled }),
      });
      setCustomActors((prev) =>
        prev.map((a) => a.id === actor.id ? { ...a, isEnabled: !a.isEnabled } : a)
      );
    } catch {
      toast.error("Failed to update actor");
    }
  };

  const handleDelete = async (actor: CustomActorRow) => {
    if (!confirm(`Remove "${actor.name}" from your custom actors?`)) return;
    try {
      await fetch(`/api/actors/${actor.id}`, { method: "DELETE" });
      setCustomActors((prev) => prev.filter((a) => a.id !== actor.id));
      toast.success(`Removed ${actor.name}`);
    } catch {
      toast.error("Failed to delete actor");
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingActor(null);
  };

  const handleSaved = () => {
    handleDialogClose();
    loadActors();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Apify Actors</CardTitle>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Custom Actor
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage scrapers and enrichment actors. Custom actors use AI to automatically map output data.
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="space-y-1">
          {BUILTIN_ACTORS.map((actor) => (
            <div
              key={actor.id}
              className="flex items-center justify-between rounded-md px-3 py-2 opacity-60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{actor.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{actor.id}</p>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 ml-2">
                {actor.phase === "find" ? "Find" : "Enrich"}
              </Badge>
            </div>
          ))}
        </div>

        {customActors.length > 0 && (
          <>
            <Separator className="my-3" />
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-1">Custom Actors</p>
            <div className="space-y-1">
              {customActors.map((actor) => (
                <div
                  key={actor.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Switch
                      size="sm"
                      checked={actor.isEnabled}
                      onCheckedChange={() => handleToggleEnabled(actor)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{actor.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{actor.actorId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge variant="outline">
                      {actor.phase === "find" ? "Find" : "Enrich"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditingActor(actor); setDialogOpen(true); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(actor)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>

      <AddActorDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSaved={handleSaved}
        editingActor={editingActor}
      />
    </Card>
  );
}

function AddActorDialog({
  open,
  onClose,
  onSaved,
  editingActor,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingActor: CustomActorRow | null;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [actorId, setActorId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<ValidatedActor | null>(null);
  const [validationError, setValidationError] = useState("");

  const [name, setName] = useState("");
  const [phase, setPhase] = useState<"find" | "enrich">("find");
  const [description, setDescription] = useState("");
  
  const [pageLimitKey, setPageLimitKey] = useState("");
  const [inputFields, setInputFields] = useState<InputFieldConfig[]>([]);
  const [defaultInput, setDefaultInput] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setActorId("");
      setValidated(null);
      setValidationError("");
      setName("");
      setPhase("find");
      setDescription("");
      setPageLimitKey("");
      setInputFields([]);
      setDefaultInput({});
      return;
    }

    if (editingActor) {
      setStep(2);
      setActorId(editingActor.actorId);
      setName(editingActor.name);
      setPhase(editingActor.phase);
      setDescription(editingActor.description || "");
      setPageLimitKey(editingActor.pageLimitKey || "");
      setValidated({ actorId: editingActor.actorId, name: editingActor.name, description: editingActor.description || "", suggestedPhase: editingActor.phase, classificationConfidence: "high", inputFields: [] });

      const fields: InputFieldConfig[] = (editingActor.requiredInputFields || []).map((key) => {
        const desc = editingActor.inputFieldDescriptions?.[key];
        return {
          key,
          label: desc?.label || key,
          placeholder: desc?.placeholder || "",
          type: (desc?.type as "string" | "string-array" | "number") || "string",
          helpText: desc?.helpText || "",
          included: true,
        };
      });
      setInputFields(fields);

      const defaults: Record<string, string> = {};
      for (const [k, v] of Object.entries(editingActor.defaultInput || {})) {
        defaults[k] = String(v);
      }
      setDefaultInput(defaults);
    }
  }, [open, editingActor]);

  const handleValidate = async () => {
    if (!actorId.trim()) return;
    setValidating(true);
    setValidationError("");
    setValidated(null);
    try {
      const res = await fetch("/api/actors/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: actorId.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        setValidationError(err.error || "Validation failed");
        return;
      }
      const data: ValidatedActor = await res.json();
      setValidated(data);
      setName(data.name);
      setDescription(data.description);
      setPhase(data.suggestedPhase);

      if (data.actorId) {
        setActorId(data.actorId);
      }

      const detectedLimitKey = data.suggestedPageLimitKey || null;
      const fields: InputFieldConfig[] = data.inputFields
        .slice(0, 20)
        .map((f) => {
          const exampleVal = f.default ?? f.prefill;
          let placeholder = "";
          if (f.enum && f.enum.length > 0) {
            placeholder = f.enum.join(", ");
          } else if (exampleVal !== undefined && exampleVal !== null) {
            if (Array.isArray(exampleVal)) {
              placeholder = exampleVal.join(", ");
            } else if (typeof exampleVal === "object") {
              placeholder = JSON.stringify(exampleVal);
            } else {
              placeholder = String(exampleVal);
            }
          }

          let helpText = f.description.slice(0, 200);
          if (f.enum && f.enum.length > 0) {
            helpText = helpText ? `${helpText} | Options: ${f.enum.join(", ")}` : `Options: ${f.enum.join(", ")}`;
          }

          const isLimitField = detectedLimitKey === f.key;

          return {
            key: f.key,
            label: f.title,
            placeholder,
            type: f.type === "array" || f.editor === "stringList" ? "string-array" as const
              : f.type === "integer" || f.type === "number" ? "number" as const
              : f.type === "boolean" ? "boolean" as const
              : "string" as const,
            helpText,
            included: f.isRequired || isLimitField,
          };
        });
      setInputFields(fields);

      const defaults: Record<string, string> = {};
      for (const f of data.inputFields) {
        const val = f.default ?? f.prefill;
        if (val !== undefined && val !== null) {
          defaults[f.key] = typeof val === "object" ? JSON.stringify(val) : String(val);
        } else if (f.enum && f.enum.length > 0 && !f.isRequired) {
          defaults[f.key] = f.enum[0];
        }
      }
      setDefaultInput(defaults);

      if (data.suggestedPageLimitKey) {
        setPageLimitKey(data.suggestedPageLimitKey);
      }
    } catch {
      setValidationError("Network error. Check your connection.");
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const includedFields = inputFields.filter((f) => f.included);
      const requiredInputFields = includedFields.map((f) => f.key);
      const inputFieldDescriptions: Record<string, { label: string; placeholder: string; type: string; helpText: string }> = {};
      for (const f of includedFields) {
        inputFieldDescriptions[f.key] = {
          label: f.label,
          placeholder: f.placeholder,
          type: f.type,
          helpText: f.helpText,
        };
      }

      const parsedDefaults: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(defaultInput)) {
        if (!v.trim()) continue;
        if (v === "true" || v === "false") {
          parsedDefaults[k] = v === "true";
        } else {
          const num = Number(v);
          parsedDefaults[k] = !isNaN(num) && v.trim() !== "" ? num : v;
        }
      }

      const payload = {
        actorId: actorId.trim(),
        name,
        phase,
        description,
        requiredInputFields: phase === "enrich" ? [] : requiredInputFields,
        inputFieldDescriptions: phase === "enrich" ? {} : inputFieldDescriptions,
        defaultInput: parsedDefaults,
        pageLimitKey: phase === "find" && pageLimitKey ? pageLimitKey : null,
      };

      const url = editingActor ? `/api/actors/${editingActor.id}` : "/api/actors";
      const method = editingActor ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save actor");
        return;
      }

      toast.success(editingActor ? `Updated ${name}` : `Added ${name}`);
      onSaved();
    } catch {
      toast.error("Failed to save actor");
    } finally {
      setSaving(false);
    }
  };

  const toggleField = (key: string) => {
    setInputFields((prev) =>
      prev.map((f) => f.key === key ? { ...f, included: !f.included } : f)
    );
  };

  const updateField = (key: string, updates: Partial<InputFieldConfig>) => {
    setInputFields((prev) =>
      prev.map((f) => f.key === key ? { ...f, ...updates } : f)
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingActor ? "Edit Custom Actor" : "Add Custom Actor"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Paste an Apify actor URL or ID to validate and configure it."
              : "Configure how this actor integrates with your lead finder."
            }
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Apify Actor URL or ID</Label>
              <div className="flex gap-2">
                <Input
                  value={actorId}
                  onChange={(e) => setActorId(e.target.value)}
                  placeholder="https://apify.com/username/actor-name"
                  onKeyDown={(e) => { if (e.key === "Enter") handleValidate(); }}
                />
                <Button onClick={handleValidate} disabled={validating || !actorId.trim()} className="shrink-0 gap-1.5">
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Validate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste a URL from <a href="https://apify.com/store" target="_blank" rel="noopener noreferrer" className="underline">apify.com/store</a> or enter an ID like <code className="text-xs">username/actor-name</code>
              </p>
            </div>

            {validationError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{validationError}</p>
              </div>
            )}

            {validated && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{validated.name}</p>
                    {validated.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{validated.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={validated.suggestedPhase === "find" ? "default" : "secondary"}>
                    {validated.suggestedPhase === "find" ? "Find Leads" : "Enrich Leads"}
                  </Badge>
                  {validated.classificationConfidence === "low" && (
                    <span className="text-xs text-muted-foreground">
                      (auto-detected -- you can change this)
                    </span>
                  )}
                </div>
                <Button className="w-full gap-1.5" onClick={() => setStep(2)}>
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {!editingActor && (
              <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1 -ml-2">
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}

            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Phase</Label>
              <Select value={phase} onValueChange={(v) => setPhase(v as "find" | "enrich")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="find">Find Leads (scraper)</SelectItem>
                  <SelectItem value="enrich">Enrich Leads (enrichment)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {phase === "find"
                  ? "Scrapers search broadly for new leads using keywords, locations, etc."
                  : "Enrichment actors take specific URLs/identifiers from existing leads to add more data."
                }
              </p>
            </div>

            {phase === "find" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label>Input Fields</Label>
                  <p className="text-xs text-muted-foreground">
                    Select which fields users should configure when using this actor. These appear in the campaign setup.
                  </p>
                  {inputFields.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-2">
                      No input fields detected. You can add them manually below.
                    </p>
                  )}
                  {inputFields.map((field) => (
                    <div key={field.key} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            size="sm"
                            checked={field.included}
                            onCheckedChange={() => toggleField(field.key)}
                          />
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{field.key}</code>
                        </div>
                        <Select
                          value={field.type}
                          onValueChange={(v) => updateField(field.key, { type: v as InputFieldConfig["type"] })}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">Text</SelectItem>
                            <SelectItem value="string-array">Text List</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {field.included && (
                        <div className="grid gap-2 pl-8">
                          <Input
                            value={field.label}
                            onChange={(e) => updateField(field.key, { label: e.target.value })}
                            placeholder="Field label"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={field.placeholder}
                            onChange={(e) => updateField(field.key, { placeholder: e.target.value })}
                            placeholder="Placeholder text"
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  <AddInputFieldInline
                    existingKeys={inputFields.map((f) => f.key)}
                    onAdd={(field) => setInputFields((prev) => [...prev, field])}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Result Limit Field</Label>
                  <Select value={pageLimitKey || "_none"} onValueChange={(v) => setPageLimitKey(v === "_none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {(() => {
                        const numberKeys = new Set(inputFields.filter((f) => f.type === "number").map((f) => f.key));
                        if (pageLimitKey && !numberKeys.has(pageLimitKey)) numberKeys.add(pageLimitKey);
                        return Array.from(numberKeys).map((key) => (
                          <SelectItem key={key} value={key}>{key}</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Which input field controls the max number of results? Users can adjust this per-campaign in actor config.
                  </p>
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-2">
              <Label>Default Input Values</Label>
              <p className="text-xs text-muted-foreground">
                Key-value pairs sent as defaults with every run.
              </p>
              {Object.entries(defaultInput).map(([key, value]) => (
                <div key={key} className="flex gap-2 items-center">
                  <Input
                    value={key}
                    className="h-8 text-xs font-mono w-1/3"
                    readOnly
                  />
                  <Input
                    value={value}
                    onChange={(e) => setDefaultInput((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setDefaultInput((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <AddDefaultInline
                existingKeys={Object.keys(defaultInput)}
                onAdd={(key, value) => setDefaultInput((prev) => ({ ...prev, [key]: value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {editingActor ? "Save Changes" : "Add Actor"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddInputFieldInline({
  existingKeys,
  onAdd,
}: {
  existingKeys: string[];
  onAdd: (field: InputFieldConfig) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");

  if (!adding) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add Field
      </Button>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Field key (e.g. searchQuery)"
        className="h-8 text-xs font-mono"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && key.trim() && !existingKeys.includes(key.trim())) {
            onAdd({ key: key.trim(), label: key.trim(), placeholder: "", type: "string", helpText: "", included: true });
            setKey("");
            setAdding(false);
          }
          if (e.key === "Escape") { setAdding(false); setKey(""); }
        }}
      />
      <Button
        size="sm"
        className="h-8"
        disabled={!key.trim() || existingKeys.includes(key.trim())}
        onClick={() => {
          onAdd({ key: key.trim(), label: key.trim(), placeholder: "", type: "string", helpText: "", included: true });
          setKey("");
          setAdding(false);
        }}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAdding(false); setKey(""); }}>
        Cancel
      </Button>
    </div>
  );
}

function AddDefaultInline({
  existingKeys,
  onAdd,
}: {
  existingKeys: string[];
  onAdd: (key: string, value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  if (!adding) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add Default
      </Button>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Key"
        className="h-8 text-xs font-mono w-1/3"
        autoFocus
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        className="h-8 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter" && key.trim() && !existingKeys.includes(key.trim())) {
            onAdd(key.trim(), value);
            setKey("");
            setValue("");
            setAdding(false);
          }
          if (e.key === "Escape") { setAdding(false); setKey(""); setValue(""); }
        }}
      />
      <Button
        size="sm"
        className="h-8"
        disabled={!key.trim() || existingKeys.includes(key.trim())}
        onClick={() => {
          onAdd(key.trim(), value);
          setKey("");
          setValue("");
          setAdding(false);
        }}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAdding(false); setKey(""); setValue(""); }}>
        Cancel
      </Button>
    </div>
  );
}
