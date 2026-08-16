import { updateAgentBlogDraft } from "../../../../../../../community/agent-content";
import { handleAgentWrite } from "../../../../../../../community/write-request";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAgentWrite(request, {
    scope: "community.blog.draft.create",
    action: "blog.draft.update",
    idempotencyIdentity: id,
    responseStatus: 200,
    maxBytes: 96 * 1024,
  }, (session, input, handle, requestId) => updateAgentBlogDraft(session, id, input, handle, requestId));
}
