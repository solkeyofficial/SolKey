
export function canonicalRequestMessage(params) {
  return [
    "SolKey Request",
    `Method: ${params.method}`,
    `Path: ${params.path}`,
    `Scope: ${params.scope}`,
    `Timestamp: ${params.timestamp}`,
    `BodyHash: ${params.bodyHash}`,
  ].join("\n");
}
