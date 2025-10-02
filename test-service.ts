import axios from 'axios';

interface TestRequest {
  fileUrl: string;
  filename: string;
  userId?: string;
  options?: {
    confidenceThreshold: number;
    maxRetries: number;
    includeRawData: boolean;
  };
}

async function testService(): Promise<void> {
  try {
    console.log('Testing Excel extraction service...');
    
    const healthResponse = await axios.get('http://localhost:3000/api/health');
    console.log('Health check:', healthResponse.data);
    
    const testRequest: TestRequest = {
      fileUrl: 'https://my-expenses-private.s3.eu-west-3.amazonaws.com/imports/2d658b14-a669-439c-b7f6-163028793be6-4730_08_2025.xlsx',
      filename: '4730_08_2025.xlsx',
      userId: 'test-user-id',
      options: {
        confidenceThreshold: 0.7,
        maxRetries: 3,
        includeRawData: false
      }
    };
    
    console.log('Sending extraction request...');
    const extractionResponse = await axios.post('http://localhost:3000/api/extract', testRequest);
    console.log('Extraction result:', JSON.stringify(extractionResponse.data, null, 2));
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Test failed:', error.response?.data || error.message);
    } else {
      console.error('Test failed:', error);
    }
  }
}

testService();
