import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIConfig } from '../../types'; // Adjust path based on your final structure

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- Type definitions for request bodies ---
interface GenerateCodeParams {
    config: AIConfig; fileContent: string; userInstruction: string; fileName: string; fullFileTree: string; aiRules: string;
}
interface AnalyzeProjectParams {
    config: AIConfig; fileTree: string; filesContent: { path: string; content: string }[];
}
interface ApplySuggestionParams {
    config: AIConfig; fileContent: string; finding: any; userRefinement: string;
}
interface CleanupParams {
    config: AIConfig; fileTree: string;
}

// --- Unified Error Handling ---
const handleError = (res: Response, error: unknown, context: string) => {
    console.error(`Error in ${context}:`, error);
    const message = error instanceof Error ? error.message : "An unknown server error occurred.";
    res.status(500).json({ error: `Server error during ${context}: ${message}` });
};

// --- Helper to check for local providers ---
const isLocalProvider = (provider: AIProvider) => {
    return provider === AIProvider.OLLAMA || provider === AIProvider.MYSTYSTUDIO;
}

// --- Main Proxy Endpoint ---
app.post('/api/v1/ai/:action', async (req: Request, res: Response) => {
    const { action } = req.params;

    try {
        switch (action) {
            case 'generate-suggestion':
                await handleGenerateSuggestion(req, res);
                break;
            case 'analyze-project':
                await handleAnalyzeProject(req, res);
                break;
            case 'apply-suggestion':
                await handleApplySuggestion(req, res);
                break;
            case 'cleanup-suggestions':
                await handleCleanupSuggestions(req, res);
                break;
            default:
                res.status(404).json({ error: 'Unknown AI action' });
        }
    } catch (error) {
        handleError(res, error, `AI action: ${action}`);
    }
});

// --- Local Provider API Call Helper ---
async function callLocalProvider(baseUrl: string, model: string, system: string, prompt: string) {
    const endpoint = baseUrl.includes('ollama') ? `${baseUrl}/api/chat` : `${baseUrl}/v1/chat/completions`; // Support OpenAI-compatible servers
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
            stream: false,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Local API error (${response.status}): ${errorBody}`);
    }
    
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? data?.message?.content ?? '';
}

// --- Action Handlers ---

async function handleGenerateSuggestion(req: Request, res: Response) {
    const { config, fileContent, userInstruction, fileName } = req.body as GenerateCodeParams;
    let suggestion = '';

    const systemInstruction = `You are an expert software engineer AI assistant. Your task is to help the user with their code.
Respond ONLY with the full, updated code for the file \`${fileName}\`.
Do NOT include any other text, preamble, or explanation.
Do NOT use markdown code fences. Just the raw code.`;

    const prompt = `Original code from \`${fileName}\`:\n\`\`\`\n${fileContent}\n\`\`\`\n\nUser instruction: "${userInstruction}"\n\nPlease provide the full updated code for \`${fileName}\`.`;

    if (isLocalProvider(config.provider)) {
        if (!config.baseUrl) throw new Error(`${config.provider} requires a baseUrl.`);
        suggestion = await callLocalProvider(config.baseUrl, config.model, systemInstruction, prompt);

    } else if (config.provider === AIProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({ model: config.model, contents: prompt, config: { systemInstruction } });
        suggestion = response.text;
    } else if (config.provider === AIProvider.OPENAI) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
            model: config.model,
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }],
        });
        suggestion = response.choices[0].message.content ?? '';
    } else if (config.provider === AIProvider.ANTHROPIC) {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
            model: config.model,
            system: systemInstruction,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
        });
        suggestion = response.content[0].text;
    }

    res.json({ suggestion });
}

async function handleAnalyzeProject(req: Request, res: Response) {
    const { config, fileTree, filesContent } = req.body as AnalyzeProjectParams;
    const filesContentString = filesContent.map(file => `--- FILE: ${file.path} ---\n\`\`\`\n${file.content}\n\`\`\``).join('\n\n');
    const prompt = `Here is the project's file structure:\n${fileTree}\n\nHere is the content of key files:\n${filesContentString}\n\nPlease analyze the project and identify potential issues or improvements.`;
    
    let findingsText = '';
    
    if (config.provider === AIProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const systemInstruction = `You are an expert senior software engineer performing a code review. Respond ONLY with a valid JSON array of objects...`;
        const response = await ai.models.generateContent({
            model: config.model, contents: prompt,
            config: {
                systemInstruction, responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.OBJECT, properties: { file: { type: Type.STRING }, line: { type: Type.INTEGER }, severity: { type: Type.STRING, enum: ['error', 'warning', 'suggestion'] }, description: { type: Type.STRING }, suggestion: { type: Type.STRING } }, required: ['file', 'severity', 'description', 'suggestion'] }
                }
            }
        });
        findingsText = response.text;
    } else if (isLocalProvider(config.provider)) {
        if (!config.baseUrl) throw new Error(`${config.provider} requires a baseUrl.`);
        const systemInstruction = `You are an expert senior software engineer performing a code review. Your task is to analyze the provided files and respond with potential issues.
You MUST respond with ONLY a valid JSON array of objects. Do not include any other text or markdown fences.
Each object in the array must have the following properties: "file" (string), "line" (number, optional), "severity" (string, one of 'error', 'warning', 'suggestion'), "description" (string), and "suggestion" (string).`;
        findingsText = await callLocalProvider(config.baseUrl, config.model, systemInstruction, prompt);
    } else {
        return res.status(400).json({ error: `Project analysis is not currently supported for the '${config.provider}' provider.` });
    }
    
    try {
        const findings = JSON.parse(findingsText);
        res.json({ findings });
    } catch (e) {
        throw new Error(`The AI model returned invalid JSON. Response: ${findingsText}`);
    }
}

async function handleApplySuggestion(req: Request, res: Response) {
    const { config, fileContent, finding, userRefinement } = req.body as ApplySuggestionParams;
    const systemInstruction = `You are an expert AI programmer. Your task is to apply a suggested code change to a file.
Respond ONLY with the full, updated code for the file.
Do NOT include any other text, preamble, or explanation. Do NOT use markdown code fences.`;

    const prompt = `File: \`${finding.file}\`\n\n--- ORIGINAL CODE ---\n\`\`\`\n${fileContent}\n\`\`\`\n\n--- ANALYSIS FINDING ---\nDescription: ${finding.description}\nOriginal Suggestion: ${finding.suggestion}\n\n--- USER REFINEMENT ---\n${userRefinement || "No specific refinement."}\n\n--- TASK ---\nBased on all the information above, provide the full and complete updated code for the file.`;
    
    let newCode = '';

    if (config.provider === AIProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({ model: config.model, contents: prompt, config: { systemInstruction } });
        newCode = response.text;
    } else if (isLocalProvider(config.provider)) {
        if (!config.baseUrl) throw new Error(`${config.provider} requires a baseUrl.`);
        newCode = await callLocalProvider(config.baseUrl, config.model, systemInstruction, prompt);
    } else {
        return res.status(400).json({ error: `Applying suggestions is not currently supported for the '${config.provider}' provider.` });
    }
    
    res.json({ newCode });
}

async function handleCleanupSuggestions(req: Request, res: Response) {
    const { config, fileTree } = req.body as CleanupParams;
    const prompt = `Analyze the following file tree and identify unnecessary files (e.g., build artifacts, logs, duplicate configs, etc.).\nFile Tree:\n\`\`\`\n${fileTree}\n\`\`\``;
    let suggestionsText = '';

    if (config.provider === AIProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const systemInstruction = `You are an expert software engineer... Respond ONLY with a valid JSON array of objects...`;
        const response = await ai.models.generateContent({
            model: config.model, contents: prompt,
            config: {
                systemInstruction, responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.OBJECT, properties: { path: { type: Type.STRING }, reason: { type: Type.STRING } }, required: ['path', 'reason'] }
                }
            }
        });
        suggestionsText = response.text;
    } else if (isLocalProvider(config.provider)) {
        if (!config.baseUrl) throw new Error(`${config.provider} requires a baseUrl.`);
        const systemInstruction = `You are an expert software engineer tasked with identifying unnecessary files in a project.
You MUST respond with ONLY a valid JSON array of objects. Do not include any other text or markdown fences.
Each object in the array must have two properties: "path" (string) and "reason" (string).`;
        suggestionsText = await callLocalProvider(config.baseUrl, config.model, systemInstruction, prompt);
    } else {
        return res.status(400).json({ error: `Repo cleanup is not currently supported for the '${config.provider}' provider.` });
    }
    
     try {
        const suggestions = JSON.parse(suggestionsText);
        res.json({ suggestions });
    } catch (e) {
        throw new Error(`The AI model returned invalid JSON. Response: ${suggestionsText}`);
    }
}

app.listen(port, () => {
    console.log(`🚀 Son1k-GO! Backend Proxy is running on http://localhost:${port}`);
});