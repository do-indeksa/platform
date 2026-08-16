import { cookies } from "next/headers";

const sessionCookieNames = ["__Host-di_session", "di_session"] as const;

export async function hasAuthSessionHint(): Promise<boolean> {
  const cookieStore = await cookies();
  return sessionCookieNames.some((name) => cookieStore.has(name));
}
