import { validate as isUuid } from "uuid";
import type { components } from "./api/schema";

type User = components["schemas"]["User"];

export async function fetchCurrentUser(
  signal?: AbortSignal,
): Promise<User | null> {
  const response = await fetch("/api/v1/me", {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`current user unavailable: ${response.status}`);
  }

  const user = parseCurrentUser(await response.json());
  if (user === null) throw new Error("current user response is invalid");
  return user;
}

export function parseCurrentUser(value: unknown): User | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isUuid(value.id) ||
    typeof value.email !== "string" ||
    value.email.trim() === "" ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    (value.pictureUrl !== undefined && typeof value.pictureUrl !== "string")
  ) {
    return null;
  }

  return {
    id: value.id,
    email: value.email,
    name: value.name,
    ...(value.pictureUrl === undefined ? {} : { pictureUrl: value.pictureUrl }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
