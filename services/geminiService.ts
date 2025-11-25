import { GoogleGenAI } from "@google/genai";
import { AppConfig } from "../types";

// Vite injects process.env via define in vite.config.ts
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.warn("API_KEY is missing. Ensure it is set in process.env or vite config.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

export const generateContent = async (
  prompt: string,
  config: AppConfig
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: prompt,
      config: {
        systemInstruction: config.systemInstruction || undefined,
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
      },
    });

    if (!response.text) {
      throw new Error("Empty response text received");
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to generate content");
  }
};