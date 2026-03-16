import { EventEmitter } from "events";

export interface LeadKpiUpdatedEvent {
  leadId: number;
  campaignId: number;
  campaignKpis: Record<string, boolean | string>;
}

export interface LeadEnrichmentCompletedEvent {
  leadId: number;
  campaignId: number;
  score: number;
  status: string;
}

export interface LeadStatusChangedEvent {
  leadId: number;
  campaignId: number;
  status: string;
}

export interface LeadDiscoveredEvent {
  leadId: number;
  campaignId: number;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  rawData: Record<string, unknown> | null;
  mappedData: Record<string, unknown> | null;
  createdAt: string;
  source: string;
  index: number;
  totalItems: number;
}

export interface CampaignDiscoveryStartedEvent {
  campaignId: number;
  actorIds: string[];
}

export interface CampaignDiscoveryCompletedEvent {
  campaignId: number;
  totalInserted: number;
  totalDeduplicated: number;
}

export interface CampaignEnrichmentProgressEvent {
  campaignId: number;
  enriched: number;
  failed: number;
  remaining: number;
}

export type LeadEventMap = {
  "lead:discovered": LeadDiscoveredEvent;
  "lead:kpi-updated": LeadKpiUpdatedEvent;
  "lead:enrichment-completed": LeadEnrichmentCompletedEvent;
  "lead:status-changed": LeadStatusChangedEvent;
  "campaign:discovery-started": CampaignDiscoveryStartedEvent;
  "campaign:discovery-completed": CampaignDiscoveryCompletedEvent;
  "campaign:enrichment-progress": CampaignEnrichmentProgressEvent;
};

export type LeadEventType = keyof LeadEventMap;

class LeadEventEmitter {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<T extends LeadEventType>(event: T, data: LeadEventMap[T]) {
    this.emitter.emit(event, data);
  }

  on<T extends LeadEventType>(event: T, handler: (data: LeadEventMap[T]) => void) {
    this.emitter.on(event, handler);
    return () => {
      this.emitter.off(event, handler);
    };
  }

  off<T extends LeadEventType>(event: T, handler: (data: LeadEventMap[T]) => void) {
    this.emitter.off(event, handler);
  }
}

const globalForEmitter = globalThis as unknown as { leadEmitter?: LeadEventEmitter };
export const leadEmitter = globalForEmitter.leadEmitter ??= new LeadEventEmitter();
