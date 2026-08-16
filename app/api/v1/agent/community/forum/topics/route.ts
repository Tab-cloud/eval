import { agentForumTopics, createAgentForumTopic } from "../../../../../../community/agent-content";
import { agentError, agentJson, agentRequestId, parseBoundedLimit, parseIsoTime, requireAgentContext } from "../../../../../../community/agent-api";
import { requireCommunityScope } from "../../../../../../community/policy-store";
import { handleAgentWrite } from "../../../../../../community/write-request";

export async function GET(request: Request) {
  const requestId = agentRequestId();
  try {
    const context = await requireAgentContext(request);
    await requireCommunityScope(context, "community.forum.read");
    const url = new URL(request.url);
    const result = await agentForumTopics({
      category: url.searchParams.get("category"),
      sort: url.searchParams.get("sort"),
      since: parseIsoTime(url.searchParams.get("since")),
      cursor: url.searchParams.get("cursor"),
      limit: parseBoundedLimit(url.searchParams.get("limit"), 20, 50),
    });
    return agentJson(result, requestId);
  } catch (error) {
    return agentError(error, requestId);
  }
}
export async function POST(request: Request) {
  return handleAgentWrite(request, {
    scope: "community.forum.topic.create",
    action: "forum.topic.create",
    responseStatus: 201,
    limit: policy => ({ count: policy.forumTopicsPerHour, windowSeconds: 3600 }),
  }, createAgentForumTopic);
}
