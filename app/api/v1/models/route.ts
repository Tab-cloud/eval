import { isResponse, requireApiIdentity } from "../_shared/auth";

const catalog = [
  { id: "gpt-5.2", provider: "openai", displayName: "GPT-5.2", capabilities: ["chat", "vision", "tools"], status: "active" },
  { id: "claude-4.5-sonnet", provider: "anthropic", displayName: "Claude 4.5 Sonnet", capabilities: ["chat", "vision", "tools"], status: "active" },
  { id: "gemini-3-pro", provider: "google", displayName: "Gemini 3 Pro", capabilities: ["chat", "vision"], status: "active" },
];

export async function GET(request: Request) {
  const identity = requireApiIdentity(request); if (isResponse(identity)) return identity;
  return Response.json({ data: catalog, meta: { tenantId: identity.tenantId, count: catalog.length } });
}
