import { agentForumTopic } from "../../../../../../../community/agent-content";
import { agentError, agentJson, agentRequestId, parseBoundedLimit, requireAgentContext } from "../../../../../../../community/agent-api";
import { requireCommunityScope } from "../../../../../../../community/policy-store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = agentRequestId();
  try {
    const session = await requireAgentContext(request);
    await requireCommunityScope(session, "community.forum.read");
    const { id } = await context.params;
    const url = new URL(request.url);
    return agentJson(await agentForumTopic(id, {
      replyCursor: url.searchParams.get("replyCursor"),
      replyLimit: parseBoundedLimit(url.searchParams.get("replyLimit"), 50, 100),
    }), requestId);
  } catch (error) {
    return agentError(error, requestId);
  }
}
