import React, { useState, useEffect } from 'react';
import { AIConfig, AIProvider } from '../types';

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  onConfigChange: (newConfig: AIConfig) => void;
}

const AIConfigModal: React.FC<AIConfigModalProps> = ({ isOpen, onClose, config, onConfigChange }) => {
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config, isOpen]);

  if (!isOpen) return null;
  
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as AIProvider;
    let model = '';
    let baseUrl: string | undefined = undefined;

    switch (newProvider) {
        case AIProvider.GEMINI:
            model = 'gemini-2.5-flash';
            break;
        case AIProvider.OPENAI:
            model = 'gpt-4o';
            break;
        case AIProvider.ANTHROPIC:
            model = 'claude-3-haiku-20240307';
            break;
        case AIProvider.OLLAMA:
            model = 'llama3'; // A sensible default for ollama
            baseUrl = 'http://localhost:11434';
            break;
        case AIProvider.MYSTYSTUDIO:
            model = 'codestral'; // A sensible default for Mystystudio
            baseUrl = 'http://localhost:8080';
            break;
    }

    const newConfig: AIConfig = {
        provider: newProvider,
        model,
        baseUrl,
    };
    setLocalConfig(newConfig);
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setLocalConfig(prev => ({ ...prev, [name]: value }));
  }

  const handleSave = () => {
      onConfigChange(localConfig);
      onClose();
  }

  const providerDetails = {
    [AIProvider.GEMINI]: {
        name: "Google Gemini",
        description: "Usa la clave de API de Gemini configurada en el servidor backend. Es el proveedor recomendado y por defecto."
    },
    [AIProvider.OPENAI]: {
        name: "OpenAI",
        description: "Usa la clave de API de OpenAI configurada en el servidor backend."
    },
    [AIProvider.ANTHROPIC]: {
        name: "Anthropic Claude",
        description: "Usa la clave de API de Anthropic configurada en el servidor backend."
    },
    [AIProvider.OLLAMA]: {
        name: "Ollama (Local)",
        description: "Conéctate a una instancia local de Ollama. Asegúrate de que Ollama esté en ejecución y sea accesible."
    },
    [AIProvider.MYSTYSTUDIO]: {
        name: "Mystystudio (Local)",
        description: "Conéctate a una instancia local de Mystystudio (u otro servidor compatible con OpenAI). Asegúrate de que el servidor esté en ejecución."
    },
  }

  const currentProvider = providerDetails[localConfig.provider];
  const isLocalProvider = localConfig.provider === AIProvider.OLLAMA || localConfig.provider === AIProvider.MYSTYSTUDIO;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#122024] border border-[#15333B] rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Configuración del Proveedor de IA</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-gray-300 mb-1">Proveedor</label>
            <select
              id="provider"
              name="provider"
              value={localConfig.provider}
              onChange={handleProviderChange}
              className="w-full px-3 py-2 bg-[#171925] border border-[#15333B] rounded-md text-sm outline-none focus:ring-1 focus:ring-[#B858FE]"
            >
              <option value={AIProvider.GEMINI}>{providerDetails.gemini.name}</option>
              <option value={AIProvider.OPENAI}>{providerDetails.openai.name}</option>
              <option value={AIProvider.ANTHROPIC}>{providerDetails.anthropic.name}</option>
              <option value={AIProvider.OLLAMA}>{providerDetails.ollama.name}</option>
              <option value={AIProvider.MYSTYSTUDIO}>{providerDetails.mystystudio.name}</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">{currentProvider.description}</p>
          </div>
           <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-300 mb-1">Nombre del Modelo</label>
                <input
                  type="text"
                  id="model"
                  name="model"
                  value={localConfig.model}
                  onChange={handleChange}
                  placeholder="e.g., gpt-4o, llama3, codestral"
                  className="w-full px-3 py-2 bg-[#171925] border border-[#15333B] rounded-md text-sm outline-none focus:ring-1 focus:ring-[#B858FE]"
                />
            </div>

            {isLocalProvider && (
                <div>
                    <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-300 mb-1">{currentProvider.name} Base URL</label>
                    <input
                      type="text"
                      id="baseUrl"
                      name="baseUrl"
                      value={localConfig.baseUrl || ''}
                      onChange={handleChange}
                      placeholder={localConfig.provider === AIProvider.OLLAMA ? "http://localhost:11434" : "http://localhost:8080"}
                      className="w-full px-3 py-2 bg-[#171925] border border-[#15333B] rounded-md text-sm outline-none focus:ring-1 focus:ring-[#B858FE]"
                    />
                    <p className="text-xs text-gray-500 mt-1">La URL donde tu servidor local está escuchando.</p>
                </div>
            )}
        </div>

        <div className="mt-6 flex justify-end">
            <button onClick={handleSave} className="px-5 py-2 bg-[#B858FE] text-black font-bold rounded-md hover:bg-[#a048e0] text-sm">
                Guardar y Cerrar
            </button>
        </div>
      </div>
    </div>
  );
};

export default AIConfigModal;