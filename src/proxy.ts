import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspaceId,
  isValidWorkspaceId,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/user-session";

export function proxy(request: NextRequest) {
  const workspaceId = request.cookies.get(WORKSPACE_COOKIE_NAME)?.value;

  if (isValidWorkspaceId(workspaceId)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set({
    name: WORKSPACE_COOKIE_NAME,
    value: createWorkspaceId(),
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
