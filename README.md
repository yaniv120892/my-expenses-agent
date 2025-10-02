# Excel Extraction Service

AI-powered microservice for extracting transaction data from Excel files using OpenAI's GPT models.

## Features

- **AI-Powered Extraction**: Uses GPT-4 to intelligently parse Excel files
- **Multiple Format Support**: Handles various bank and credit card statement formats
- **Structured Output**: Returns validated JSON with transaction data and metadata
- **S3 Integration**: Downloads files directly from S3 URLs
- **Type Safety**: Full TypeScript support with Zod validation
- **Error Handling**: Comprehensive error handling and logging

## API Endpoints

### POST /api/extract

Extract transaction data from an Excel file.

**Request Body:**
```json
{
  "fileUrl": "https://s3.amazonaws.com/bucket/file.xlsx",
  "filename": "statement.xlsx",
  "userId": "user-uuid",
  "options": {
    "confidenceThreshold": 0.7,
    "maxRetries": 3,
    "includeRawData": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "date": "01/08/2025",
        "description": "Business Name",
        "value": 100.50,
        "type": "EXPENSE"
      }
    ],
    "metadata": {
      "paymentMethod": "American Express",
      "creditCardLastFour": "4730",
      "bankSourceType": "NON_BANK_CREDIT",
      "paymentMonth": "08/2025",
      "confidence": 0.95
    },
    "structure": {
      "headerRow": 4,
      "dataStartRow": 5,
      "columnMappings": {
        "date": 0,
        "description": 1,
        "amount": 2
      },
      "fileType": "American Express",
      "confidence": 0.9,
      "summary": "Standard Amex format detected"
    },
    "processingNotes": [
      "File downloaded and parsed successfully",
      "Structure analysis completed: Standard Amex format detected",
      "Metadata extracted with confidence: 0.95",
      "Extracted 15 transactions"
    ],
    "processingTime": 2500
  },
  "message": "Data extracted successfully",
  "requestId": "uuid"
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "excel-extraction-service",
  "timestamp": "2025-10-02T14:00:00.000Z",
  "version": "1.0.0"
}
```

## Environment Variables

```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

OPENAI_API_KEY=your_openai_api_key
AI_MODEL=gpt-4-turbo
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.1
AI_TIMEOUT=60000

S3_REGION=eu-west-3
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=my-expenses-private
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Testing

```bash
# Test the service (make sure it's running first)
node test-service.js
```

## Architecture

The service follows a clean architecture pattern:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic for Excel processing and AI integration
- **Types**: TypeScript interfaces and Zod schemas for validation
- **Utils**: Logging and utility functions

## AI Processing Flow

1. **Download**: Fetch Excel file from S3 URL
2. **Structure Analysis**: AI analyzes file structure and identifies columns
3. **Metadata Extraction**: AI extracts payment method, card number, etc.
4. **Transaction Extraction**: AI extracts all transaction data
5. **Validation**: Clean and validate extracted data
6. **Response**: Return structured JSON with results

## Supported File Formats

- American Express statements
- Visa/Mastercard statements
- CAL credit card statements
- Bank account statements
- Various Hebrew and English formats

The AI can adapt to new formats without code changes.
