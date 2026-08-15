import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeSemver } from "./public";

export type WindowsInstallerMetadata = {
  embeddedVersion: string;
  productName: string | null;
  versionSource: "PE.ProductVersion" | "PE.FileVersion";
};

export async function inspectWindowsInstaller(
  fileName: string,
  bytes: ArrayBuffer,
): Promise<WindowsInstallerMetadata> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "eval-installer-"));
  const temporaryFile = path.join(temporaryDirectory, "artifact.exe");
  try {
    await writeFile(temporaryFile, Buffer.from(bytes));
    const { AppInfoParser, isPeInfo, isWindowsInfo } = await import("@h-t-m/app-inspect");
    const result = await new AppInfoParser(temporaryFile).parse({
      signing: false,
      icons: false,
      resources: false,
      nativeAbi: false,
    });
    const info = result.data.platformInfo;
    if (!isWindowsInfo(info)) throw new Error(`${fileName} 不是可识别的 Windows 安装包。`);

    if (!isPeInfo(info)) throw new Error(`${fileName} 的实际格式不是 PE/EXE。`);
    const productVersion = info.versionInfo?.productVersion?.trim();
    const fileVersion = info.versionInfo?.fileVersion?.trim();
    const source = productVersion ? "PE.ProductVersion" : "PE.FileVersion";
    return {
      embeddedVersion: normalizeEmbeddedVersion(productVersion ?? fileVersion, fileName),
      productName: info.versionInfo?.productName?.trim() || null,
      versionSource: source,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes(fileName)) throw error;
    throw new Error(`无法读取 ${fileName} 的内部版本信息。`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function normalizeEmbeddedVersion(value: string | undefined, fileName: string) {
  if (!value) throw new Error(`${fileName} 缺少可读取的 ProductVersion/FileVersion。`);
  const normalized = normalizeSemver(value);
  if (normalized) return normalized.version;
  const windowsFourPart = value.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.0(?:\s.*)?$/);
  if (windowsFourPart) return `${windowsFourPart[1]}.${windowsFourPart[2]}.${windowsFourPart[3]}`;
  throw new Error(`${fileName} 的内部版本“${value}”不是可发布的语义化版本。`);
}
