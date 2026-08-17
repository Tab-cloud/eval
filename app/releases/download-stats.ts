import { authDatabase } from "../auth/core";

export function downloadDateBucket(downloadedAt: number) {
  return new Date(downloadedAt * 1000).toISOString().slice(0, 10);
}

export async function recordArtifactDownload(artifactId: string, downloadedAt = Math.floor(Date.now() / 1000)) {
  const downloadDate = downloadDateBucket(downloadedAt);
  await authDatabase().prepare(`
    INSERT INTO artifact_download_stats (artifact_id, download_date, download_count, last_downloaded_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT (artifact_id, download_date) DO UPDATE SET
      download_count = artifact_download_stats.download_count + 1,
      last_downloaded_at = GREATEST(artifact_download_stats.last_downloaded_at, EXCLUDED.last_downloaded_at)
  `).bind(artifactId, downloadDate, downloadedAt).run();
}
