import type { TelephonyAdapter } from "../types.js";
import { genericAdapter } from "./generic.js";
import { mangoAdapter } from "./mango.js";
import { zadarmaAdapter } from "./zadarma.js";
import { uisAdapter } from "./uis.js";
import { asteriskAdapter } from "./asterisk.js";
import { beelineAdapter } from "./beeline.js";

const adapters: Record<string, TelephonyAdapter> = {
  generic: genericAdapter,
  mango: mangoAdapter,
  zadarma: zadarmaAdapter,
  uis: uisAdapter,
  asterisk: asteriskAdapter,
  beeline: beelineAdapter,
};

export function getAdapter(name: string): TelephonyAdapter {
  return adapters[name] || genericAdapter;
}

export { adapters };
