import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { x as extractTar } from "tar";
import { normalizeSemver } from "./public";

export type WindowsInstallerMetadata = {
  embeddedVersion: string;
  productName: string | null;
  versionSource: "PE.ProductVersion" | "PE.FileVersion";
};

export type MacInstallerMetadata = {
  embeddedVersion: string;
  productName: string | null;
  versionSource: "macOS.CFBundleShortVersionString" | "upload.version";
};

export type MacArchitecture = "aarch64" | "x86_64" | "universal";

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

export async function inspectMacUpdaterBundle(
  fileName: string,
  bytes: ArrayBuffer,
  expectedArchitecture: MacArchitecture,
): Promise<MacInstallerMetadata> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "eval-mac-updater-"));
  const temporaryFile = path.join(temporaryDirectory, "artifact.app.tar.gz");
  try {
    await writeFile(temporaryFile, Buffer.from(bytes));
    await extractTar({
      file: temporaryFile,
      cwd: temporaryDirectory,
      strict: true,
      preservePaths: false,
      filter: (entryPath, entry) => {
        const normalized = entryPath.replaceAll("\\", "/");
        if (normalized.startsWith("/") || normalized.split("/").includes("..")) return false;
        const usefulPath = /^[^/]+\.app(?:\/Contents(?:\/(?:Info\.plist|MacOS(?:\/.*)?))?)?\/?$/.test(normalized);
        return usefulPath && "type" in entry && (entry.type === "File" || entry.type === "OldFile" || entry.type === "Directory");
      },
    });
    const appDirectory = (await readdir(temporaryDirectory, { withFileTypes: true }))
      .find(entry => entry.isDirectory() && entry.name.toLowerCase().endsWith(".app"));
    if (!appDirectory) throw new Error(`${fileName} 不包含可识别的 macOS .app。`);

    const { AppInfoParser, isMacOsInfo } = await import("@h-t-m/app-inspect");
    const result = await new AppInfoParser(path.join(temporaryDirectory, appDirectory.name)).parse({
      signing: false,
      icons: false,
      resources: false,
      nativeAbi: true,
    });
    const info = result.data.platformInfo;
    if (!isMacOsInfo(info)) throw new Error(`${fileName} 不是可识别的 macOS 更新包。`);
    assertMacArchitecture(info.architectures ?? [], expectedArchitecture, fileName);
    const version = typeof info.plist.CFBundleShortVersionString === "string"
      ? info.plist.CFBundleShortVersionString.trim()
      : typeof info.plist.CFBundleVersion === "string" ? info.plist.CFBundleVersion.trim() : "";
    const productName = [info.plist.CFBundleDisplayName, info.plist.CFBundleName]
      .find(value => typeof value === "string" && value.trim());
    return {
      embeddedVersion: normalizeEmbeddedVersion(version, fileName),
      productName: typeof productName === "string" ? productName.trim() : null,
      versionSource: "macOS.CFBundleShortVersionString",
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes(fileName)) throw error;
    throw new Error(`无法读取 ${fileName} 的 macOS 应用版本信息。`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function inspectMacDmg(
  fileName: string,
  bytes: ArrayBuffer,
  declaredVersion: string,
): Promise<MacInstallerMetadata> {
  const normalized = normalizeSemver(declaredVersion);
  if (!normalized) throw new Error("上传 DMG 时必须填写与应用一致的语义化版本号。");
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "eval-mac-dmg-"));
  const temporaryFile = path.join(temporaryDirectory, "artifact.dmg");
  try {
    await writeFile(temporaryFile, Buffer.from(bytes));
    const { AppInfoParser, isDmgInfo } = await import("@h-t-m/app-inspect");
    const result = await new AppInfoParser(temporaryFile).parse({
      signing: false,
      icons: false,
      resources: false,
      nativeAbi: false,
    });
    if (!isDmgInfo(result.data.platformInfo)) throw new Error(`${fileName} 的实际格式不是 macOS DMG。`);
    return {
      embeddedVersion: normalized.version,
      productName: fileName.replace(/\.dmg$/i, "") || null,
      versionSource: "upload.version",
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes(fileName)) throw error;
    throw new Error(`无法验证 ${fileName} 的 DMG 文件结构。`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function assertMacArchitecture(values: string[], expected: MacArchitecture, fileName: string) {
  const architectures = new Set(values.map(value => value.toLowerCase()).map(value => value === "arm64" ? "aarch64" : value));
  const valid = expected === "universal"
    ? architectures.has("aarch64") && architectures.has("x86_64")
    : architectures.has(expected);
  if (!valid) {
    throw new Error(`${fileName} 的应用架构（${[...architectures].join(", ") || "未识别"}）与所选 ${expected} 不一致。`);
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
