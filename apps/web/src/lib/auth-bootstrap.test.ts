import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentUser, parseCurrentUser } from "./auth-bootstrap";

const user = {
  id: "39ec4650-762d-437f-9917-c31ab167cb99",
  email: "portfolio@example.test",
  name: "Portfolio User",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth bootstrap", () => {
  it("accepts a valid current-user response", () => {
    expect(parseCurrentUser({ ...user, ignored: "field" })).toEqual(user);
  });

  it("rejects malformed successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ...user, id: "not-a-user" })),
    );

    await expect(fetchCurrentUser()).rejects.toThrow(
      "current user response is invalid",
    );
  });

  it("treats only an explicit unauthorized response as a guest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(fetchCurrentUser()).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(fetchCurrentUser()).rejects.toThrow(
      "current user unavailable: 503",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network unavailable")),
    );
    await expect(fetchCurrentUser()).rejects.toThrow("network unavailable");
  });
});
