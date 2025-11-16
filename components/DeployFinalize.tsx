import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Platform, Repository } from '../types';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import Button from './Button';
import { BackArrowIcon } from './icons/BackArrowIcon';
import Spinner from './Spinner';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { InfoIcon } from './icons/InfoIcon';
import { VercelIcon } from './icons/VercelIcon';
import { NetlifyIcon } from './icons/NetlifyIcon';
import { RailwayIcon } from './icons/RailwayIcon';
import { QuestionMarkCircleIcon } from './icons/QuestionMarkCircleIcon';
import hljs from 'highlight.js';

interface AnalysisResult {
    projectType: ProjectType;
    packageJson: any;
    checklist: ChecklistItem[];
}

enum ProjectType {
    NEXTJS = 'Next.js', VITE = 'Vite', CRA = 'Create React App', GENERIC_NODE = 'Generic Node.js', UNKNOWN = 'Unknown'
}
interface ChecklistItem {
    text: string; status: 'success' | 'warning' | 'error' | 'info'; details?: string;
}

// Config Generators (moved outside for clarity, but same logic)
const generateVercelConfig = (analysis: AnalysisResult | null) => {
    if (!analysis) return {};
    const { projectType, packageJson } = analysis;
    const config: any = { "$schema": "https://openapi.vercel.sh/vercel.json" };
    switch (projectType) {
        case ProjectType.NEXTJS: config.framework = "nextjs"; break;
        case ProjectType.VITE: config.framework = "vite"; config.outputDirectory = "dist"; config.buildCommand = packageJson?.scripts?.build || 'vite build'; break;
        case ProjectType.CRA: config.framework = "create-react-app"; config.outputDirectory = "build"; config.buildCommand = packageJson?.scripts?.build || 'react-scripts build'; break;
        default: config.note = "Vercel will attempt to auto-detect configuration.";
    }
    if (packageJson?.engines?.node) config.engines = { "node": packageJson.engines.node };
    return config;
};
const generateNetlifyConfig = (analysis: AnalysisResult | null) => { /* ... same logic ... */ return `...`; };
const generateRailwayConfig = (analysis: AnalysisResult | null) => { /* ... same logic ... */ return {}; };

const ConfigExplanation: React.FC<{ platform: Platform; analysis: AnalysisResult }> = ({ platform, analysis }) => { /* ... same component logic ... */ return <div>...</div>; };
const PlatformTab: React.FC<{ platform: Platform; selectedPlatform: Platform; onClick: (platform: Platform) => void; Icon: React.FC<React.SVGProps<SVGSVGElement>>;}> = ({ platform, selectedPlatform, onClick, Icon }) => ( /* ... same component logic ... */ <button>...</button> );


const DeployFinalize: React.FC = () => {
  const { token, deploymentConfig: config, setCurrentView } = useAppContext();
  
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(config!.platform);
  const [commitMessage, setCommitMessage] = useState(`feat: Add ${config!.platform} deployment configuration`);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const { repo } = config!;

  useEffect(() => {
    const analyzeRepo = async () => {
        if (!token) return;
        setIsLoadingAnalysis(true);
        let detectedType = ProjectType.UNKNOWN;
        let pkgJson: any = null;
        const newChecklist: ChecklistItem[] = [];
        try {
            const hasPackageJson = repo.fileTree.some(f => f.path === 'package.json');
            if (hasPackageJson) {
                newChecklist.push({ text: '`package.json` encontrado', status: 'success' });
                const { content } = await api.getFileContent(token, repo.owner.login, repo.name, 'package.json');
                pkgJson = JSON.parse(content);
                if (pkgJson?.dependencies?.['next']) detectedType = ProjectType.NEXTJS;
                else if (pkgJson?.devDependencies?.['vite'] || pkgJson?.dependencies?.['vite']) detectedType = ProjectType.VITE;
                else if (pkgJson?.dependencies?.['react-scripts']) detectedType = ProjectType.CRA;
                else detectedType = ProjectType.GENERIC_NODE;
                newChecklist.push({ text: `Tipo de proyecto detectado: ${detectedType}`, status: 'info' });
            } else {
                newChecklist.push({ text: 'No se encontró `package.json`', status: 'error' });
            }
            setAnalysisResult({ projectType: detectedType, packageJson: pkgJson, checklist: newChecklist });
        } catch (e) {
            newChecklist.push({ text: 'Error al analizar el repositorio', status: 'error', details: (e as Error).message });
            setAnalysisResult({ projectType: detectedType, packageJson: pkgJson, checklist: newChecklist });
        } finally {
            setIsLoadingAnalysis(false);
        }
    };
    analyzeRepo();
  }, [repo, token]);

  const { configFileContent, configFileName, deploymentUrl } = useMemo(() => {
    let content: string, name: string, url: string;
    const repoUrl = `https://github.com/${repo.owner.login}/${repo.name}`;
    switch(selectedPlatform) {
        case Platform.VERCEL: content = JSON.stringify(generateVercelConfig(analysisResult), null, 2); name = 'vercel.json'; url = `https://vercel.com/new/clone?repository-url=${repoUrl}`; break;
        case Platform.NETLIFY: content = generateNetlifyConfig(analysisResult) || ''; name = 'netlify.toml'; url = `https://app.netlify.com/start/deploy?repository=${repoUrl}`; break;
        case Platform.RAILWAY: content = JSON.stringify(generateRailwayConfig(analysisResult), null, 2); name = 'railway.json'; url = `https://railway.app/new/template?template=${repoUrl}`; break;
        default: content = ""; name = "config.txt"; url = repoUrl;
    }
    return { configFileContent: content, configFileName: name, deploymentUrl: url };
  }, [selectedPlatform, analysisResult, repo]);
  
  useEffect(() => {
      if (codeRef.current) hljs.highlightElement(codeRef.current);
  }, [configFileContent]);

  const handlePlatformChange = (platform: Platform) => {
      setSelectedPlatform(platform);
      setCommitMessage(`feat: Add ${platform} deployment configuration`);
  }

  const handleCommit = async () => {
    if (!token) return;
    setIsCommitting(true);
    setError(null);
    try {
      await api.commitConfigurationFile(token, repo.owner.login, repo.name, configFileName, configFileContent, commitMessage);
      setIsSuccess(true);
    } catch (err) {
      setError(`Failed to commit: ${(err as Error).message}`);
    } finally {
      setIsCommitting(false);
    }
  };
  
  if (isSuccess) { /* ... same success view logic ... */ return <div>...</div>; }
  if (!config) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => setCurrentView('DEPLOY_CONFIG')} className="flex items-center text-sm text-[#40FDAE] hover:text-[#35e09b] mb-4">
        <BackArrowIcon className="h-4 w-4 mr-1"/> Volver a la Configuración
      </button>
      <h2 className="text-3xl font-bold mb-2">Finalizar Despliegue</h2>
      <p className="text-gray-400 mb-6">Confirma los detalles para añadir el archivo de configuración a tu repositorio <strong>{repo.name}</strong>.</p>
      
      {/* ... The rest of the JSX is largely the same, but using context functions ... */}
    </div>
  );
};

export default DeployFinalize;