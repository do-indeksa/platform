import {
  completePrepPreferences,
  parsePrepPreferences,
  type CompletePrepPreferences,
} from "./prep-settings";

const PREP_PREFERENCES_QUERY = `
  query PrepPreferences {
    prepPreferences { goalPoints examDate version updatedAt }
  }
`;

const SAVE_PREP_PREFERENCES_MUTATION = `
  mutation SavePrepPreferences($input: SavePrepPreferencesInput!) {
    savePrepPreferences(input: $input) {
      goalPoints
      examDate
      version
      updatedAt
    }
  }
`;

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export type ServerPrepPreferences = CompletePrepPreferences & {
  version: number;
  updatedAt: string;
};

export type SaveServerPrepPreferencesInput = CompletePrepPreferences & {
  expectedVersion: number;
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
  const value = await requestGraphQL(
    "PrepPreferences",
    PREP_PREFERENCES_QUERY,
    undefined,
    "prepPreferences",
    signal,
  );
  if (value === null) return null;
  const parsed = parseServerPrepPreferences(value);
  if (parsed === null) {
    throw new Error("prep preferences returned an invalid response");
  }
  return parsed;
}

export async function saveServerPrepPreferences(
  input: SaveServerPrepPreferencesInput,
  signal?: AbortSignal,
): Promise<ServerPrepPreferences> {
  const complete = completePrepPreferences(input);
  if (
    complete === null ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    throw new Error("prep preferences write input is invalid");
  }
  const value = await requestGraphQL(
    "SavePrepPreferences",
    SAVE_PREP_PREFERENCES_MUTATION,
    { input: { expectedVersion: input.expectedVersion, ...complete } },
    "savePrepPreferences",
    signal,
  );
  const parsed = parseServerPrepPreferences(value);
  if (parsed === null) {
    throw new Error("prep preferences returned an invalid response");
  }
  return parsed;
}

function parseServerPrepPreferences(
  value: unknown,
): ServerPrepPreferences | null {
  if (!isRecord(value)) return null;
  const parsed = parsePrepPreferences(value);
  const complete = completePrepPreferences(parsed);
  if (
    complete === null ||
    value.goalPoints !== complete.goalPoints ||
    value.examDate !== complete.examDate ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    typeof value.updatedAt !== "string" ||
    !RFC3339.test(value.updatedAt) ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return null;
  }
  return { ...complete, version: value.version, updatedAt: value.updatedAt };
}

async function requestGraphQL(
  operationName: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  field: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      operationName,
      query,
      ...(variables === undefined ? {} : { variables }),
    }),
  });
  if (!response.ok) {
    throw new Error(
      `prep preferences GraphQL request failed with status ${response.status}`,
    );
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("prep preferences returned an invalid response");
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    const code =
      isRecord(first) &&
      isRecord(first.extensions) &&
      typeof first.extensions.code === "string"
        ? first.extensions.code
        : "GRAPHQL_ERROR";
    const message =
      isRecord(first) && typeof first.message === "string"
        ? first.message
        : "GraphQL request failed";
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
