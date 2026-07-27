'use strict';

let currentFolder = null;
const byId = id => document.getElementById(id);

function showError(target, error) {
  target.textContent = `Fejl: ${error && error.message ? error.message : String(error)}`;
}

function renderTree(nodes) {
  const container = byId('tree');
  container.replaceChildren();
  const fragment = document.createDocumentFragment();

  function addNodes(items, indent = 0) {
    for (const node of items) {
      const row = document.createElement('div');
      row.className = 'tree-item';
      const spacer = document.createElement('span');
      spacer.className = 'tree-indent';
      spacer.style.width = `${indent * 14}px`;
      const label = document.createElement('span');
      label.textContent = `${node.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}'} ${node.name}`;
      row.append(spacer, label);
      fragment.appendChild(row);
      if (node.type === 'directory' && Array.isArray(node.children)) addNodes(node.children, indent + 1);
    }
  }
  addNodes(nodes);
  container.appendChild(fragment);
}

async function refreshTree() {
  if (!currentFolder) return;
  renderTree(await window.api.getFolderTree(currentFolder));
}

byId('selectFolder').addEventListener('click', async () => {
  try {
    const selected = await window.api.selectFolder();
    if (!selected) return;
    currentFolder = selected;
    byId('folderPath').textContent = currentFolder;
    await refreshTree();
  } catch (error) {
    showError(byId('tree'), error);
  }
});

byId('runTests').addEventListener('click', async () => {
  const output = byId('testOutput');
  if (!currentFolder) return showError(output, new Error('V\u00e6lg en mappe f\u00f8rst'));
  output.textContent = 'K\u00f8rer...';
  try {
    const result = await window.api.runTest(currentFolder, byId('testPreset').value);
    output.textContent = `> ${result.command}\nExit code: ${result.exitCode}\n\n${result.output}`;
  } catch (error) {
    showError(output, error);
  }
});

byId('generate').addEventListener('click', async () => {
  const output = byId('generateOutput');
  if (!currentFolder) return showError(output, new Error('V\u00e6lg en mappe f\u00f8rst'));
  const options = {
    projectName: byId('projectName').value,
    description: byId('description').value,
    author: byId('author').value,
    year: byId('year').value,
    files: {
      gitignore: byId('gitignore').checked,
      readme: byId('readme').checked,
      license: byId('license').checked,
      editorconfig: byId('editorconfig').checked,
      contributing: byId('contributing').checked,
      changelog: byId('changelog').checked,
      ci: byId('ci').checked
    }
  };
  try {
    const results = await window.api.generateFiles(currentFolder, options);
    output.textContent = results.length
      ? results.map(item => `${item.status}: ${item.path}`).join('\n')
      : 'Ingen filer valgt.';
    await refreshTree();
  } catch (error) {
    showError(output, error);
  }
});

byId('push').addEventListener('click', async () => {
  const output = byId('pushOutput');
  if (!currentFolder) return showError(output, new Error('V\u00e6lg en mappe f\u00f8rst'));
  const tokenInput = byId('tokenInput');
  output.textContent = 'Pusher...';
  try {
    const result = await window.api.pushToRemote(
      currentFolder,
      byId('remoteUrl').value.trim(),
      byId('branch').value.trim(),
      tokenInput.value
    );
    tokenInput.value = '';
    output.textContent = result;
  } catch (error) {
    showError(output, error);
  }
});

byId('securityGuide').addEventListener('click', () => {
  window.api.openSecurityGuide().catch(error => showError(byId('tree'), error));
});