"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  TrendingUp,
  Target,
  DollarSign,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface Analytics {
  kpis: {
    totalLeads: number;
    totalCampaigns: number;
    activeCampaigns: number;
    convertedLeads: number;
    conversionRate: number;
    totalApifyCost: number;
    totalLlmCost: number;
    totalCost: number;
  };
  leadsBySource: { source: string; count: number }[];
  leadsByStatus: { status: string; count: number }[];
  scoreDistribution: { bucket: string; count: number }[];
  recentEvents: { id: number; eventType: string; createdAt: string; metadata: Record<string, unknown> }[];
}

const PIE_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];

export default function DashboardPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your lead generation pipeline
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Leads"
          value={kpis.totalLeads}
          icon={Users}
        />
        <KPICard
          title="Active Campaigns"
          value={kpis.activeCampaigns}
          icon={Target}
          subtitle={`${kpis.totalCampaigns} total`}
        />
        <KPICard
          title="Conversions"
          value={kpis.convertedLeads}
          icon={TrendingUp}
          subtitle={`${kpis.conversionRate}% rate`}
        />
        <KPICard
          title="Total Cost"
          value={`$${kpis.totalCost}`}
          icon={DollarSign}
          subtitle={`Apify: $${kpis.totalApifyCost} | LLM: $${kpis.totalLlmCost}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {data.leadsBySource.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leads yet. Create a campaign to get started.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data.leadsBySource.map((s) => ({ name: s.source.split("/").pop(), value: s.count }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {data.leadsBySource.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {data.scoreDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scored leads yet. Enrich leads to generate scores.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.scoreDistribution.map((s) => ({ name: s.bucket.split(" ")[0], count: s.count }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.leadsByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pipeline data yet.</p>
            ) : (
              <div className="space-y-3">
                {data.leadsByStatus.map((s) => {
                  const colors: Record<string, string> = {
                    new: "bg-blue-100 text-blue-800",
                    enriching: "bg-orange-100 text-orange-800",
                    qualified: "bg-green-100 text-green-800",
                    converted: "bg-emerald-100 text-emerald-800",
                    declined: "bg-red-100 text-red-800",
                    archived: "bg-gray-100 text-gray-800",
                  };
                  return (
                    <div key={s.status} className="flex items-center justify-between">
                      <Badge className={colors[s.status] || ""}>
                        {s.status}
                      </Badge>
                      <span className="text-sm font-medium">{s.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.recentEvents.slice(0, 10).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-mono text-xs">
                      {e.eventType.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <Icon className="h-8 w-8 text-muted-foreground/50" />
        </div>
      </CardContent>
    </Card>
  );
}
