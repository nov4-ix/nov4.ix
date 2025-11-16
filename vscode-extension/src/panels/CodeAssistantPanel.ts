import * as vscode from "vscode";
import * as path from "path";
import { getNonce } from "../utilities/getNonce";
import { FileTreeItem, User, Repository } from "../types";

export class CodeAssistantPanel {
  public static currentPanel: CodeAssistantPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent(this._panel.webview);
    this._setWebviewMessageListener(this._panel.webview);
  }

  public static render(extensionUri: vscode.Uri) {
    if (CodeAssistantPanel.currentPanel) {
      CodeAssistantPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "son1k-go-assistant",
        "Son1k-GO! Assistant",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, '..'))]
        }
      );
      CodeAssistantPanel.currentPanel = new CodeAssistantPanel(panel, extensionUri);
    }
  }
  
  public dispose() {
    CodeAssistantPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
  
  private _setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      async (message: { command: string; payload: any, requestId: string }) => {
        const { command, payload, requestId } = message;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        const respond = (data: any, error?: string) => {
            webview.postMessage({ command: 'response', requestId, payload: data, error });
        };

        if (!workspaceFolder && command !== 'getInitialData') { 
            respond(null, "No workspace is open.");
            return;
        }

        switch (command) {
          case 'getInitialData': {
            if (!workspaceFolder) {
                respond(null, "No workspace folder is open. Please open a project to use the assistant.");
                return;
            }
            const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/dist/**,**/.git/**,**/.vscode/**}');
            const fileTree: FileTreeItem[] = files.map(file => ({
                path: vscode.workspace.asRelativePath(file), type: 'blob', sha: '',
            }));
            
            const initialData = {
                user: { id: 'vscode-user', name: 'VS Code User', avatarUrl: '' } as User,
                repo: {
                  id: `vscode-repo-${workspaceFolder.uri.fsPath}`, name: workspaceFolder.name, owner: { login: 'local' },
                  description: 'A local project open in VS Code.', private: true, updatedAt: new Date().toISOString(),
                  language: 'Local', defaultBranch: 'main', fileTree: []
                } as Repository,
                fileTree
            };
            respond(initialData);
            return;
          }
          case 'getFileContent': {
            try {
                if (!workspaceFolder) throw new Error("Workspace not available");
                const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, payload.path));
                const document = await vscode.workspace.openTextDocument(fileUri);
                const content = document.getText();
                respond({ content, sha: new Date().getTime().toString() });
            } catch (e) {
                respond(null, `Failed to read file ${payload.path}: ${(e as Error).message}`);
            }
            return;
          }
          case 'updateFileContent': {
              try {
                  if (!workspaceFolder) throw new Error("Workspace not available");
                  const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, payload.path));
                  const document = await vscode.workspace.openTextDocument(fileUri);
                  const edit = new vscode.WorkspaceEdit();
                  const fullRange = new vscode.Range(
                      document.positionAt(0),
                      document.positionAt(document.getText().length)
                  );
                  edit.replace(fileUri, fullRange, payload.newContent);
                  const success = await vscode.workspace.applyEdit(edit);
                  if (success) {
                    await document.save();
                    respond({ newSha: new Date().getTime().toString() });
                  } else {
                    respond(null, `Failed to apply edit for ${payload.path}`);
                  }
              } catch (e) {
                  respond(null, `Failed to write file ${payload.path}: ${(e as Error).message}`);
              }
              return;
          }
           case 'deleteFile': {
              try {
                  if (!workspaceFolder) throw new Error("Workspace not available");
                  const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, payload.path));
                  const confirmation = await vscode.window.showWarningMessage(
                      `Are you sure you want to delete ${payload.path}? This action cannot be undone.`,
                      { modal: true },
                      'Delete'
                  );
                  if (confirmation === 'Delete') {
                      const edit = new vscode.WorkspaceEdit();
                      // FIX: Removed invalid `useTrash` option.
                      edit.deleteFile(fileUri, { recursive: false });
                      const success = await vscode.workspace.applyEdit(edit);

                      if (success) {
                        webview.postMessage({ command: 'refreshFileTree' });
                        respond({ success: true });
                      } else {
                        respond(null, "Failed to apply delete operation.");
                      }
                  } else {
                      respond(null, "Deletion cancelled by user.");
                  }
              } catch (e) {
                  respond(null, `Failed to delete file ${payload.path}: ${(e as Error).message}`);
              }
              return;
          }
           case 'createFile': {
              try {
                  if (!workspaceFolder) throw new Error("Workspace not available");
                  const newFilePath = await vscode.window.showInputBox({
                      prompt: "Enter the path for the new file",
                      placeHolder: "e.g., src/components/NewComponent.tsx",
                  });
                  if (newFilePath) {
                      const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, newFilePath));
                      const edit = new vscode.WorkspaceEdit();
                      edit.createFile(fileUri, { ignoreIfExists: true });
                      const success = await vscode.workspace.applyEdit(edit);
                      if (success) {
                        // Write empty content to the file to ensure it's created on disk
                        const doc = await vscode.workspace.openTextDocument(fileUri);
                        const editor = await vscode.window.showTextDocument(doc);
                        await editor.edit(editBuilder => editBuilder.insert(new vscode.Position(0,0), ''));
                        await doc.save();
                        
                        webview.postMessage({ command: 'refreshFileTree' });
                        respond({ success: true, path: newFilePath });
                      } else {
                        respond(null, "File creation failed.");
                      }
                  } else {
                      respond(null, "File creation cancelled by user.");
                  }
              } catch (e) {
                  respond(null, `Failed to create file: ${(e as Error).message}`);
              }
              return;
          }
        }
      },
      undefined,
      this._disposables
    );
  }

  private _getWebviewContent(webview: vscode.Webview) {
    const nonce = getNonce();
    // FIX: Use older `with({ scheme: 'vscode-resource' })` for compatibility instead of `asWebviewUri`.
    const scriptPathOnDisk = vscode.Uri.file(path.join(this._extensionUri.fsPath, '..', 'index.tsx'));
    const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
    const tailwindUri = "https://cdn.tailwindcss.com";
    const highlightJsStyleUri = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
    const highlightJsScriptUri = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
    const aiStudioCdn = "https://aistudiocdn.com";

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="
              default-src 'none';
              // FIX: Replace unavailable `webview.cspSource` with the older `vscode-resource:` scheme.
              style-src 'vscode-resource:' 'unsafe-inline' https://cdnjs.cloudflare.com;
              // FIX: Replace unavailable `webview.cspSource` with the older `vscode-resource:` scheme.
              script-src 'nonce-${nonce}' 'vscode-resource:' https://aistudiocdn.com https://cdnjs.cloudflare.com;
              // FIX: Replace unavailable `webview.cspSource` with the older `vscode-resource:` scheme.
              img-src 'vscode-resource:' https: data:;
              connect-src https: http://localhost:3001;
              font-src https://cdnjs.cloudflare.com;
          ">
          <title>Son1k-GO! Assistant</title>
          <script nonce="${nonce}" src="${tailwindUri}"></script>
          <link rel="stylesheet" href="${highlightJsStyleUri}">
          <style>
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: #171925; }
            ::-webkit-scrollbar-thumb { background: #15333B; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #15A4A2; }
            body, html, #root { height: 100vh; width: 100vw; overflow: hidden; margin: 0; padding: 0; }
          </style>
          <script nonce="${nonce}" type="importmap">
          {
            "imports": {
              "react-dom/": "${aiStudioCdn}/react-dom@^19.2.0/",
              "react/": "${aiStudioCdn}/react@^19.2.0/",
              "react": "${aiStudioCdn}/react@^19.2.0",
              "@google/genai": "${aiStudioCdn}/@google/genai@^1.29.0",
              "highlight.js/": "${aiStudioCdn}/highlight.js@^11.11.1/",
              "highlight.js": "${aiStudioCdn}/highlight.js@^11.11.1"
            }
          }
          </script>
        </head>
        <body class="bg-[#1C232E] text-white">
          <div id="root"></div>
          <script nonce="${nonce}" src="${highlightJsScriptUri}"></script>
          <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
  }
}