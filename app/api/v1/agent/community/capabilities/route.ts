import { agentError, agentJson, agentRequestId, requireAgentContext } from "../../../../../community/agent-api";
import { effectiveCommunityCapabilities } from "../../../../../community/policy-store";

export async function GET(request: Request) {
  const requestId = agentRequestId();
  try {
    const context = await requireAgentContext(request);
    return agentJson(await effectiveCommunityCapabilities(context), requestId);
  } catch (error) {
    return agentError(error, requestId);
  }
}
