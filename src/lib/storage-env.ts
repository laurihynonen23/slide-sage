export type UploadMode = "blob" | "server" | "unsupported";

export function isBlobStorageEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isHostedDeployment(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_URL);
}

export function getUploadMode(): UploadMode {
  if (isBlobStorageEnabled()) return "blob";
  if (isHostedDeployment()) return "unsupported";
  return "server";
}

export function canPersistApiKeys(): boolean {
  return !isHostedDeployment() && !isBlobStorageEnabled();
}
