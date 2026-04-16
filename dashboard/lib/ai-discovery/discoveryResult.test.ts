import { describe, expect, it } from "vitest";

import {
  buildDiscoveryResult,
  combinedLocalInferenceFolders,
} from "../../../ai_discovery/discoveryResult";
import type { AIDetection } from "../../../ai_discovery/types";

describe("buildDiscoveryResult", () => {
  it("groups files by category", () => {
    const detections: AIDetection[] = [
      {
        type: "openai",
        file: "a.ts",
        signal: "openai",
        confidence: "high",
        description: "OpenAI API usage (LLM inference)",
      },
      {
        type: "transformers",
        file: "b.py",
        signal: "pipeline(",
        confidence: "experimental",
        description: "Transformers usage (local model)",
      },
      {
        type: "model_artifact",
        file: "models/model.safetensors",
        signal: "model.safetensors",
        confidence: "experimental",
        description: "Possible model weights artifact",
      },
    ];
    const r = buildDiscoveryResult(detections);
    expect(r.groupedSummary.highConfidence.openai.files).toEqual(["a.ts"]);
    expect(r.groupedSummary.experimental.transformers.files).toEqual(["b.py"]);
    expect(r.groupedSummary.experimental.modelArtifacts.files).toEqual([
      "models/model.safetensors",
    ]);
    expect(r.notes).toEqual([]);
  });

  it("adds combined note when transformers and model artifacts share a folder", () => {
    const detections: AIDetection[] = [
      {
        type: "transformers",
        file: "pkg/x.py",
        signal: "transformers",
        confidence: "experimental",
        description: "Transformers usage (local model)",
      },
      {
        type: "model_artifact",
        file: "pkg/model.pt",
        signal: "model.pt",
        confidence: "experimental",
        description: "Possible model weights artifact",
      },
    ];
    const r = buildDiscoveryResult(detections);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0].message).toBe(
      "Possible local model inference (combined signals)"
    );
    expect(r.notes[0].folders).toEqual(["pkg"]);
  });
});

describe("combinedLocalInferenceFolders", () => {
  it("returns empty when only one signal type", () => {
    const d: AIDetection[] = [
      {
        type: "transformers",
        file: "a/b.py",
        signal: "transformers",
        confidence: "experimental",
        description: "Transformers usage (local model)",
      },
    ];
    expect(combinedLocalInferenceFolders(d)).toEqual([]);
  });
});
