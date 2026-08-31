import type { SourceAdapter } from "./adapter";
import { fredAdapter } from "./adapters/fred";
import { openMeteoAdapter } from "./adapters/open-meteo";

/**
 * The adapter registry.
 *
 * Adding an *indicator* must be data entry, not code — that is the only way to
 * reach 50–100 of them (§8) without the registry becoming the bottleneck. Code
 * is written once per *source*; each indicator is then a row naming an adapter
 * id and a series code.
 */
const ADAPTERS: readonly SourceAdapter[] = [fredAdapter, openMeteoAdapter];

const BY_ID = new Map(ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getAdapter(id: string): SourceAdapter {
  const adapter = BY_ID.get(id);
  if (!adapter) {
    throw new Error(
      `No adapter registered for source "${id}". Known sources: ${[...BY_ID.keys()].join(", ")}`,
    );
  }
  return adapter;
}

export function listAdapters(): readonly SourceAdapter[] {
  return ADAPTERS;
}

export function hasAdapter(id: string): boolean {
  return BY_ID.has(id);
}
