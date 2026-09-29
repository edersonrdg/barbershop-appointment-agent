import { GoogleGenAI } from '@google/genai';
import type { Registry } from 'prom-client';
import {
  GeminiConfig,
  GeminiMessageInterpreter,
} from './gemini-message-interpreter';

// Builds the Gemini client here, so `@google/genai` stays in this folder.
export function createGeminiMessageInterpreter(
  config: GeminiConfig & { apiKey: string },
  registry: Registry,
): GeminiMessageInterpreter {
  const { apiKey, ...interpreterConfig } = config;
  return new GeminiMessageInterpreter(
    interpreterConfig,
    new GoogleGenAI({ apiKey }).models,
    registry,
  );
}
