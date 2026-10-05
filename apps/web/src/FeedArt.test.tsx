import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FeedArt } from "./FeedArt";
import { transparentSketch } from "./sketchImage";

vi.mock("./sketchImage", () => ({ transparentSketch: vi.fn() }));

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

it("displays the original image if browser transparency conversion fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(transparentSketch).mockRejectedValueOnce(new Error("Canvas unavailable"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([255, 216]), { headers: { "content-type": "image/jpeg" } })));
  const createObjectURL = vi.fn(() => "blob:original-image");
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(<FeedArt feed={{ ownerUsername: "owner", slug: "science", title: "Science" }}/>); });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:original-image");
  expect(container.textContent).not.toContain("Illustration unavailable");
  await act(async () => { root.unmount(); });
});

it("allows an explicit retry after generation failure without retrying automatically", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST"
    ? new Response(JSON.stringify({ error: "AI unavailable" }), { status: 502, headers: { "content-type": "application/json" } })
    : new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(<FeedArt canGenerate feed={{ id: "retry-test", ownerUsername: "owner", slug: "retry", title: "Retry" }}/>); });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => { container.querySelector("button")!.click(); });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  await act(async () => { root.unmount(); });
});

it("keeps old artwork visible while the owner generates its replacement", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(transparentSketch).mockRejectedValue(new Error("Canvas unavailable"));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:saved-art"), revokeObjectURL: vi.fn() });
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST"
    ? new Response(JSON.stringify({ error: "AI unavailable" }), { status: 502, headers: { "content-type": "application/json" } })
    : new Response(new Uint8Array([255, 216]), { headers: { "content-type": "image/jpeg", "x-sketch-current": "false" } }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(<FeedArt canGenerate feed={{ id: "stale-test", ownerUsername: "owner", slug: "old", title: "Old artwork" }}/>); });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:saved-art");
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => { root.unmount(); });
});
