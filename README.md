# Excel Extraction Service

AI-powered Excel data extraction microservice built on [Mastra](https://mastra.ai). It downloads a credit-card/bank statement from S3, runs a multi-step AI workflow (Gemini) to detect the sheet structure, extract statement metadata, and extract all transactions, then reports the result back over a webhook.

## Architecture

The pipeline is a Mastra workflow (`excelExtractionWorkflow`) with five steps:

1. **download-and-parse** — downloads the file from S3 and parses the first sheet (retries S3 transients).
2. **analyze-structure** — a Gemini agent identifies the header row, data start row, and date/description/amount column indices.
3. **extract-metadata** — a Gemini agent extracts the card's last four digits, payment month (MM/YYYY), and bank source type (Hebrew-aware prompts).
4. **extract-transactions** — a Gemini agent extracts transactions in chunks (`EXTRACTION_CHUNK_SIZE`, default 200 rows per call — no row cap). When `includeRawData` is requested, the original row cells are attached to each transaction.
5. **validate-and-clean** — pure validation/cleaning (drops invalid rows, normalizes descriptions, warns on low confidence).

All AI calls use zod-schema structured output (validated at runtime), honor the per-request `options.maxRetries` with exponential backoff, and are bounded by `AI_TIMEOUT` per attempt.

Request state lives in Upstash Redis (`extraction_request:<requestId>`, 24h TTL) with the lifecycle `PENDING → PROCESSING → COMPLETED | FAILED`. Extraction runs asynchronously after the API responds; on Vercel the invocation is kept alive with `waitUntil` until the workflow and webhook delivery finish.

## API

### `POST /api/extract`

```json
{
  "fileUrl": "https://<bucket>.s3.<region>.amazonaws.com/imports/file.xlsx",
  "filename": "file.xlsx",
  "userId": "uuid (optional)",
  "webhookUrl": "https://api.example.com/excel-extraction-agent/webhook?token=...",
  "options": {
    "confidenceThreshold": 0.7,
    "maxRetries": 3,
    "includeRawData": false
  }
}
```

Responds `202` with `{ success, message, requestId, status: "PENDING", timestamp }`. When processing finishes, the service POSTs to `webhookUrl` **exactly as given** (query string preserved) with:

```json
{
  "requestId": "uuid",
  "status": "COMPLETED | FAILED",
  "result": { "transactions": [], "metadata": {}, "structure": {}, "processingNotes": [], "processingTime": 0 },
  "error": "only on FAILED",
  "completedAt": "ISO timestamp"
}
```

Webhook delivery is retried 3 times with exponential backoff.

### `GET /api/status/:requestId`

Returns the stored request state (`requestId`, `status`, timestamps, `error?`, `result?`); `404` if unknown/expired.

### `GET /api/health`

`200` when Redis is reachable, `503` otherwise.

Mastra's built-in server routes (agents/workflows introspection, playground APIs) are mounted under `/mastra-api` so they never collide with the public contract above.

## Development

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # mastra dev — serves on http://localhost:4111 with playground
```

Manual end-to-end test:

```bash
npm run webhook-receiver   # terminal 1: local webhook sink on :3004
TEST_FILE_URL="https://<bucket>.s3.<region>.amazonaws.com/imports/<file>.xlsx" npm test   # terminal 2
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run build` (produces `.vercel/output` + `.mastra/output`).

## Deployment (Vercel)

The Mastra Vercel deployer is configured in `src/mastra/index.ts` (`maxDuration: 300`, `memory: 1024`). Vercel project settings: Build Command `npm run build`, Framework "Other", Node **22.x** (the function runtime is stamped from the build-time Node version). Set all env vars from `.env.example` in the Vercel project.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API key | required |
| `AI_TEMPERATURE` | Model temperature | `0.1` |
| `AI_TIMEOUT` | Per-attempt AI call timeout (ms) | `60000` |
| `EXTRACTION_CHUNK_SIZE` | Data rows per transaction-extraction AI call | `200` |
| `FILE_SERVICE_PROVIDER` | Only `s3` is supported | `s3` |
| `FILE_SERVICE_REGION` / `FILE_SERVICE_ACCESS_KEY_ID` / `FILE_SERVICE_SECRET_ACCESS_KEY` / `FILE_SERVICE_BUCKET_NAME` | S3 access | required |
| `REDIS_URL` / `REDIS_TOKEN` | Upstash Redis REST credentials | required |
| `PORT` | Local dev server port | `4111` |
| `LOG_LEVEL` | Pino log level | `info` |
