import React from 'react';
import { useAppContext } from './contexts/AppContext';

import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import RepoSelector from './components/RepoSelector';
import CodeAssistant from './components/CodeAssistant';
import DeployConfig from './components/DeployConfig';
import DeployFinalize from './components/DeployFinalize';
import Spinner from './components/Spinner';
import AIConfigModal from './components/AIConfigModal';

const App: React.FC = () => {
  const {
    currentView,
    isLoading,
    isVscode,
    selectedRepo,
    deploymentConfig,
    isAiConfigModalOpen,
    setIsAiConfigModalOpen,
    aiConfig,
    handleAiConfigChange,
  } = useAppContext();

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex items-center justify-center min-h-[calc(100vh-200px)]"><Spinner size="lg" /></div>;
    }

    if (currentView === 'LOGIN' && isVscode) {
      return <div className="flex items-center justify-center min-h-[calc(100vh-200px)]"><Spinner size="lg" /></div>;
    }

    switch (currentView) {
      case 'LOGIN':
        return <LoginScreen />;
      case 'REPO_SELECTOR':
        return <RepoSelector />;
      case 'CODE_ASSISTANT':
        return selectedRepo ? <CodeAssistant /> : null;
      case 'DEPLOY_CONFIG':
        return selectedRepo ? <DeployConfig /> : null;
      case 'DEPLOY_FINALIZE':
        return deploymentConfig ? <DeployFinalize /> : null;
      default:
        return <LoginScreen />;
    }
  };

  return (
    <div className="bg-[#1C232E] text-white min-h-screen font-sans">
      <Header />
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        {renderContent()}
      </main>
      <AIConfigModal
        isOpen={isAiConfigModalOpen}
        onClose={() => setIsAiConfigModalOpen(false)}
        config={aiConfig}
        onConfigChange={handleAiConfigChange}
      />
    </div>
  );
};

export default App;