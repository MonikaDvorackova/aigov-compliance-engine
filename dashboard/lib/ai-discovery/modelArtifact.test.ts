import { describe, expect, it } from "vitest";

import {
  detectModelArtifact,
  isModelArtifactPath,
} from "../../../ai_discovery/detectors/model_artifact_detector";
import { formatDiscoveryReport } from "../../../ai_discovery/discoveryResult";
import { scanFiles } from "../../../ai_discovery/scanner";

describe("isModelArtifactPath", () => {
  it("matches common weight extensions", () => {
    expect(isModelArtifactPath("weights/model.pt")).toBe(true);
    expect(isModelArtifactPath("weights/model.pth")).toBe(true);
    expect(isModelArtifactPath("weights/model.safetensors")).toBe(true);
    expect(isModelArtifactPath("weights/model.onnx")).toBe(true);
  });

  it("matches known .bin basenames only", () => {
    expect(isModelArtifactPath("hf/pytorch_model.bin")).toBe(true);
    expect(isModelArtifactPath("pytorch_model.bin")).toBe(true);
  });

  it("rejects arbitrary .bin files", () => {
    expect(isModelArtifactPath("build/cache.bin")).toBe(false);
    expect(isModelArtifactPath("data/random.bin")).toBe(false);
  });

  it("rejects non-artifact paths", () => {
    expect(isModelArtifactPath("src/main.py")).toBe(false);
    expect(isModelArtifactPath("README.md")).toBe(false);
  });

  it("uses basename only (paths with directories)", () => {
    expect(isModelArtifactPath("/abs/path/to/x/model.safetensors")).toBe(true);
  });
});

describe("detectModelArtifact", () => {
  it("returns experimental detection with expected fields", () => {
    const d = detectModelArtifact("m/model.pt");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      type: "model_artifact",
      file: "m/model.pt",
      signal: "model.pt",
      confidence: "experimental",
      description: "Possible model weights artifact",
    });
  });

  it("returns empty for non-matching paths", () => {
    expect(detectModelArtifact("x.bin")).toEqual([]);
    expect(detectModelArtifact("foo.py")).toEqual([]);
  });
});

describe("scanFiles with modelArtifactPaths", () => {
  it("merges text-file detections with model artifact paths", () => {
    const d = scanFiles(
      [{ path: "app.py", content: "import transformers\n" }],
      ["weights/model.safetensors"]
    );
    const types = new Set(d.map((x) => x.type));
    expect(types.has("transformers")).toBe(true);
    expect(types.has("model_artifact")).toBe(true);
    const ma = d.filter((x) => x.type === "model_artifact");
    expect(ma).toHaveLength(1);
    expect(ma[0].file).toBe("weights/model.safetensors");
    expect(ma[0].description).toBe("Possible model weights artifact");
  });

  it("works with empty modelArtifactPaths", () => {
    const d = scanFiles([{ path: "x.py", content: "" }], []);
    expect(d.filter((x) => x.type === "model_artifact")).toEqual([]);
  });
});

describe("formatDiscoveryReport combined signal", () => {
  it("includes combined local inference note when both signals share a folder", () => {
    const report = formatDiscoveryReport(
      scanFiles(
        [{ path: "pkg/infer.py", content: "from transformers import pipeline\n" }],
        ["pkg/model.pt"]
      )
    );
    expect(report).toContain(
      "Possible local model inference (combined signals)"
    );
    expect(report).toContain("  - pkg");
  });
});
