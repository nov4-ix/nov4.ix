import { AIConfig, ProjectAnalysisFinding, RepoCleanupSuggestion } from "../types";

const BACKEND_URL = 'http://localhost:3001/api/v1/ai';

// --- API Wrapper for the Backend Proxy ---
const callAIProxy = async <T>(endpoint: string, body: object, signal?: AbortSignal): Promise<T> => {
    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error from AI proxy: ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.log('AI request was aborted.');
            throw error; // Re-throw so the UI can handle it
        }
        console.error(`Error calling AI proxy endpoint ${endpoint}:`, error);
        throw new Error(`Failed to communicate with the AI service. Is the backend running? Details: ${(error as Error).message}`);
    }
};

// --- Main API Abstraction ---
export interface GenerateCodeParams {
    config: AIConfig;
    fileContent: string;
    userInstruction: string;
    fileName: string;
    fullFileTree: string;
    aiRules: string;
    signal: AbortSignal;
}

export const generateCodeSuggestion = async (params: GenerateCodeParams): Promise<string> => {
    const { suggestion } = await callAIProxy<{ suggestion: string }>('/generate-suggestion', params, params.signal);
    return suggestion;
};


// --- Project Analysis ---
export interface GenerateProjectAnalysisParams {
    config: AIConfig;
    fileTree: string;
    filesContent: { path: string; content: string }[];
}

export const generateProjectAnalysis = async (params: GenerateProjectAnalysisParams): Promise<ProjectAnalysisFinding[]> => {
    const { findings } = await callAIProxy<{ findings: ProjectAnalysisFinding[] }>('/analyze-project', params);
    return findings;
};

// --- Apply Project Analysis Suggestion ---
export interface ApplyAnalysisSuggestionParams {
    config: AIConfig;
    fileContent: string;
    finding: ProjectAnalysisFinding;
    userRefinement: string;
}

export const applyProjectAnalysisSuggestion = async (params: ApplyAnalysisSuggestionParams): Promise<string> => {
    const { newCode } = await callAIProxy<{ newCode: string }>('/apply-suggestion', params);
    return newCode;
};


// --- Repo Cleanup ---
export interface GenerateRepoCleanupParams {
    config: AIConfig;
    fileTree: string;
}

export const generateRepoCleanupSuggestions = async (params: GenerateRepoCleanupParams): Promise<RepoCleanupSuggestion[]> => {
    const { suggestions } = await callAIProxy<{ suggestions: RepoCleanupSuggestion[] }>('/cleanup-suggestions', params);
    return suggestions;
}