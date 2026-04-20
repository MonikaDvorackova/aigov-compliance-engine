import path from "node:path";
import { pathToFileURL } from "node:url";

/** Matches `ai_discovery/confirmedStore` (loaded from compiled output). */
export type ConfirmedStoreModule = {
  addConfirmedSystem: (input: {
    detectionType: "openai" | "transformers" | "model_artifact";
    file: string;
  }) => {
    record: {
      id: string;
      source: "discovery";
      detectionType: "openai" | "transformers" | "model_artifact";
      file: string;
      createdAt: string;
    };
    created: boolean;
  };
  listConfirmedSystems: () => {
    id: string;
    source: "discovery";
    detectionType: "openai" | "transformers" | "model_artifact";
    file: string;
    createdAt: string;
  }[];
};

let cached: ConfirmedStoreModule | null = null;

/**
 * Single in-memory store from `ai_discovery/dist/confirmedStore.js`.
 * Requires `tsc -p ../ai_discovery/tsconfig.json` before dev/build.
 */
export async function loadConfirmedStore(): Promise<ConfirmedStoreModule> {
  if (cached) return cached;

  const js = path.join(
    process.cwd(),
    "..",
    "ai_discovery",
    "dist",
    "confirmedStore.js"
  );

  const mod = (await import(
    /* webpackIgnore: true */
    pathToFileURL(js).href
  )) as ConfirmedStoreModule;

  cached = mod;
  return mod;
}
