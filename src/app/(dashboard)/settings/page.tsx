"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, CheckCircle2, Sparkles, Loader2, KeyRound, Gauge, Building2 } from "lucide-react";
import { ActorManager } from "@/components/settings/actor-manager";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingRow {
  key: string;
  value: string;
}

interface SettingField {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
}

interface SettingGroup {
  title: string;
  description: string;
  fields: SettingField[];
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [savingGroup, setSavingGroup] = useState(false);
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({});
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingRow[]) => {
        const map: Record<string, string> = {};
        data.forEach((s) => { map[s.key] = s.value; });
        setSettings(map);
      });

    fetch("/api/settings/env-status")
      .then((r) => r.json())
      .then(setEnvStatus)
      .catch(() => {});
  }, []);

  const saveGroup = async (groupTitle: string, fields: { key: string }[]) => {
    setSavingGroup(true);
    try {
      for (const field of fields) {
        if (settings[field.key] !== undefined) {
          await fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: field.key, value: settings[field.key] || "" }),
          });
        }
      }
      toast.success(`${groupTitle} saved`);
    } catch {
      toast.error(`Failed to save ${groupTitle.toLowerCase()}`);
    } finally {
      setSavingGroup(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiContext.trim()) return;
    setAiGenerating(true);
    try {
      const res = await fetch("/api/settings/generate-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: aiContext }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const profile = await res.json();

      const keysToUpdate: string[] = [];
      const updated = { ...settings };
      for (const [key, value] of Object.entries(profile)) {
        if (typeof value === "string" && value.trim()) {
          updated[key] = value;
          keysToUpdate.push(key);
        }
      }
      setSettings(updated);

      for (const key of keysToUpdate) {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: updated[key] }),
        });
      }

      toast.success(`Updated ${keysToUpdate.length} profile fields`);
      setAiDialogOpen(false);
      setAiContext("");
    } catch {
      toast.error("Failed to generate profile");
    } finally {
      setAiGenerating(false);
    }
  };

  const settingGroups: SettingGroup[] = [
    {
      title: "API Keys",
      description: "Configure your API keys and AI provider",
      fields: [
        { key: "apify_token", label: "Apify Token", type: "password" },
        { key: "openai_api_key", label: "OpenAI API Key", type: "password" },
        { key: "anthropic_api_key", label: "Anthropic API Key", type: "password" },
        { key: "ai_provider", label: "Default AI Provider", type: "select", options: [{ value: "openai", label: "OpenAI (GPT-4o)" }, { value: "anthropic", label: "Anthropic (Claude)" }] },
      ],
    },
    {
      title: "Enrichment",
      description: "Configure how leads are enriched across all campaigns",
      fields: [
        { key: "enrichment_concurrency", label: "Parallel Enrichment Limit", type: "text", placeholder: "1", helpText: "How many leads to enrich simultaneously. Higher values speed up enrichment but use more Apify credits concurrently. Default: 1 (sequential)." },
      ],
    },
    {
      title: "Agency Profile",
      description: "Configure your agency details for lead scoring and enrichment",
      fields: [
        { key: "agency_name", label: "Agency Name", type: "text" },
        { key: "agency_type", label: "Agency Type", type: "select", options: [{ value: "general", label: "General" }, { value: "voice_ai", label: "Voice AI" }, { value: "ai_automation", label: "AI Automation" }, { value: "marketing", label: "Marketing" }, { value: "web_dev", label: "Web Development" }] },
        { key: "agency_description", label: "Agency Description", type: "textarea", placeholder: "What your agency does, your pitch, unique approach..." },
        { key: "agency_services", label: "Services", type: "textarea", placeholder: "Key services you offer, e.g. voice AI assistants, AI phone handling..." },
        { key: "agency_results", label: "Results & Case Studies", type: "textarea", placeholder: "Case studies, results, social proof, e.g. helped 40+ dental practices automate 80% of calls..." },
        { key: "agency_target_industries", label: "Target Industries", type: "text", placeholder: "e.g. dental, healthcare, real estate, restaurants" },
        { key: "agency_website", label: "Agency Website", type: "text", placeholder: "https://youragency.com" },
      ],
    },
  ];

  const groupIcons: Record<string, React.ReactNode> = {
    "API Keys": <KeyRound className="h-4 w-4 text-muted-foreground" />,
    "Enrichment": <Gauge className="h-4 w-4 text-muted-foreground" />,
    "Agency Profile": <Building2 className="h-4 w-4 text-muted-foreground" />,
  };

  const renderGroupCard = (group: SettingGroup) => (
    <Card key={group.title}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {groupIcons[group.title]}
            <CardTitle>{group.title}</CardTitle>
          </div>
          {group.title === "Agency Profile" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAiDialogOpen(true)}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{group.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {group.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <div className="flex items-center gap-2">
              <Label>{field.label}</Label>
              {envStatus[field.key] && (
                <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700 text-xs font-normal dark:border-green-700 dark:bg-green-950 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Already set via .env
                </Badge>
              )}
            </div>
            {field.type === "textarea" ? (
              <Textarea
                value={settings[field.key] || ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder || ""}
                rows={3}
                className="min-h-[72px]"
              />
            ) : field.type === "select" ? (
              <select
                value={settings[field.key] || ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <Input
                type={field.type}
                value={settings[field.key] || ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                }
                placeholder={envStatus[field.key] ? "Override .env value..." : field.placeholder || (field.type === "password" ? "Enter value..." : "")}
              />
            )}
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          </div>
        ))}

        <Button
          onClick={() => saveGroup(group.title, group.fields)}
          disabled={savingGroup}
          className="w-full gap-2"
        >
          {savingGroup ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            <><Save className="h-4 w-4" /> Save {group.title}</>
          )}
        </Button>
      </CardContent>
    </Card>
  );

  const apiKeysGroup = settingGroups.find((g) => g.title === "API Keys")!;
  const enrichmentGroup = settingGroups.find((g) => g.title === "Enrichment")!;
  const profileGroup = settingGroups.find((g) => g.title === "Agency Profile")!;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure API keys and agency profile
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {renderGroupCard(apiKeysGroup)}
          {renderGroupCard(enrichmentGroup)}
        </div>

        <div className="space-y-6">
          {renderGroupCard(profileGroup)}
        </div>
      </div>

      <ActorManager />

      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Agency Profile with AI</DialogTitle>
            <DialogDescription>
              Paste any context about your agency — website copy, about page, pitch notes, or just describe what you do. AI will extract and fill in your profile fields.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={aiContext}
            onChange={(e) => setAiContext(e.target.value)}
            placeholder="e.g. We're a voice AI agency that helps dental practices automate their phone calls. We've deployed AI receptionists for 40+ practices, reducing missed calls by 80%. Our main services are AI phone answering, appointment scheduling bots, and patient follow-up automation..."
            rows={8}
            className="min-h-[160px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAiGenerate}
              disabled={aiGenerating || !aiContext.trim()}
              className="gap-1.5"
            >
              {aiGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
