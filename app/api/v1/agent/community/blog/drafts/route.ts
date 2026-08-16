import { createAgentBlogDraft } from "../../../../../../community/agent-content";
import { handleAgentWrite } from "../../../../../../community/write-request";

export async function POST(request: Request) {
  return handleAgentWrite(request, {
    scope: "community.blog.draft.create",
    action: "blog.draft.create",
    responseStatus: 201,
    maxBytes: 96 * 1024,
    limit: policy => ({ count: policy.blogDraftsPerDay, windowSeconds: 86400 }),
  }, createAgentBlogDraft);
}
