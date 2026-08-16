import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export type StoredArtifact = {
  body: ReadableStream<Uint8Array>;
  contentLength: number;
  contentType: string;
};

export type StagedArtifactReplacement = {
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
};

function storageRoot() {
  const configured = process.env.ARTIFACT_STORAGE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? path.normalize(configured)
      : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "artifacts");
}

function resolveObjectKey(objectKey: string) {
  const root = storageRoot();
  const target = path.resolve(root, ...objectKey.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Artifact object key escapes the configured storage root.");
  }
  return target;
}

export async function putArtifact(objectKey: string, content: ArrayBuffer) {
  const replacement = await stageArtifactReplacement(objectKey, content);
  await replacement.commit();
}

export async function stageArtifactReplacement(objectKey: string, content: ArrayBuffer): Promise<StagedArtifactReplacement> {
  const target = resolveObjectKey(objectKey);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.uploading`;
  const backup = `${target}.${crypto.randomUUID()}.replaced`;
  let backedUp = false;
  let settled = false;
  try {
    await writeFile(temporary, Buffer.from(content));
    try {
      await rename(target, backup);
      backedUp = true;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    if (backedUp) await rename(backup, target).catch(() => undefined);
    throw error;
  }

  return {
    async commit() {
      if (settled) return;
      settled = true;
      if (backedUp) await rm(backup, { force: true }).catch(() => undefined);
    },
    async rollback() {
      if (settled) return;
      settled = true;
      await rm(target, { force: true });
      if (backedUp) await rename(backup, target);
    },
  };
}

export async function deleteArtifact(objectKey: string) {
  await rm(resolveObjectKey(objectKey), { force: true });
}

export async function getArtifact(objectKey: string): Promise<StoredArtifact | null> {
  const target = resolveObjectKey(objectKey);
  try {
    const information = await stat(target);
    if (!information.isFile()) return null;
    return {
      body: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>,
      contentLength: information.size,
      contentType: contentTypeFor(target),
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function artifactExists(objectKey: string) {
  try {
    return (await stat(resolveObjectKey(objectKey))).isFile();
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function contentTypeFor(fileName: string) {
  if (fileName.toLowerCase().endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  return "application/octet-stream";
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
