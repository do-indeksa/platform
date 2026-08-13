import { parsePrepPreferences, type PrepPreferences } from "./prep-settings";

const PREP_PREFERENCES_QUERY = `
  query PrepPreferences {
    prepPreferences { goalPoints examDate version }
  }
`;

const SAVE_PREP_PREFERENCES_MUTATION = `
  mutation SavePrepPreferences($input: SavePrepPreferencesInput!) {
    savePrepPreferences(input: $input) { goalPoints examDate version }
  }
`;

export type ServerPrepPreferences = PrepPreferences & {
  version: number;
};

export class PrepPreferencesGraphQLError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PrepPreferencesGraphQLError";
  }
}

export async function fetchServerPrepPreferences(
  signal?: AbortSignal,
): Promise<ServerPrepPreferences | null> {
  const value = await requestPrepPreferencesGraphQL(
    "PrepPreferences",
    PREP_PREFERENCES_QUERY,
    {},
    "prepPreferences",
    signal,
  );
  if (value === null) return null;
  const parsed = parseServerPrepPreferences(value);
  if (parsed === null) {
    throw new Error("prep preferences query returned invalid data");
  }
  return parsed;
}

export async function saveServerPrepPreferences(
  expectedVersion: number,
  preferences: PrepPreferences,
  signal?: AbortSignal,
): Promise<ServerPrepPreferences> {
  const value = await requestPrepPreferencesGraphQL(
    "SavePrepPreferences",
    SAVE_PREP_PREFERENCES_MUTATION,
    { input: { expectedVersion, ...preferences } },
    "savePrepPreferences",
    signal,
  );
  const parsed = parseServerPrepPreferences(value);
  if (parsed === null) {
    throw new Error("prep preferences mutation returned invalid data");
  }
  return parsed;
}

export function parseServerPrepPreferences(
  value: unknown,
): ServerPrepPreferences | null {
  if (!isRecord(value)) return null;
  const preferences = parsePrepPreferences(value);
  if (
    preferences.goalPoints !== value.goalPoints ||
    preferences.examDate !== value.examDate ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1
  ) {
    return null;
  }
  return { ...preferences, version: value.version as number };
}

async function requestPrepPreferencesGraphQL(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  field: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (!response.ok) {
    throw new Error(`prep preferences failed with status ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("prep preferences returned an invalid response");
  }
  if (
    payload.errors !== undefined &&
    (!Array.isArray(payload.errors) || payload.errors.length > 0)
  ) {
    const first = Array.isArray(payload.errors) ? payload.errors[0] : null;
    const code =
      isRecord(first) &&
      isRecord(first.extensions) &&
      typeof first.extensions.code === "string"
        ? first.extensions.code
        : "GRAPHQL_ERROR";
    const message =
      isRecord(first) && typeof first.message === "string"
        ? first.message
        : "prep preferences request failed";
    throw new PrepPreferencesGraphQLError(message, code);
  }
  if (!isRecord(payload.data) || !(field in payload.data)) {
    throw new Error("prep preferences returned an invalid response");
  }
  return payload.data[field];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
