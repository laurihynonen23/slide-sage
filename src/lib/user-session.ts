import { randomUUID } from "crypto";
import { cookies, headers } from "next/headers";

export const WORKSPACE_COOKIE_NAME = "slide_sage_workspace";
export const WORKSPACE_HEADER_NAME = "x-slide-sage-workspace";

const WORKSPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createWorkspaceId(): string {
  return randomUUID();
}

export function isValidWorkspaceId(value: string | undefined | null): value is string {
  return Boolean(value && WORKSPACE_ID_PATTERN.test(value));
}

export async function getWorkspaceId(): Promise<string> {
  const cookieStore = await cookies();
  const workspaceId = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value;

  if (isValidWorkspaceId(workspaceId)) {
    return workspaceId;
  }

  const headerStore = await headers();
  const forwardedWorkspaceId = headerStore.get(WORKSPACE_HEADER_NAME);

  if (isValidWorkspaceId(forwardedWorkspaceId)) {
    return forwardedWorkspaceId;
  }

  throw new Error("Workspace identifier is missing or invalid");
}
