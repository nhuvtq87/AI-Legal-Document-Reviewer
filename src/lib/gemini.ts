import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface RiskItem {
  clauseName: string;
  riskLevel: "Low" | "Med" | "High";
  jargon: string;
  plainEnglish: string;
}

export interface AnalysisResult {
  executiveSummary: string;
  riskTable: RiskItem[];
  actionItems: string[];
}

const SYSTEM_INSTRUCTION = `You are a senior legal analyst and document specialist. Your goal is to ingest legal contracts and perform a high-precision audit.

Task Guidelines:
1. Red Flag Extraction: Identify clauses that are typically considered "unfriendly" to the signing party, such as auto-renewals without notice, uncapped liability, broad indemnification, or aggressive intellectual property assignments.
2. Jargon Translation: For every identified red flag or complex section, provide a "Plain English" translation that a non-lawyer can understand.
3. Tone: Be objective, cautious, and analytical. Use a structured format.
4. Safety Disclaimer: Always include a prominent note that this tool provides AI-generated analysis, not formal legal advice.

Output Format:
- Executive Summary: A 3-sentence overview of the document's risk level.
- Risk Table: Columns for [Clause Name], [Risk Level: Low/Med/High], [The Jargon], and [Plain English Meaning].
- Action Items: Recommended questions for the user to ask their legal counsel.`;

export async function analyzeDocument(
  fileData: string,
  mimeType: string
): Promise<AnalysisResult> {
  const model = "gemini-3.1-pro-preview";

  const prompt = "Please analyze the attached legal document according to your system instructions.";

  const parts = [
    {
      inlineData: {
        data: fileData,
        mimeType: mimeType,
      },
    },
    { text: prompt },
  ];

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.STRING,
            description: "A 3-sentence overview of the document's risk level.",
          },
          riskTable: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clauseName: { type: Type.STRING },
                riskLevel: { 
                  type: Type.STRING,
                  enum: ["Low", "Med", "High"]
                },
                jargon: { type: Type.STRING },
                plainEnglish: { type: Type.STRING },
              },
              required: ["clauseName", "riskLevel", "jargon", "plainEnglish"],
            },
          },
          actionItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Recommended questions for the user to ask their legal counsel.",
          },
        },
        required: ["executiveSummary", "riskTable", "actionItems"],
      },
    },
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(response.text) as AnalysisResult;
}

export async function askQuestionAboutDocument(
  fileData: string,
  mimeType: string,
  question: string,
  history: { role: "user" | "model"; parts: { text: string }[] }[] = []
): Promise<string> {
  const model = "gemini-3.1-pro-preview";

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: "You are a senior legal analyst. Answer questions about the provided legal document accurately and professionally. If the answer is not in the document, state that. Always include a disclaimer that this is not legal advice.",
    },
    history: history,
  });

  const response = await chat.sendMessage({
    message: [
      {
        inlineData: {
          data: fileData,
          mimeType: mimeType,
        },
      },
      { text: question },
    ],
  });

  return response.text || "I'm sorry, I couldn't generate an answer.";
}
