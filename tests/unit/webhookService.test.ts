import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWebhookWithRetry } from "../../src/mastra/lib/webhookService";
import { RequestStatus, WebhookPayload } from "../../src/mastra/types/schemas";

const payload: WebhookPayload = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  status: RequestStatus.COMPLETED,
  completedAt: new Date().toISOString(),
};

const WEBHOOK_URL =
  "http://api.example.com/excel-extraction-agent/webhook?token=abc%2F123&userId=u1&timestamp=170000";

describe("sendWebhookWithRetry", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("posts the payload to the exact URL including the query string", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await sendWebhookWithRetry(WEBHOOK_URL, payload);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["User-Agent"]).toBe("excel-extraction-service/1.0.0");
    expect(JSON.parse(init.body)).toMatchObject({
      requestId: payload.requestId,
      status: "COMPLETED",
    });
  });

  it("retries with backoff on non-2xx responses and returns false after all attempts", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const promise = sendWebhookWithRetry(WEBHOOK_URL, payload, 3);
    await vi.runAllTimersAsync();

    expect(await promise).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers when a retry succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue({ ok: true, status: 200 });

    const promise = sendWebhookWithRetry(WEBHOOK_URL, payload, 3);
    await vi.runAllTimersAsync();

    expect(await promise).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits exponentially between attempts (1s then 2s)", async () => {
    fetchMock.mockRejectedValue(new Error("down"));

    const promise = sendWebhookWithRetry(WEBHOOK_URL, payload, 3);

    // Attempt 1 fires immediately.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Attempt 2 only after the 1s backoff.
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Attempt 3 only after the 2s backoff.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(await promise).toBe(false);
  });
});
