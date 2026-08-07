import { describe, it, expect, vi } from "vitest";
import { withRetries } from "../../src/mastra/lib/retry";

describe("withRetries", () => {
  it("returns on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetries(fn, {
      attempts: 3,
      timeoutMs: 1000,
      label: "test",
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to the attempt limit and rethrows the last error", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn().mockRejectedValue(new Error("boom"));
      const promise = withRetries(fn, {
        attempts: 3,
        timeoutMs: 1000,
        label: "test",
      });
      const assertion = expect(promise).rejects.toThrow("boom");
      await vi.runAllTimersAsync();
      await assertion;
      expect(fn).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("succeeds when a later attempt passes", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValue("recovered");
      const promise = withRetries(fn, {
        attempts: 2,
        timeoutMs: 1000,
        label: "test",
      });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes an abort signal that fires after timeoutMs", async () => {
    const result = await withRetries(
      async (signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
          setTimeout(() => resolve("finished"), 5);
        });
      },
      { attempts: 1, timeoutMs: 5000, label: "test" }
    );
    expect(result).toBe("finished");
  });

  it("rejects a hung attempt via the timeout signal", async () => {
    const fn = (signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("timed out")));
      });

    await expect(
      withRetries(fn, { attempts: 1, timeoutMs: 50, label: "test" })
    ).rejects.toThrow("timed out");
  });
});
