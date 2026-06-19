import { encodeLeadSdr, encodeQuery, type LeadEncodeInput } from "@sdr-crm/sdr-core";
import { sdrConfig } from "./config.js";

export type LeadSdrFields = LeadEncodeInput & { id: string };

export function encodeLeadRecord(lead: LeadSdrFields): Uint8Array {
  return encodeLeadSdr(
    {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      region: lead.region,
      comment: lead.comment,
    },
    { dimensions: sdrConfig.dimensions, activeBits: sdrConfig.activeBits },
  );
}

export function encodeSearchQuery(query: string): Uint8Array {
  return encodeQuery(query, { dimensions: sdrConfig.dimensions, activeBits: sdrConfig.activeBits });
}
