import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerationConfig,
} from "@google/generative-ai";
import { AIProviderConfig } from "../types";
import { logger } from "../utils/logger";

export class AIProvider {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: config.model,
      generationConfig: this.getGenerationConfig(),
    });
  }

  async generateContent(
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    try {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      logger.info("Calling Gemini API", {
        model: this.config.model,
        promptLength: fullPrompt.length,
        hasSystemPrompt: !!systemPrompt,
      });

      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;

      logger.info("Gemini API raw response details", {
        response: response,
        candidates: result.response.candidates,
        finishReason: result.response.candidates?.[0]?.finishReason,
        safetyRatings: result.response.candidates?.[0]?.safetyRatings,
      });

      const text = response.text();

      if (!text) {
        logger.error("No text content in Gemini response", {
          response: response,
          candidates: result.response.candidates,
          finishReason: result.response.candidates?.[0]?.finishReason,
          safetyRatings: result.response.candidates?.[0]?.safetyRatings,
        });
        throw new Error("No content received from Gemini");
      }

      logger.info("Gemini API response received", {
        responseLength: text.length,
      });
      return text.trim();
    } catch (error) {
      logger.error("Gemini API error:", {
        error: error instanceof Error ? error.message : "Unknown error",
        model: this.config.model,
        apiKey: this.config.apiKey ? "***" : "missing",
      });
      throw new Error(
        `AI processing failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async extractStructuredData<T>(
    prompt: string,
    schema: unknown,
    systemPrompt?: string
  ): Promise<T> {
    const enhancedPrompt = this.enhancePrompt(prompt, schema);
    logger.info("AI Provider - Enhanced Prompt:", { enhancedPrompt });
    const response = await this.generateContent(enhancedPrompt, systemPrompt);
    logger.info("AI Provider - Raw Response:", { response });
    const parsed = this.parseResponse<T>(response);
    logger.info("AI Provider - Parsed Response:", { parsed });
    return parsed;
  }

  private getGenerationConfig(): GenerationConfig {
    return {
      temperature: this.config.temperature,
      topP: 0.8,
      topK: 40,
    };
  }

  private enhancePrompt(prompt: string, schema: unknown): string {
    const schemaDescription = this.getSchemaDescription(schema);
    return `${prompt}\n\nReturn ONLY valid JSON that matches this schema: ${schemaDescription}`;
  }

  private getSchemaDescription(schema: unknown): string {
    // Check the actual schema type by looking at the _def.typeName
    if (schema && typeof schema === "object" && "_def" in schema) {
      const zodSchema = schema as any;
      const typeName = zodSchema._def?.typeName;

      logger.info("Schema detection debug:", {
        typeName,
        schemaType: typeof schema,
      });

      // Check if this is a Zod array schema (for transactions)
      if (typeName === "ZodArray") {
        logger.info("Detected transaction array schema");
        return JSON.stringify(
          [
            {
              date: "string (DD/MM/YYYY format)",
              description: "string (clean business name)",
              value: "number (positive number, expenses are positive)",
              type: "string (EXPENSE or INCOME)",
            },
          ],
          null,
          2
        );
      }

      // Check if this is a metadata schema (ZodObject with paymentMethod)
      if (typeName === "ZodObject") {
        const shape = zodSchema._def?.shape;
        logger.info("ZodObject shape debug:", {
          shapeKeys: shape ? Object.keys(shape) : [],
          hasPaymentMethod: shape && shape.paymentMethod,
          shape: shape,
          _def: zodSchema._def,
        });

        if (shape && shape.paymentMethod) {
          logger.info("Detected metadata schema");
          return JSON.stringify(
            {
              paymentMethod:
                "string (American Express, Visa, Mastercard, etc.)",
              creditCardLastFour: "string (last 4 digits, optional)",
              bankSourceType: "string (BANK_CREDIT or NON_BANK_CREDIT)",
              paymentMonth: "string (MM/YYYY format)",
              confidence: "number (0-1, confidence level)",
            },
            null,
            2
          );
        }
      }
    }

    // Default to structure analysis schema
    logger.info("Using default structure analysis schema");
    return JSON.stringify(
      {
        headerRow: "number (0-based index of header row)",
        dataStartRow: "number (0-based index of first data row)",
        columnMappings: {
          date: "number (0-based column index for date)",
          description: "number (0-based column index for description)",
          amount: "number (0-based column index for amount)",
        },
        fileType: "string (e.g., 'American Express', 'Visa', 'Bank statement')",
        confidence: "number (0-1, confidence in analysis)",
        summary: "string (brief description of file structure)",
      },
      null,
      2
    );
  }

  private parseResponse<T>(response: string): T {
    try {
      logger.info("AI Provider - Parsing response:", { response });
      const cleanedResponse = this.cleanJsonResponse(response);
      logger.info("AI Provider - Cleaned response:", { cleanedResponse });
      const parsed = JSON.parse(cleanedResponse) as T;
      logger.info("AI Provider - Successfully parsed:", { parsed });
      return parsed;
    } catch (error) {
      logger.error("Failed to parse Gemini response as JSON:", {
        response,
        error,
      });
      throw new Error("Invalid JSON response from AI provider");
    }
  }

  private cleanJsonResponse(response: string): string {
    let cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "");

    const jsonMatch = cleaned.match(/(\{.*\}|\[.*\])/s);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    return cleaned.trim();
  }
}
