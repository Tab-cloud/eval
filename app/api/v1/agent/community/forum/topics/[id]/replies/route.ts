import { createAgentForumReply } from "../../../../../../../../community/agent-content";
import { handleAgentWrite } from "../../../../../../../../community/write-request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAgentWrite(request, {
    scope: "community.forum.reply.create",
    action: "forum.reply.create",
    idempotencyIdentity: id,
    responseStatus: 201,
    limit: policy => ({ count: policy.forumRepliesPerHour, windowSeconds: 3600 }),
  }, (session, input, handle, requestId) => createAgentForumReply(session, id, input, handle, requestId));
}
