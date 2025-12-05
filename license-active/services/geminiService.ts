import { GoogleGenAI } from "@google/genai";
import { LicenseKey, KeyStatus } from "../types";

const apiKey = process.env.API_KEY || '';

// Initialize only if key exists to avoid immediate crash, though strict instructions say assume it exists.
const ai = new GoogleGenAI({ apiKey: apiKey });

export const generateKeyInsights = async (keys: LicenseKey[]): Promise<string> => {
  if (!apiKey) return "API Key not configured.";

  try {
    const activeCount = keys.filter(k => k.status === KeyStatus.ACTIVE).length;
    const validCount = keys.filter(k => k.status === KeyStatus.VALID).length;
    const revokedCount = keys.filter(k => k.status === KeyStatus.REVOKED).length;
    
    // Anonymized data summary for the prompt
    const summaryData = `
      Total Keys: ${keys.length}
      Active: ${activeCount}
      Valid (Unused): ${validCount}
      Revoked: ${revokedCount}
      Plans: ${JSON.stringify(keys.map(k => k.plan))}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a business analyst for a SaaS platform. 
      Analyze the following license key data summary and provide 3 short, actionable bullet points about the business health and user adoption trends.
      Keep it professional and concise.
      
      Data:
      ${summaryData}`,
    });

    return response.text || "No insights generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Unable to generate AI insights at this time.";
  }
};