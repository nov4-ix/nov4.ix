import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { User, Repository, AIConfig, AIProvider, DeploymentConfig, FileTreeItem } from '../types';
import { api } from '../services/api';
import { vscodeApi } from '../services/vscodeApi';
import { GitHubAPIError } from '../services/errors';

type AppView = 'LOGIN' | 'REPO_SELECTOR' | 'CODE_ASSISTANT' | 'DEPLOY_CONFIG' | 'DEPLOY_FINALIZE';

interface AppContextType {
  // State
  token: string | null;
  user: User | null;
  repos: Repository[];
  selectedRepo: Repository | null;
  deploymentConfig: DeploymentConfig | null;
  currentView: AppView;
  isLoading: boolean;
  error: string | null;
  aiConfig: AIConfig;
  isAiConfigModalOpen: boolean;
  isVscode: boolean;

  // Actions
  login: (token: string, remember: boolean) => void;
  logout: () => void;
  selectRepo: (repo: Repository) => void;
  proceedToFinalize: (config: DeploymentConfig) => void;
  refreshRepos: () => Promise<void>;
  refreshFileTree: () => Promise<void>;
  handleAiConfigChange: (newConfig: AIConfig) => void;
  setIsAiConfigModalOpen: (isOpen: boolean) => void;
  setCurrentView: (view: AppView) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const DEFAULT_AI_CONFIG: AIConfig = {
    provider: AIProvider.GEMINI,
    model: 'gemini-2.5-flash',
};

declare const acquireVsCodeApi: any;
const isVscode = typeof acquireVsCodeApi !== 'undefined';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [deploymentConfig, setDeploymentConfig] = useState<DeploymentConfig | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('LOGIN');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [isAiConfigModalOpen, setIsAiConfigModalOpen] = useState(false);

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('ai_config');
      if (savedConfig) setAiConfig(JSON.parse(savedConfig));
    } catch (e) {
      console.error("Failed to parse AI config", e);
    }
  }, []);

  const handleAiConfigChange = (newConfig: AIConfig) => {
    setAiConfig(newConfig);
    localStorage.setItem('ai_config', JSON.stringify(newConfig));
  };

  const loadInitialData = useCallback(async (githubToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const userData = await api.connectWithGithub(githubToken);
      setUser(userData);
      const repoData = await api.fetchRepositories(githubToken);
      setRepos(repoData);
      setCurrentView('REPO_SELECTOR');
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleApiError = (err: unknown) => {
    let message = "An unknown error occurred.";
    if (err instanceof GitHubAPIError) {
      if (err.isRateLimit) message = 'Límite de la API de GitHub alcanzado. Por favor, inténtalo de nuevo en una hora.';
      else if (err.statusCode === 401) message = 'Error de autenticación (401): Tu token de GitHub es inválido o ha expirado.';
      else message = `Error de la API de GitHub (${err.statusCode}): ${err.message}`;
    } else if (err instanceof Error) {
      message = err.message;
    }
    console.error("API Error:", err);
    setError(message);
    logout();
  };

  const login = async (newToken: string, remember: boolean) => {
    if (remember) localStorage.setItem('github_token', newToken);
    else sessionStorage.setItem('github_token', newToken);
    setToken(newToken);
    await loadInitialData(newToken);
  };
  
  const logout = () => {
    sessionStorage.removeItem('github_token');
    localStorage.removeItem('github_token');
    setToken(null);
    setUser(null);
    setSelectedRepo(null);
    setRepos([]);
    setCurrentView('LOGIN');
  };

  const selectRepo = (repo: Repository) => {
    setSelectedRepo(repo);
    setCurrentView('CODE_ASSISTANT');
  };

  const proceedToFinalize = (config: DeploymentConfig) => {
    setDeploymentConfig(config);
    setCurrentView('DEPLOY_FINALIZE');
  };

  const refreshRepos = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const repoData = await api.fetchRepositories(token);
      setRepos(repoData);
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVsCodeInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const initialData = await vscodeApi.request<{ user: User; repo: Repository; fileTree: FileTreeItem[] }>('getInitialData', {});
      const { user, repo, fileTree } = initialData;
      setUser(user);
      setSelectedRepo({ ...repo, fileTree });
      setToken('vscode-token'); // Dummy token
      setCurrentView('CODE_ASSISTANT');
    } catch (e) {
      setError(`Failed to init VS Code extension: ${(e as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshFileTree = async () => {
    if (isVscode) {
      await fetchVsCodeInitialData();
      return;
    }
    if (!token || !selectedRepo) return;
    try {
      const updatedRepo = await api.fetchSingleRepository(token, selectedRepo.owner.login, selectedRepo.name);
      setSelectedRepo(updatedRepo);
      setRepos(prev => prev.map(r => r.id === updatedRepo.id ? updatedRepo : r));
    } catch (err) {
      handleApiError(err);
    }
  };

  useEffect(() => {
    if (isVscode) {
      fetchVsCodeInitialData();
      const unsubscribe = vscodeApi.subscribe('refreshFileTree', fetchVsCodeInitialData);
      return () => unsubscribe();
    } else {
      const savedToken = localStorage.getItem('github_token') || sessionStorage.getItem('github_token');
      if (savedToken) {
        setToken(savedToken);
        loadInitialData(savedToken);
      } else {
        setIsLoading(false);
        setCurrentView('LOGIN');
      }
    }
  }, [isVscode, fetchVsCodeInitialData, loadInitialData]);

  const value = {
    token, user, repos, selectedRepo, deploymentConfig, currentView, isLoading, error,
    aiConfig, isAiConfigModalOpen, isVscode,
    login, logout, selectRepo, proceedToFinalize, refreshRepos, refreshFileTree,
    handleAiConfigChange, setIsAiConfigModalOpen, setCurrentView,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
