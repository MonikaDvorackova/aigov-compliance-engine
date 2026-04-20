/** Mirrors `ai_discovery` types for the dashboard bundle (no runtime import from repo-root sources). */

export type DetectionConfidence = "high" | "experimental";

export type AIDetection = {
  type: "openai" | "transformers" | "model_artifact";
  file: string;
  signal: string;
  confidence: DetectionConfidence;
  description: string;
};

export type DiscoveryGroupedSummary = {
  highConfidence: {
    openai: { files: string[] };
  };
  experimental: {
    transformers: { files: string[] };
    /** Paths matching `model_artifact` rules (see `ai_discovery/detectors/model_artifact_detector.ts`). */
    modelArtifacts: { files: string[] };
  };
};

export type DiscoveryNote = {
  code: "combined_local_inference";
  message: string;
  folders: string[];
};

export type DiscoveryResponse = {
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
};
