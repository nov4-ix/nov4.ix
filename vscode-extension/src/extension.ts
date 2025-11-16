import * as vscode from 'vscode';
import { CodeAssistantPanel } from './panels/CodeAssistantPanel';

export function activate(context: vscode.ExtensionContext) {
	// Register the command to open the WebView
	const startCommand = vscode.commands.registerCommand('son1k-go.start', () => {
		// FIX: Use context.extensionPath and convert to a Uri for compatibility with older API versions.
		CodeAssistantPanel.render(vscode.Uri.file(context.extensionPath));
	});

	context.subscriptions.push(startCommand);
}

export function deactivate() {}