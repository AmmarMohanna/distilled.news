import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FeedArt } from "./FeedArt";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("requests a missing owner sketch once and stops after provider failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST"
    ? new Response(JSON.stringify({ error: "AI unavailable" }), { status: 502, headers: { "content-type": "application/json" } })
    : new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const root = createRoot(document.createElement("div"));
  const feed = { id: "owner-test", ownerUsername: "owner", slug: "bitcoin", title: "Bitcoin" };
  await act(async () => { root.render(<FeedArt canGenerate feed={feed}/>); });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => { root.unmount(); });
});

it("does not generate or repeatedly poll missing public sketches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const root = createRoot(document.createElement("div"));
  await act(async () => { root.render(<FeedArt feed={{ ownerUsername: "owner", slug: "plants", title: "Plants" }}/>); });
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => { root.unmount(); });
});
