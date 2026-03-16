"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  Cpu,
  Cloud,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface CostData {
  totals: {
    apifyCost: number;
    llmCost: number;
    totalCost: number;
  };
  byModel: Array<{
    model: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  byCampaign: Array<{
    campaignId: number;
    campaignName: string;
    apifyCost: number;
    llmCost: number;
    totalCost: number;
  }>;
  byOperation: Array<{
    operation: string;
    cost: number;
    count: number;
  }>;
  recentRuns: Array<{
    id: number;
    actorId: string;
    campaignId: number | null;
    status: string;
    costUsd: number | null;
    resultCount: number;
    startedAt: string;
  }>;
}

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

const OPERATION_LABELS: Record<string, string> = {
  "campaign-planning": "Campaign Planning",
  "field-suggestion": "Field Suggestion",
  "ai-filter": "AI Filter",
  "actor-validation": "Actor Validation",
  "profile-generation": "Profile Generation",
};

function formatCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null);

  useEffect(() => {
    fetch("/api/costs").then((r) => r.json()).then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading cost data...</div>
      </div>
    );
  }

  const { totals } = data;

  const providerPieData = [
    { name: "Apify", value: totals.apifyCost },
    ...data.byModel.map((m) => ({ name: m.model, value: m.cost })),
  ].filter((d) => d.value > 0);

  const campaignsWithCost = data.byCampaign.filter((c) => c.totalCost > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Costs</h1>
        <p className="text-muted-foreground">
          Breakdown of Apify and LLM costs across all campaigns
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-3xl font-bold">{formatCost(totals.totalCost)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Apify Cost</p>
                <p className="text-3xl font-bold">{formatCost(totals.apifyCost)}</p>
              </div>
              <Cloud className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">LLM Cost</p>
                <p className="text-3xl font-bold">{formatCost(totals.llmCost)}</p>
              </div>
              <Cpu className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {providerPieData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No costs recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={providerPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${formatCost(value)}`}
                  >
                    {providerPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCost(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LLM Cost by Model</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No LLM usage yet.</p>
            ) : (
              <div className="space-y-4">
                {data.byModel.map((m) => (
                  <div key={m.model} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium font-mono">{m.model}</span>
                      <span className="text-sm font-bold">{formatCost(m.cost)}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Input: {formatTokens(m.inputTokens)} tokens</span>
                      <span>Output: {formatTokens(m.outputTokens)} tokens</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${totals.llmCost > 0 ? (m.cost / totals.llmCost) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {campaignsWithCost.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost by Campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={campaignsWithCost}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="campaignName" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value: number) => formatCost(value)} />
                  <Bar dataKey="apifyCost" name="Apify" fill="#3b82f6" stackId="cost" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="llmCost" name="LLM" fill="#22c55e" stackId="cost" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Apify</TableHead>
                  <TableHead className="text-right">LLM</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignsWithCost.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell className="font-medium">{c.campaignName}</TableCell>
                    <TableCell className="text-right">{formatCost(c.apifyCost)}</TableCell>
                    <TableCell className="text-right">{formatCost(c.llmCost)}</TableCell>
                    <TableCell className="text-right font-bold">{formatCost(c.totalCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.byOperation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>LLM Cost by Operation</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byOperation.map((o) => (
                  <TableRow key={o.operation}>
                    <TableCell>{OPERATION_LABELS[o.operation] ?? o.operation}</TableCell>
                    <TableCell className="text-right">{o.count}</TableCell>
                    <TableCell className="text-right">{formatCost(o.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.recentRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Apify Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Results</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentRuns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-mono">{r.actorId.split("/").pop()}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "succeeded" ? "default" : r.status === "running" ? "secondary" : "destructive"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.resultCount}</TableCell>
                    <TableCell className="text-right">{r.costUsd != null ? formatCost(r.costUsd) : "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(r.startedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
