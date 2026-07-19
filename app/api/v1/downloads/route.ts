const publicReleases = [
  {
    id: "eval-agent-win-x64-nsis",
    name: "Eval Agent Windows 安装程序",
    version: "0.1.0",
    platform: "Windows x64",
    format: "NSIS",
    fileExtension: ".exe",
    available: false,
    downloadUrl: null,
    size: null,
    sha256: null,
    public: true,
  },
  {
    id: "eval-agent-win-x64-msi",
    name: "Eval Agent Windows 企业部署包",
    version: "0.1.0",
    platform: "Windows x64",
    format: "MSI",
    fileExtension: ".msi",
    available: false,
    downloadUrl: null,
    size: null,
    sha256: null,
    public: true,
  },
];

export async function GET() {
  return Response.json(
    {
      data: publicReleases,
      meta: {
        authenticationRequired: false,
        managedBy: "administrator",
        note: "管理员上传正式发布包后开放下载",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}
