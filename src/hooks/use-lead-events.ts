"use client";

import { useEffect, useRef, useCallback } from "react";
import type {
  LeadDiscoveredEvent,
  LeadKpiUpdatedEvent,
  LeadEnrichmentCompletedEvent,
  LeadStatusChangedEvent,
  CampaignDiscoveryStartedEvent,
  CampaignDiscoveryCompletedEvent,
  CampaignEnrichmentProgressEvent,
} from "@/lib/events/emitter";

interface LeadEventHandlers {
  onLeadDiscovered?: (data: LeadDiscoveredEvent) => void;
  onKpiUpdated?: (data: LeadKpiUpdatedEvent) => void;
  onEnrichmentCompleted?: (data: LeadEnrichmentCompletedEvent) => void;
  onStatusChanged?: (data: LeadStatusChangedEvent) => void;
  onDiscoveryStarted?: (data: CampaignDiscoveryStartedEvent) => void;
  onDiscoveryCompleted?: (data: CampaignDiscoveryCompletedEvent) => void;
  onEnrichmentProgress?: (data: CampaignEnrichmentProgressEvent) => void;
}

export function useLeadEvents(
  handlers: LeadEventHandlers,
  options?: { campaignId?: number; leadId?: number }
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const params = new URLSearchParams();
    if (optionsRef.current?.campaignId) {
      params.set("campaignId", String(optionsRef.current.campaignId));
    }
    const url = `/api/events/leads${params.toString() ? `?${params}` : ""}`;
    const es = new EventSource(url);

    es.addEventListener("lead:discovered", (e) => {
      const data = JSON.parse(e.data) as LeadDiscoveredEvent;
      handlersRef.current.onLeadDiscovered?.(data);
    });

    es.addEventListener("lead:kpi-updated", (e) => {
      const data = JSON.parse(e.data) as LeadKpiUpdatedEvent;
      if (optionsRef.current?.leadId && data.leadId !== optionsRef.current.leadId) return;
      handlersRef.current.onKpiUpdated?.(data);
    });

    es.addEventListener("lead:enrichment-completed", (e) => {
      const data = JSON.parse(e.data) as LeadEnrichmentCompletedEvent;
      if (optionsRef.current?.leadId && data.leadId !== optionsRef.current.leadId) return;
      handlersRef.current.onEnrichmentCompleted?.(data);
    });

    es.addEventListener("lead:status-changed", (e) => {
      const data = JSON.parse(e.data) as LeadStatusChangedEvent;
      if (optionsRef.current?.leadId && data.leadId !== optionsRef.current.leadId) return;
      handlersRef.current.onStatusChanged?.(data);
    });

    es.addEventListener("campaign:discovery-started", (e) => {
      const data = JSON.parse(e.data) as CampaignDiscoveryStartedEvent;
      handlersRef.current.onDiscoveryStarted?.(data);
    });

    es.addEventListener("campaign:discovery-completed", (e) => {
      const data = JSON.parse(e.data) as CampaignDiscoveryCompletedEvent;
      handlersRef.current.onDiscoveryCompleted?.(data);
    });

    es.addEventListener("campaign:enrichment-progress", (e) => {
      const data = JSON.parse(e.data) as CampaignEnrichmentProgressEvent;
      handlersRef.current.onEnrichmentProgress?.(data);
    });

    es.onerror = () => {
      es.close();
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    return es;
  }, []);

  useEffect(() => {
    const es = connect();
    return () => {
      es.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connect]);
}
