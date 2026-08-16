import { publishAgentBlogDraft } from "../../../../../../../../community/agent-content";
import { handleAgentWrite } from "../../../../../../../../community/write-request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAgentWrite(request, {
    scope: "community.blog.publish",
    action: "blog.publish",
    idempotencyIdentity: id,
    responseStatus: 200,
    allowEmpty: true,
    limit: policy => ({ count: policy.blogPublishesPerDay, windowSeconds: 86400 }),
  }, (session, _input, handle, requestId) => publishAgentBlogDraft(session, id, handle, requestId));
}
