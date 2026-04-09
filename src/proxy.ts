import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspaceId,
  isValidWorkspaceId,
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_HEADER_NAME,
} from "@/lib/user-session";

export function proxy(request: NextRequest) {
  const cookieWorkspaceId = request.cookies.get(WORKSPACE_COOKIE_NAME)?.value;
  const workspaceId = isValidWorkspaceId(cookieWorkspaceId)
    ? cookieWorkspaceId
    : createWorkspaceId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(WORKSPACE_HEADER_NAME, workspaceId);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (isValidWorkspaceId(cookieWorkspaceId)) {
    return response;
  }

  response.cookies.set({
    name: WORKSPACE_COOKIE_NAME,
    value: workspaceId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 2,
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)",
  ],
};
