export type ContentCreationChannel = "web" | "eval_agent";

export function normalizeContentCreationChannel(createdVia: unknown): ContentCreationChannel {
  return createdVia === "eval_agent" ? "eval_agent" : "web";
}

export function displayBlogAuthorName(authorName: string, createdVia: unknown) {
  return normalizeContentCreationChannel(createdVia) === "eval_agent" ? `${authorName}_agent` : authorName;
}
