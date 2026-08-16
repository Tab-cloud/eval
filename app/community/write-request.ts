import { agentError, agentJson, agentRequestId, normalizeAgentError, readAgentJson, requireAgentContext } from "./agent-api";
import { beginAgentAction, enforceAgentActionLimit, failAgentAction, rejectAgentAction, type AgentActionHandle } from "./agent-actions";
import { requireCommunityScope, type AgentCommunityContext, type AgentCommunityPolicy } from "./policy-store";
import type { CommunityScope } from "./permissions";

type Options = {
  scope: CommunityScope;
  action: string;
  responseStatus: number;
  allowEmpty?: boolean;
  maxBytes?: number;
  idempotencyIdentity?: string;
  limit?: (policy: AgentCommunityPolicy) => { count: number; windowSeconds: number };
};

export async function handleAgentWrite(
  request: Request,
  options: Options,
  operation: (context: AgentCommunityContext, input: Record<string, unknown>, handle: AgentActionHandle, requestId: string) => Promise<Record<string, unknown>>,
) {
  const requestId = agentRequestId();
  let handle: AgentActionHandle | null = null;
  try {
    const context = await requireAgentContext(request);
    const policy = await requireCommunityScope(context, options.scope);
    const input = await readAgentJson(request, { allowEmpty: options.allowEmpty, maxBytes: options.maxBytes });
    handle = await beginAgentAction(context, requestId, options.action, request.headers.get("idempotency-key"), input, options.idempotencyIdentity);
    if (handle.replay) return agentJson(handle.replay.body, requestId, handle.replay.status);
    if (options.limit) {
      const limit = options.limit(policy);
      await enforceAgentActionLimit(context, options.action, limit.count, limit.windowSeconds);
    }
    const result = await operation(context, input, handle, requestId);
    return agentJson(result, requestId, options.responseStatus);
  } catch (error) {
    const normalized = normalizeAgentError(error);
    if (handle) {
      if (normalized.status >= 500) await failAgentAction(handle);
      else await rejectAgentAction(handle, normalized.code);
    }
    return agentError(normalized, requestId);
  }
}
