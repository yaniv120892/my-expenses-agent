import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
import { AIProviderConfig } from '../types';
import { logger } from '../utils/logger';

export class AIProvider {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: config.model,
      generationConfig: this.getGenerationConfig()
    });
  }

  async generateContent(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new Error('No content received from Gemini');
      }

      return text.trim();
    } catch (error) {
      logger.error('Gemini API error:', error);
      throw new Error(`AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractStructuredData<T>(prompt: string, schema: unknown, systemPrompt?: string): Promise<T> {
    const enhancedPrompt = this.enhancePrompt(prompt, schema);
    const response = await this.generateContent(enhancedPrompt, systemPrompt);
    return this.parseResponse<T>(response);
  }

  private getGenerationConfig(): GenerationConfig {
    return {
      maxOutputTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      topP: 0.8,
      topK: 40,
    };
  }

  private enhancePrompt(prompt: string, schema: unknown): string {
    return `${prompt}\n\nReturn ONLY valid JSON that matches this schema: ${JSON.stringify(schema)}`;
  }

  private parseResponse<T>(response: string): T {
    try {
      const cleanedResponse = this.cleanJsonResponse(response);
      return JSON.parse(cleanedResponse) as T;
    } catch (error) {
      logger.error('Failed to parse Gemini response as JSON:', { response, error });
      throw new Error('Invalid JSON response from AI provider');
    }
  }

  private cleanJsonResponse(response: string): string {
    let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    const jsonMatch = cleaned.match(/(\{.*\}|\[.*\])/s);
    if (jsonMatch) {
      return jsonMatch[1];
    }
    
    return cleaned.trim();
  }
}
