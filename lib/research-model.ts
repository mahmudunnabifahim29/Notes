export const FEATURES = ["page_views", "note_views", "creates", "edits", "uploads", "shares", "active_seconds", "active_days"] as const;
export type Activity = Record<typeof FEATURES[number], number> & { research_id: string };
export type ResearchModel = {
  version: 1; model_type: "kmeans"; features: string[]; mean: number[]; scale: number[]; centroids: number[][];
  training_source: "real" | "synthetic"; trained_samples: number; silhouette_train: number; silhouette_holdout: number | null;
};
export function validateModel(input: unknown): ResearchModel {
  const m = input as ResearchModel;
  const vector = (v: unknown, positive = false) => Array.isArray(v) && v.length === FEATURES.length && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e9 && (!positive || n > 0));
  if (!m || m.version !== 1 || m.model_type !== "kmeans" || JSON.stringify(m.features) !== JSON.stringify(FEATURES) || !vector(m.mean) || !vector(m.scale, true) || !Array.isArray(m.centroids) || m.centroids.length < 2 || m.centroids.length > 6 || !m.centroids.every(v => vector(v)) || !["real", "synthetic"].includes(m.training_source) || !Number.isInteger(m.trained_samples) || m.trained_samples < 1 || !Number.isFinite(m.silhouette_train) || Math.abs(m.silhouette_train) > 1 || !(m.silhouette_holdout === null || (Number.isFinite(m.silhouette_holdout) && Math.abs(m.silhouette_holdout) <= 1))) throw new Error("Invalid model. Import the model.json produced by the NoteAtlas Python starter.");
  return { version:1, model_type:"kmeans", features:[...FEATURES], mean:m.mean, scale:m.scale, centroids:m.centroids, training_source:m.training_source, trained_samples:m.trained_samples, silhouette_train:m.silhouette_train, silhouette_holdout:m.silhouette_holdout };
}
export function predictCluster(row: Activity, m: ResearchModel) {
  const x = FEATURES.map((f, i) => (Math.log1p(Math.max(0, row[f])) - m.mean[i]) / m.scale[i]);
  const distances = m.centroids.map(c => c.reduce((sum, value, i) => sum + (x[i] - value) ** 2, 0));
  return distances.indexOf(Math.min(...distances));
}
