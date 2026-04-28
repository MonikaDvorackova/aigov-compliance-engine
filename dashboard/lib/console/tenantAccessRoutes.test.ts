import { describe, expect, it, vi, beforeEach } from "vitest";

// Route modules under test
import * as runsListRoute from "@/app/api/runs/route";
import * as runDetailRoute from "@/app/api/runs/[id]/route";
import * as signedUrlsRoute from "@/app/api/storage/signed-urls/route";
import * as bundleRoute from "@/app/api/bundle/[id]/route";
import * as evidenceRoute from "@/app/api/raw/evidence/[id]/route";
import * as auditRoute from "@/app/api/raw/audit/[id]/route";

type MockUser = { id: string; email?: string | null };

function jsonOf(res: Response) {
  return res.json() as Promise<unknown>;
}

type RunsListBody = { ok: boolean; runs: unknown[] };

type QueryResult = { data: unknown; error: { message: string } | null };

type Filter =
  | { op: "eq"; k: string; v: unknown }
  | { op: "in"; k: string; v: unknown[] };

type QueryState = {
  table: string;
  filters: Filter[];
  select: string;
  order: null | { k: string; ascending: boolean };
  limit: null | number;
};

function makeTableClient(handlers: Record<string, (q: QueryState) => QueryResult>) {
  function buildQuery(table: string) {
    const state: QueryState = {
      table,
      filters: [],
      select: "",
      order: null,
      limit: null,
    };

    const api = {
      _state: state,
      select(sel: string) {
        state.select = sel;
        return api;
      },
      eq(k: string, v: unknown) {
        state.filters.push({ op: "eq", k, v });
        return api;
      },
      in(k: string, v: unknown[]) {
        state.filters.push({ op: "in", k, v });
        return api;
      },
      order(k: string, opts: { ascending?: boolean }) {
        state.order = { k, ascending: Boolean(opts?.ascending) };
        return api;
      },
      limit(n: number) {
        state.limit = n;
        return api;
      },
      single() {
        const h = handlers[table];
        const r = h ? h(state) : { data: null, error: null };
        return Promise.resolve(r);
      },
      maybeSingle() {
        const h = handlers[table];
        const r = h ? h(state) : { data: null, error: null };
        return Promise.resolve(r);
      },
      then(resolve: (x: QueryResult) => unknown) {
        const h = handlers[table];
        const r = h ? h(state) : { data: null, error: null };
        return Promise.resolve(r).then(resolve);
      },
    };
    return api;
  }

  return {
    from(table: string) {
      return buildQuery(table);
    },
  };
}

function makeStorageClient(handlers: Record<string, (args: { bucket: string; path: string; expiresIn?: number }) => QueryResult>) {
  return {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl(path: string, expiresIn: number) {
            const h = handlers[`signed:${bucket}`];
            const r = h ? h({ bucket, path, expiresIn }) : { data: null, error: null };
            return Promise.resolve(r);
          },
          download(path: string) {
            const h = handlers[`download:${bucket}`];
            const r = h ? h({ bucket, path }) : { data: null, error: null };
            return Promise.resolve(r);
          },
        };
      },
    },
  };
}

function makeSupabaseServerClient(opts: {
  user: MockUser | null;
  tableHandlers: Record<string, (q: QueryState) => QueryResult>;
  storageHandlers?: Record<string, (args: { bucket: string; path: string; expiresIn?: number }) => QueryResult>;
}) {
  const auth = {
    getUser: () =>
      Promise.resolve({
        data: { user: opts.user },
        error: null,
      }),
  };
  return {
    auth,
    ...makeTableClient(opts.tableHandlers),
    ...(opts.storageHandlers ? makeStorageClient(opts.storageHandlers) : {}),
  };
}

function makeSupabaseServiceRoleClient(tableHandlers: Record<string, (q: QueryState) => QueryResult>) {
  return {
    ...makeTableClient(tableHandlers),
  };
}

vi.mock("@/lib/supabase/server", () => {
  return {
    createSupabaseServerClient: vi.fn(),
  };
});

vi.mock("@/lib/auth/supabaseAdmin", () => {
  return {
    createSupabaseServiceRoleClient: vi.fn(),
  };
});

const { createSupabaseServerClient } = await import("@/lib/supabase/server");
const { createSupabaseServiceRoleClient } = await import("@/lib/auth/supabaseAdmin");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("tenant/team access control (P0)", () => {
  it("denies listing runs when user has no team memberships", async () => {
    (createSupabaseServerClient as unknown as { mockResolvedValue: (x: unknown) => void }).mockResolvedValue(
      makeSupabaseServerClient({
        user: { id: "user-a" },
        tableHandlers: {
          team_members: (q) => {
            const hasUserFilter = q.filters.some(
              (f) => f.op === "eq" && f.k === "user_id" && f.v === "user-a"
            );
            return { data: hasUserFilter ? [] : [], error: null };
          },
        },
      })
    );

    const res = await runsListRoute.GET(new Request("http://localhost/api/runs"));
    expect(res.status).toBe(200);
    const body = (await jsonOf(res)) as RunsListBody;
    expect(body.ok).toBe(true);
    expect(body.runs).toEqual([]);
  });

  it("returns only team-scoped runs in list query (filters by team_id)", async () => {
    (createSupabaseServerClient as unknown as { mockResolvedValue: (x: unknown) => void }).mockResolvedValue(
      makeSupabaseServerClient({
        user: { id: "user-a" },
        tableHandlers: {
          team_members: () => ({ data: [{ team_id: "team-1" }], error: null }),
          runs: (q) => {
            const inFilter = q.filters.find((f) => f.op === "in" && f.k === "team_id") as
              | { op: "in"; k: string; v: unknown[] }
              | undefined;
            if (!inFilter) return { data: [], error: null };
            expect(inFilter.v).toEqual(["team-1"]);
            return { data: [{ id: "run-1" }], error: null };
          },
        },
      })
    );

    const res = await runsListRoute.GET(new Request("http://localhost/api/runs"));
    expect(res.status).toBe(200);
    const body = (await jsonOf(res)) as RunsListBody;
    expect(body.ok).toBe(true);
    expect(body.runs.length).toBe(1);
  });

  it("returns 404 for run detail when run has no mapping (does not exist)", async () => {
    (createSupabaseServiceRoleClient as unknown as { mockReturnValue: (x: unknown) => void }).mockReturnValue(
      makeSupabaseServiceRoleClient({
        govai_run_meters: () => ({ data: null, error: null }),
      })
    );
    (createSupabaseServerClient as unknown as { mockResolvedValue: (x: unknown) => void }).mockResolvedValue(
      makeSupabaseServerClient({
        user: { id: "user-a" },
        tableHandlers: {
          team_members: () => ({ data: { role: "member" }, error: null }),
          runs: () => ({ data: null, error: null }),
        },
      })
    );

    const res = await runDetailRoute.GET(new Request("http://localhost/api/runs/run-404"), {
      params: Promise.resolve({ id: "run-404" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for run detail when mapping exists but user is not team member", async () => {
    (createSupabaseServiceRoleClient as unknown as { mockReturnValue: (x: unknown) => void }).mockReturnValue(
      makeSupabaseServiceRoleClient({
        govai_run_meters: () => ({ data: { team_id: "team-2" }, error: null }),
      })
    );
    (createSupabaseServerClient as unknown as { mockResolvedValue: (x: unknown) => void }).mockResolvedValue(
      makeSupabaseServerClient({
        user: { id: "user-a" },
        tableHandlers: {
          team_members: () => ({ data: null, error: null }),
          runs: () => ({ data: { id: "run-x" }, error: null }),
        },
      })
    );

    const res = await runDetailRoute.GET(new Request("http://localhost/api/runs/run-x"), {
      params: Promise.resolve({ id: "run-x" }),
    });
    expect(res.status).toBe(403);
  });

  it("prevents creating signed URLs for non-member", async () => {
    (createSupabaseServiceRoleClient as unknown as { mockReturnValue: (x: unknown) => void }).mockReturnValue(
      makeSupabaseServiceRoleClient({
        govai_run_meters: () => ({ data: { team_id: "team-2" }, error: null }),
      })
    );
    (createSupabaseServerClient as unknown as { mockResolvedValue: (x: unknown) => void }).mockResolvedValue(
      makeSupabaseServerClient({
        user: { id: "user-a" },
        tableHandlers: {
          team_members: () => ({ data: null, error: null }),
        },
        storageHandlers: {
          "signed:packs": () => {
            throw new Error("should not be called");
          },
        },
      })
    );

    const res = await signedUrlsRoute.GET(
      new Request("http://localhost/api/storage/signed-urls?runId=run-x")
    );
    expect(res.status).toBe(403);
  });

  it("prevents downloading artifacts for non-member (bundle/evidence/audit)", async () => {
    (createSupabaseServiceRoleClient as unknown as { mockReturnValue: (x: unknown) => void }).mockReturnValue(
      makeSupabaseServiceRoleClient({
        govai_run_meters: () => ({ data: { team_id: "team-2" }, error: null }),
      })
    );
    (createSupabaseServerClient as unknown as { mockResolvedValue: (x: unknown) => void }).mockResolvedValue(
      makeSupabaseServerClient({
        user: { id: "user-a" },
        tableHandlers: {
          team_members: () => ({ data: null, error: null }),
        },
        storageHandlers: {
          "download:packs": () => {
            throw new Error("should not be called");
          },
          "download:evidence": () => {
            throw new Error("should not be called");
          },
          "download:audit": () => {
            throw new Error("should not be called");
          },
        },
      })
    );

    const resBundle = await bundleRoute.GET(new Request("http://localhost/api/bundle/run-x"), {
      params: Promise.resolve({ id: "run-x" }),
    });
    expect(resBundle.status).toBe(403);

    const resEv = await evidenceRoute.GET(new Request("http://localhost/api/raw/evidence/run-x"), {
      params: Promise.resolve({ id: "run-x" }),
    });
    expect(resEv.status).toBe(403);

    const resAudit = await auditRoute.GET(new Request("http://localhost/api/raw/audit/run-x"), {
      params: Promise.resolve({ id: "run-x" }),
    });
    expect(resAudit.status).toBe(403);
  });
});

