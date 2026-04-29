/**
 * AutoFlow-Writer — 企业流程架构设计智能体
 * 纯 Vanilla JS，无框架依赖
 */

import {
  SYSTEM_PROMPT,
  GRANULARITY_RULES,
  REASONING_LOGIC,
  SELF_CHECK_RULES,
  FULL_EXECUTION_PROMPT,
  EXISTING_DOC_TEMPLATE,
  AI_PROVIDERS,
  DEFAULT_CONFIG,
  BPM_AUDIT_SYSTEM_PROMPT,
  BPM_AUDIT_USER_PROMPT,
} from './process-config.js';
import { exportToWord } from './word-export.js';

// ===== State =====
const state = {
  step: 1,
  departmentName: '',
  businessAreas: '',
  refDocText: '',
  architectureResult: '',
  messages: [],
  modelConfig: {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  logs: [],
  isGenerating: false,
  chatInput: '',
  // 流程审核模块状态
  auditMode: false,
  auditDocText: '',
  auditResult: '',
  auditMessages: [],
  isAuditing: false,
};

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  loadSavedConfig();
  render();
  bindEvents();
});

function loadSavedConfig() {
  try {
    const saved = localStorage.getItem('autoflow_app_config');
    if (saved) {
      const config = JSON.parse(saved);
      if (config.modelConfig) state.modelConfig = { ...state.modelConfig, ...config.modelConfig };
      if (config.departmentName) state.departmentName = config.departmentName;
    }
  } catch {}
}

function saveConfig() {
  try {
    localStorage.setItem(
      'autoflow_app_config',
      JSON.stringify({ modelConfig: state.modelConfig, departmentName: state.departmentName })
    );
  } catch {}
}

// ===== Event Binding =====
function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('submit', (e) => e.preventDefault());
}

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const actions = {
    nextStep: () => goToStep(state.step + 1),
    prevStep: () => goToStep(state.step - 1),
    goToStep: () => goToStep(parseInt(btn.dataset.step)),
    startGenerate: () => startGeneration(),
    sendChat: () => sendChatMessage(),
    exportWord: () => downloadWord(),
    saveSettings: () => saveSettingsFromUI(),
    clearRefDoc: () => clearRefDoc(),
    testConnection: () => testConnection(),
    resetAll: () => resetAll(),
    // 流程审核
    switchToAudit: () => switchToAuditMode(),
    switchToDesign: () => switchToDesignMode(),
    startAudit: () => startAudit(),
    sendAuditChat: () => sendAuditChatMessage(),
    clearAuditDoc: () => clearAuditDoc(),
    exportAuditWord: () => downloadAuditWord(),
    resetAudit: () => resetAudit(),
  };
  if (actions[action]) actions[action]();
}

function handleChange(e) {
  const el = e.target;
  if (el.id === 'department-name') state.departmentName = el.value;
  if (el.id === 'business-areas') state.businessAreas = el.value;
  if (el.id === 'ref-doc-text') state.refDocText = el.value;
  if (el.id === 'provider') {
    state.modelConfig.provider = el.value;
    updateModelDefaults();
  }
  if (el.id === 'api-key') state.modelConfig.apiKey = el.value;
  if (el.id === 'base-url') state.modelConfig.baseUrl = el.value;
  if (el.id === 'model-name') state.modelConfig.model = el.value;
  if (el.id === 'ref-file') handleFileUpload(el);
  if (el.id === 'chat-input') state.chatInput = el.value;
  if (el.id === 'audit-doc-text') state.auditDocText = el.value;
  if (el.id === 'audit-file') handleAuditFileUpload(el);
  if (el.id === 'audit-chat-input') state.auditChatInput = el.value;
}

// ===== Step Navigation =====
function goToStep(step) {
  if (step < 1 || step > 4) return;
  state.step = step;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== File Upload =====
function handleFileUpload(input) {
  const file = input.files?.[0];
  if (!file) return;

  const maxSize = DEFAULT_CONFIG.maxUploadSizeMB * 1024 * 1024;
  if (file.size > maxSize) {
    addLog(`文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大支持 ${DEFAULT_CONFIG.maxUploadSizeMB}MB`, 'error');
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'txt' || ext === 'md') {
    const reader = new FileReader();
    reader.onload = (e) => {
      state.refDocText = truncateRefDoc(e.target.result);
      addLog(`文件解析成功：${file.name}`, 'success');
      render();
    };
    // Try UTF-8 first
    reader.readAsText(file, 'utf-8');
  } else if (ext === 'docx') {
    parseDocxFile(file);
  } else if (ext === 'pdf') {
    parsePdfFile(file, 'refDocText');
  } else {
    addLog('不支持的文件格式，请上传 .txt / .md / .docx / .pdf 文件', 'error');
  }
}

async function parseDocxFile(file) {
  try {
    if (!window.mammoth) {
      await loadMammothLibrary();
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    state.refDocText = truncateRefDoc(result.value);
    addLog(`Word 文件解析成功：${file.name}`, 'success');
    render();
  } catch (err) {
    addLog(`Word 文件解析失败：${err.message}`, 'error');
  }
}

async function parsePdfFile(file, stateKey) {
  try {
    if (!window.pdfjsLib) {
      await loadPdfjsLibrary();
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    state[stateKey] = stateKey === 'refDocText' ? truncateRefDoc(fullText) : fullText;
    addLog(`PDF 文件解析成功：${file.name}（共 ${pdf.numPages} 页）`, 'success');
    render();
  } catch (err) {
    addLog(`PDF 文件解析失败：${err.message}`, 'error');
  }
}

function truncateRefDoc(text) {
  const max = DEFAULT_CONFIG.maxReferenceChars;
  if (text.length <= max) return text;
  addLog(`参考文档内容较长，已自动截断到前 ${max} 字符`, 'warning');
  return text.slice(0, max) + `\n\n[参考文档超长，已截断，仅保留前${max}字符]`;
}

function clearRefDoc() {
  state.refDocText = '';
  render();
}

// ===== Settings =====
function updateModelDefaults() {
  const provider = AI_PROVIDERS[state.modelConfig.provider];
  if (provider) {
    state.modelConfig.baseUrl = provider.defaultBaseUrl;
    state.modelConfig.model = provider.defaultModel;
    render();
  }
}

function saveSettingsFromUI() {
  saveConfig();
  addLog('设置已保存', 'success');
  goToStep(state.step);
}

function getResolvedModelConfig() {
  const provider = AI_PROVIDERS[state.modelConfig.provider];
  return {
    apiKey: state.modelConfig.apiKey,
    baseUrl: state.modelConfig.baseUrl || provider?.defaultBaseUrl || '',
    model: state.modelConfig.model || provider?.defaultModel || '',
  };
}

// ===== Connection Test =====
async function testConnection() {
  const modelCfg = getResolvedModelConfig();
  if (!modelCfg.apiKey) {
    addLog('请先输入 API Key', 'error');
    return;
  }
  addLog('正在测试连接...', 'info');
  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelConfig: modelCfg, action: 'test' }),
    });
    const data = await resp.json();
    if (data.success) {
      addLog(`连接成功：${data.message}`, 'success');
    } else {
      addLog(`连接失败：${data.error}`, 'error');
    }
  } catch (err) {
    addLog(`连接失败：${err.message}`, 'error');
  }
}

// ===== Architecture Generation =====
async function startGeneration() {
  if (state.isGenerating) return;
  if (!state.departmentName.trim() || !state.businessAreas.trim()) return;

  state.isGenerating = true;
  state.logs = [];
  state.architectureResult = '';
  state.messages = [];
  state.step = 3;
  render();

  const modelCfg = getResolvedModelConfig();

  try {
    // Build initial prompt
    addLog('正在构建流程架构...', 'info');

    const docSection = state.refDocText.trim()
      ? EXISTING_DOC_TEMPLATE.replace('{doc_content}', state.refDocText.trim())
      : '';

    const userPrompt = FULL_EXECUTION_PROMPT
      .replace('{granularity_rules}', GRANULARITY_RULES)
      .replace('{reasoning_logic}', REASONING_LOGIC)
      .replace('{department_name}', state.departmentName)
      .replace('{business_areas}', state.businessAreas)
      .replace('{existing_process_doc_section}', docSection)
      .replace('{self_check_rules}', SELF_CHECK_RULES);

    state.messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages, modelConfig: modelCfg }),
    });

    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.error || '生成失败');
    }

    const result = data.content || '';
    if (!result.trim()) {
      throw new Error('模型返回为空，请重试');
    }

    state.messages.push({ role: 'assistant', content: result });
    state.architectureResult = result;

    addLog('流程架构设计完成！可以继续对话优化', 'success');
    state.isGenerating = false;
    state.step = 4;
    render();
  } catch (err) {
    addLog(`错误: ${err.message}`, 'error');
    state.isGenerating = false;
    render();
  }
}

// ===== Multi-round Chat =====
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = (input?.value || state.chatInput || '').trim();
  if (!text || state.isGenerating) return;

  state.chatInput = '';
  state.isGenerating = true;

  // Add user message
  state.messages.push({ role: 'user', content: text });
  render();

  const modelCfg = getResolvedModelConfig();

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages, modelConfig: modelCfg }),
    });

    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.error || '对话失败');
    }

    const response = data.content || '';
    state.messages.push({ role: 'assistant', content: response });

    // Update architecture if response contains tree
    if (response.includes('L1：') || response.includes('L1:')) {
      state.architectureResult = response;
    }

    addLog('对话回复已更新', 'success');
  } catch (err) {
    addLog(`对话失败: ${err.message}`, 'error');
  }

  state.isGenerating = false;
  render();
  // Scroll chat to bottom
  const chatContainer = document.getElementById('chat-container');
  if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ===== Word Export =====
function downloadWord() {
  exportToWord(state.architectureResult, state.departmentName || '企业');
}

// ===== Reset =====
function resetAll() {
  state.architectureResult = '';
  state.messages = [];
  state.chatInput = '';
  state.step = 1;
  render();
}

// ===== Helpers =====
function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  state.logs.push({ time, message, type });
  updateLogUI();
}

function updateLogUI() {
  const logEl = document.getElementById('log-area');
  if (!logEl) return;
  logEl.innerHTML = state.logs
    .map((l) => `<div class="log-${l.type}">[${l.time}] ${l.message}</div>`)
    .join('');
  logEl.scrollTop = logEl.scrollHeight;
}

// ===== Tree Diagram Rendering =====
function renderTreeHtml(treeText) {
  if (!treeText) return '<p class="text-muted">暂无架构内容</p>';

  const lines = treeText.split('\n');
  const htmlParts = ['<div class="arch-tree">'];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    if (stripped.startsWith('L1：') || stripped.startsWith('L1:')) {
      htmlParts.push(`<div class="l1">${escapeHtml(stripped)}</div>`);
    } else if (stripped.startsWith('L2：') || stripped.startsWith('L2:')) {
      htmlParts.push(`<div class="l2">${escapeHtml(stripped)}</div>`);
    } else if (stripped.startsWith('L3：') || stripped.startsWith('L3:')) {
      htmlParts.push(`<div class="l3">${escapeHtml(stripped)}</div>`);
    } else if (stripped.includes('├──') || stripped.includes('└──')) {
      htmlParts.push(`<div class="branch">${escapeHtml(stripped)}</div>`);
    } else {
      htmlParts.push(`<div>${escapeHtml(stripped)}</div>`);
    }
  }

  htmlParts.push('</div>');
  return htmlParts.join('\n');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== External Libraries =====
function loadMammothLibrary() {
  return new Promise((resolve, reject) => {
    if (window.mammoth) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js';
    script.onload = () => {
      if (window.mammoth) resolve();
      else reject(new Error('mammoth 库加载失败'));
    };
    script.onerror = () => reject(new Error('mammoth 库加载失败，请检查网络'));
    document.head.appendChild(script);
  });
}

function loadPdfjsLibrary() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.mjs';
    script.type = 'module';
    // pdfjs as UMD
    const script2 = document.createElement('script');
    script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
    script2.type = 'module';
    // Use legacy non-module build
    const script3 = document.createElement('script');
    script3.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script3.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      } else {
        reject(new Error('pdfjs 库加载失败'));
      }
    };
    script3.onerror = () => reject(new Error('pdfjs 库加载失败，请检查网络'));
    document.head.appendChild(script3);
  });
}

// ===== Audit Mode =====
function switchToAuditMode() {
  state.auditMode = true;
  state.step = 1;
  render();
}

function switchToDesignMode() {
  state.auditMode = false;
  state.step = 1;
  render();
}

function handleAuditFileUpload(input) {
  const file = input.files?.[0];
  if (!file) return;

  const maxSize = DEFAULT_CONFIG.maxUploadSizeMB * 1024 * 1024;
  if (file.size > maxSize) {
    addLog(`文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大支持 ${DEFAULT_CONFIG.maxUploadSizeMB}MB`, 'error');
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'txt' || ext === 'md') {
    const reader = new FileReader();
    reader.onload = (e) => {
      state.auditDocText = e.target.result;
      addLog(`审核文件解析成功：${file.name}`, 'success');
      render();
    };
    reader.readAsText(file, 'utf-8');
  } else if (ext === 'docx') {
    parseAuditDocxFile(file);
  } else if (ext === 'pdf') {
    parsePdfFile(file, 'auditDocText');
  } else {
    addLog('不支持的文件格式，请上传 .txt / .md / .docx / .pdf 文件', 'error');
  }
}

async function parseAuditDocxFile(file) {
  try {
    if (!window.mammoth) {
      await loadMammothLibrary();
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    state.auditDocText = result.value;
    addLog(`Word 文件解析成功：${file.name}`, 'success');
    render();
  } catch (err) {
    addLog(`Word 文件解析失败：${err.message}`, 'error');
  }
}

function clearAuditDoc() {
  state.auditDocText = '';
  render();
}

async function startAudit() {
  if (state.isAuditing) return;
  if (!state.auditDocText.trim()) return;
  if (!state.modelConfig.apiKey) {
    addLog('请先在设置中配置 API Key', 'error');
    return;
  }

  state.isAuditing = true;
  state.logs = [];
  state.auditResult = '';
  state.auditMessages = [];
  state.step = 3;
  render();

  const modelCfg = getResolvedModelConfig();

  try {
    addLog('正在进行流程审核...', 'info');

    const userPrompt = BPM_AUDIT_USER_PROMPT.replace('{document_content}', state.auditDocText.trim());

    state.auditMessages = [
      { role: 'system', content: BPM_AUDIT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.auditMessages,
        modelConfig: { ...modelCfg, maxTokens: 8192, temperature: 0.4 },
      }),
    });

    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.error || '审核失败');
    }

    const result = data.content || '';
    if (!result.trim()) {
      throw new Error('模型返回为空，请重试');
    }

    state.auditMessages.push({ role: 'assistant', content: result });
    state.auditResult = result;

    addLog('流程审核完成！', 'success');
    state.isAuditing = false;
    state.step = 4;
    render();
  } catch (err) {
    addLog(`错误: ${err.message}`, 'error');
    state.isAuditing = false;
    render();
  }
}

async function sendAuditChatMessage() {
  const input = document.getElementById('audit-chat-input');
  const text = (input?.value || state.auditChatInput || '').trim();
  if (!text || state.isAuditing) return;

  state.auditChatInput = '';
  state.isAuditing = true;

  state.auditMessages.push({ role: 'user', content: text });
  render();

  const modelCfg = getResolvedModelConfig();

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.auditMessages,
        modelConfig: { ...modelCfg, maxTokens: 8192, temperature: 0.4 },
      }),
    });

    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.error || '对话失败');
    }

    const response = data.content || '';
    state.auditMessages.push({ role: 'assistant', content: response });

    addLog('审核对话已更新', 'success');
  } catch (err) {
    addLog(`对话失败: ${err.message}`, 'error');
  }

  state.isAuditing = false;
  render();
  const chatContainer = document.getElementById('audit-chat-container');
  if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function downloadAuditWord() {
  if (!state.auditResult) return;
  try {
    if (!window.docx) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/docx@8.5.0/build/index.umd.js';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('docx 库加载失败'));
        document.head.appendChild(script);
      });
    }
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = window.docx;
    const lines = state.auditResult.split('\n');
    const children = [];

    children.push(new Paragraph({
      children: [new TextRun({ text: '流程说明书评审报告', bold: true, size: 36, font: 'Microsoft YaHei', color: '1a1a2e' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: `审核时间：${new Date().toLocaleDateString('zh-CN')}`, size: 20, font: 'Microsoft YaHei', color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }));
    children.push(new Paragraph({ children: [] }));

    for (const raw of lines) {
      const line = raw;
      if (!line.trim()) {
        children.push(new Paragraph({ children: [] }));
        continue;
      }
      if (line.startsWith('## ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace('## ', '').trim(), bold: true, size: 28, font: 'Microsoft YaHei', color: '1a73e8' })],
          spacing: { before: 300, after: 100 },
        }));
      } else if (line.startsWith('### ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace('### ', '').trim(), bold: true, size: 24, font: 'Microsoft YaHei', color: '137333' })],
          spacing: { before: 200, after: 80 },
        }));
      } else if (line.startsWith('| ')) {
        const cells = line.split('|').filter(c => c.trim());
        const isSep = cells.every(c => /^[-:\s]+$/.test(c));
        if (!isSep) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 20, font: 'Consolas', color: '333333' })],
            spacing: { before: 20, after: 20 },
          }));
        }
      } else if (line.startsWith('- ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line, size: 22, font: 'Microsoft YaHei', color: '333333' })],
          indent: { left: 360 },
          spacing: { before: 40, after: 40 },
        }));
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: line, size: 22, font: 'Microsoft YaHei', color: '333333' })],
          spacing: { before: 30, after: 30 },
        }));
      }
    }

    const doc = new Document({
      styles: { default: { document: { run: { size: 22, font: 'Microsoft YaHei' } } } },
      sections: [{
        properties: { page: { margin: { top: 1440, right: 1300, bottom: 1440, left: 1300 } } },
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '流程评审报告.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`导出失败: ${err.message}`);
  }
}

function resetAudit() {
  state.auditDocText = '';
  state.auditResult = '';
  state.auditMessages = [];
  state.auditChatInput = '';
  state.step = 1;
  render();
}

function renderMarkdownToHtml(mdText) {
  if (!mdText) return '<p class="text-muted">暂无审核结果</p>';
  let html = escapeHtml(mdText);

  // Headers
  html = html.replace(/^## (.+)$/gm, '<h2 class="audit-h2">$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="audit-h3">$1</h3>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Table rows
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    const isSep = cells.every(c => /^[-:\s]+$/.test(c.trim()));
    if (isSep) return '';
    const tds = cells.map(c => `<td>${c.trim()}</td>`).join('');
    return `<tr>${tds}</tr>`;
  });

  // Wrap table
  html = html.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table class="audit-table">$1</table>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Checkbox items
  html = html.replace(/^- \[ \] (.+)$/gm, '<li class="audit-checkbox">$1</li>');

  // Paragraphs - convert remaining newlines to <br>
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  return `<div class="audit-report">${html}</div>`;
}

// ===== Rendering =====
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (state.auditMode) {
    app.innerHTML = `
      ${renderModeSwitch()}
      ${renderAuditStepsBar()}
      ${state.step === 1 ? renderAuditStep1() : ''}
      ${state.step === 2 ? renderAuditStep2() : ''}
      ${state.step === 3 ? renderAuditStep3() : ''}
      ${state.step === 4 ? renderAuditStep4() : ''}
    `;
  } else {
    app.innerHTML = `
      ${renderModeSwitch()}
      ${renderStepsBar()}
      ${state.step === 1 ? renderStep1() : ''}
      ${state.step === 2 ? renderStep2() : ''}
      ${state.step === 3 ? renderStep3() : ''}
      ${state.step === 4 ? renderStep4() : ''}
    `;
  }

  // Bind chat input enter key
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  // Bind audit chat input enter key
  const auditChatInput = document.getElementById('audit-chat-input');
  if (auditChatInput) {
    auditChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAuditChatMessage();
      }
    });
  }

  // Bind ref doc textarea sync
  const refTextarea = document.getElementById('ref-doc-text');
  if (refTextarea) {
    refTextarea.addEventListener('input', (e) => {
      state.refDocText = e.target.value;
    });
  }

  // Bind audit doc textarea sync
  const auditTextarea = document.getElementById('audit-doc-text');
  if (auditTextarea) {
    auditTextarea.addEventListener('input', (e) => {
      state.auditDocText = e.target.value;
    });
  }
}

function renderModeSwitch() {
  return `
    <div class="mode-switch">
      <button class="mode-btn ${!state.auditMode ? 'active' : ''}" data-action="switchToDesign">
        流程架构设计
      </button>
      <button class="mode-btn ${state.auditMode ? 'active' : ''}" data-action="switchToAudit">
        流程审核
      </button>
    </div>
  `;
}

function renderAuditStepsBar() {
  const steps = [
    { n: 1, label: '上传文档' },
    { n: 2, label: '确认审核' },
    { n: 3, label: '审核中' },
    { n: 4, label: '审核报告' },
  ];
  return `
    <nav class="wizard-nav">
      ${steps.map((s) => `
        <button class="wizard-pill ${s.n === state.step ? 'active' : ''} ${s.n < state.step ? 'done' : ''}"
             data-action="goToStep" data-step="${s.n}">
          <span class="wizard-num">${s.n < state.step ? '\u2713' : s.n}</span>
          ${s.label}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderAuditStep1() {
  return `
    <div class="fade-in">
      <div class="card">
        <div class="card-title">
          上传流程说明书
          <span class="count">上传需要审核的流程文档</span>
        </div>

        <div class="form-group">
          <label class="form-label">直接粘贴流程文档内容</label>
          <textarea id="audit-doc-text" class="form-textarea" rows="10"
            placeholder="将流程说明书全文粘贴到此处...">${escapeHtml(state.auditDocText)}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">或上传文件</label>
          <input type="file" id="audit-file" class="form-input" accept=".txt,.md,.docx,.pdf">
          <p class="text-xs text-muted mt-1">支持 .txt、.md、.docx、.pdf 格式，最大 ${DEFAULT_CONFIG.maxUploadSizeMB}MB</p>
        </div>

        ${state.auditDocText ? `
          <div class="flex gap-1 mt-1">
            <span class="text-xs text-muted">已输入 ${state.auditDocText.length} 字符</span>
            <button class="btn btn-danger btn-sm" data-action="clearAuditDoc">清除</button>
          </div>
        ` : ''}
      </div>

      ${renderSettingsPanel()}

      <div class="flex justify-between mt-2">
        <div></div>
        <button class="btn btn-primary" data-action="goToStep" data-step="2"
          ${!state.auditDocText.trim() ? 'disabled' : ''}>
          下一步：确认审核
        </button>
      </div>
    </div>
  `;
}

function renderAuditStep2() {
  const docPreview = state.auditDocText.length > 500
    ? state.auditDocText.slice(0, 500) + '...'
    : state.auditDocText;

  return `
    <div class="fade-in">
      <div class="card">
        <div class="card-title">
          确认审核内容
          <span class="count">请确认以下文档内容正确后开始审核</span>
        </div>

        <div class="summary-box mb-2">
          <h4>文档预览（前500字）</h4>
          <div class="doc-preview">${escapeHtml(docPreview)}</div>
        </div>

        <div class="summary-box">
          <h4>审核维度</h4>
          <div class="summary-grid">
            <div><strong>维度一</strong>：基础信息完整性（4项检查）</div>
            <div><strong>维度二</strong>：业务逻辑完整性（4项检查）</div>
            <div><strong>维度三</strong>：活动执行规范性（4项检查）</div>
            <div><strong>维度四</strong>：风控与资源（4项检查）</div>
          </div>
        </div>
      </div>

      <div class="flex justify-between mt-2">
        <button class="btn btn-secondary" data-action="goToStep" data-step="1">返回修改</button>
        <button class="btn btn-primary" data-action="startAudit"
          ${!state.modelConfig.apiKey ? 'disabled' : ''}>
          开始审核
        </button>
      </div>
    </div>
  `;
}

function renderAuditStep3() {
  return `
    <div class="fade-in">
      <div class="card">
        <div class="card-title">
          ${state.isAuditing ? '正在进行流程审核...' : '准备中...'}
        </div>

        <div class="progress-bar">
          <div class="progress-fill pulse" style="width:${state.isAuditing ? '50%' : '10%'}"></div>
        </div>
        <div class="progress-text">
          ${state.isAuditing
            ? 'AI 正在基于 16 项检查点逐项审计流程说明书，这可能需要 30-90 秒...'
            : '等待开始...'}
        </div>

        <div class="log-area mt-2" id="log-area">
          ${state.logs.length === 0 ? '<div class="text-muted">等待开始...</div>' : ''}
        </div>
      </div>

      ${!state.isAuditing && state.logs.length > 0 ? `
        <div class="flex gap-1 mt-2">
          <button class="btn btn-secondary" data-action="goToStep" data-step="1">返回修改</button>
          <button class="btn btn-primary" data-action="startAudit">重新审核</button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAuditStep4() {
  const chatMessages = state.auditMessages.length > 3 ? state.auditMessages.slice(3) : [];

  return `
    <div class="fade-in">
      ${state.auditResult ? `
        <div class="card">
          <div class="card-title">
            流程审核报告
            <span class="count">16项检查点自动化评审</span>
          </div>

          <div class="flex gap-1 mb-2">
            <button class="btn btn-success" data-action="exportAuditWord">导出 Word 报告</button>
            <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(state.auditResult);alert('已复制到剪贴板')">复制报告</button>
            <button class="btn btn-secondary" data-action="startAudit">重新审核</button>
            <button class="btn btn-danger btn-sm" data-action="resetAudit">新审核任务</button>
          </div>

          ${renderMarkdownToHtml(state.auditResult)}
        </div>
      ` : ''}

      <div class="card">
        <div class="card-title">
          审核对话
          <span class="count">输入问题继续深入分析</span>
        </div>

        <div class="chat-container" id="audit-chat-container">
          ${chatMessages.map((msg) => `
            <div class="chat-message ${msg.role}">
              <div class="chat-avatar">${msg.role === 'assistant' ? 'AI' : '你'}</div>
              <div class="chat-bubble">
                ${msg.role === 'assistant'
                  ? renderMarkdownToHtml(msg.content)
                  : escapeHtml(msg.content).replace(/\n/g, '<br>')}
              </div>
            </div>
          `).join('')}
        </div>

        ${state.isAuditing ? '<div class="progress-text">AI 正在思考...</div>' : ''}

        <div class="chat-input-area">
          <input type="text" id="audit-chat-input" class="form-input"
            value="${escapeHtml(state.auditChatInput || '')}"
            placeholder="输入追问，如：'活动03的风险控制点是否充分？'">
          <button class="btn btn-primary" data-action="sendAuditChat" ${state.isAuditing ? 'disabled' : ''}>
            发送
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderStepsBar() {
  const steps = [
    { n: 1, label: '基本信息' },
    { n: 2, label: '参考资料' },
    { n: 3, label: '架构生成' },
    { n: 4, label: '对话优化' },
  ];
  return `
    <nav class="wizard-nav">
      ${steps.map((s) => `
        <button class="wizard-pill ${s.n === state.step ? 'active' : ''} ${s.n < state.step ? 'done' : ''}"
             data-action="goToStep" data-step="${s.n}">
          <span class="wizard-num">${s.n < state.step ? '\u2713' : s.n}</span>
          ${s.label}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderStep1() {
  return `
    <div class="fade-in">
      <div class="card">
        <div class="card-title">基本信息</div>

        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">部门/业务模块全称</label>
            <input type="text" id="department-name" class="form-input"
              value="${escapeHtml(state.departmentName)}"
              placeholder="例如：人力资源部、供应链管理部">
          </div>
          <div class="form-group">
            <label class="form-label">核心细分业务板块</label>
            <textarea id="business-areas" class="form-textarea" rows="3"
              placeholder="例如：招聘、培训、绩效、薪酬">${escapeHtml(state.businessAreas)}</textarea>
          </div>
        </div>

        <div class="summary-box mt-2">
          <h4>架构层级说明</h4>
          <div class="summary-grid">
            <div><strong>L1</strong>：价值流 / 业务大类 — 端到端业务循环</div>
            <div><strong>L2</strong>：流程组 / 业务阶段 — L1 的逻辑切分</div>
            <div><strong>L3</strong>：业务模块 — 独立管理模块（非动作/任务）</div>
            <div><strong>标准</strong>：基于 APQC 国际流程分类框架</div>
          </div>
        </div>
      </div>

      ${renderSettingsPanel()}

      <div class="flex justify-between mt-2">
        <div></div>
        <button class="btn btn-primary" data-action="nextStep"
          ${!state.departmentName.trim() || !state.businessAreas.trim() ? 'disabled' : ''}>
          下一步：参考资料
        </button>
      </div>
    </div>
  `;
}

function renderStep2() {
  return `
    <div class="fade-in">
      <div class="card">
        <div class="card-title">
          参考资料（可选）
          <span class="count">上传现有流程文档，AI 将参考设计</span>
        </div>

        <div class="form-group">
          <label class="form-label">直接输入参考内容</label>
          <textarea id="ref-doc-text" class="form-textarea" rows="6"
            placeholder="粘贴现有流程文档内容，或描述现有的业务流程架构...">${escapeHtml(state.refDocText)}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">或上传参考文件</label>
          <input type="file" id="ref-file" class="form-input" accept=".txt,.md,.docx,.pdf">
          <p class="text-xs text-muted mt-1">支持 .txt、.md、.docx、.pdf 格式，最大 ${DEFAULT_CONFIG.maxUploadSizeMB}MB</p>
        </div>

        ${state.refDocText ? `
          <div class="flex gap-1 mt-1">
            <span class="text-xs text-muted">已输入 ${state.refDocText.length} 字符</span>
            <button class="btn btn-danger btn-sm" data-action="clearRefDoc">清除</button>
          </div>
        ` : ''}
      </div>

      <div class="flex justify-between mt-2">
        <button class="btn btn-secondary" data-action="prevStep">返回基本信息</button>
        <button class="btn btn-primary" data-action="startGenerate"
          ${!state.modelConfig.apiKey ? 'disabled' : ''}>
          开始生成架构
        </button>
      </div>
    </div>
  `;
}

function renderStep3() {
  return `
    <div class="fade-in">
      <div class="card">
        <div class="card-title">
          ${state.isGenerating ? '正在构建流程架构...' : '准备中...'}
        </div>

        <div class="progress-bar">
          <div class="progress-fill pulse" style="width:${state.isGenerating ? '50%' : '10%'}"></div>
        </div>
        <div class="progress-text">
          ${state.isGenerating
            ? 'AI 正在基于 APQC 标准构建三级流程架构，这可能需要 30-60 秒...'
            : '等待开始...'}
        </div>

        <div class="log-area mt-2" id="log-area">
          ${state.logs.length === 0 ? '<div class="text-muted">等待开始...</div>' : ''}
        </div>
      </div>

      ${!state.isGenerating && state.logs.length > 0 ? `
        <div class="flex gap-1 mt-2">
          <button class="btn btn-secondary" data-action="prevStep">返回修改</button>
          <button class="btn btn-primary" data-action="startGenerate">重新生成</button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderStep4() {
  // Chat messages (skip system + initial prompt + initial response)
  const chatMessages = state.messages.length > 3 ? state.messages.slice(3) : [];

  return `
    <div class="fade-in">
      ${state.architectureResult ? `
        <div class="card">
          <div class="card-title">
            ${escapeHtml(state.departmentName)}端到端三级流程架构键盘图
          </div>

          <div class="flex gap-1 mb-2">
            <button class="btn btn-success" data-action="exportWord">导出 Word</button>
            <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(state.architectureResult);alert('已复制到剪贴板')">复制文本</button>
            <button class="btn btn-secondary" data-action="startGenerate">重新生成</button>
            <button class="btn btn-danger btn-sm" data-action="resetAll">开始新设计</button>
          </div>

          ${renderTreeHtml(state.architectureResult)}

          <details class="card" style="margin-top:1rem">
            <summary class="card-title">查看原始文本</summary>
            <div class="raw-text">${escapeHtml(state.architectureResult)}</div>
          </details>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-title">
          对话优化
          <span class="count">输入修改意见继续完善架构</span>
        </div>

        <div class="chat-container" id="chat-container">
          ${chatMessages.map((msg) => `
            <div class="chat-message ${msg.role}">
              <div class="chat-avatar">${msg.role === 'assistant' ? 'AI' : '你'}</div>
              <div class="chat-bubble">
                ${msg.role === 'assistant' && (msg.content.includes('L1：') || msg.content.includes('L1:'))
                  ? renderTreeHtml(msg.content)
                  : escapeHtml(msg.content).replace(/\n/g, '<br>')}
              </div>
            </div>
          `).join('')}
        </div>

        ${state.isGenerating ? '<div class="progress-text">AI 正在思考...</div>' : ''}

        <div class="chat-input-area">
          <input type="text" id="chat-input" class="form-input"
            value="${escapeHtml(state.chatInput)}"
            placeholder="输入修改意见，如：'招聘流程L2需要拆分为社会招聘和校园招聘'">
          <button class="btn btn-primary" data-action="sendChat" ${state.isGenerating ? 'disabled' : ''}>
            发送
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsPanel() {
  const p = state.modelConfig.provider;
  const provider = AI_PROVIDERS[p];
  return `
    <details class="card">
      <summary class="card-title">AI 模型配置</summary>
      <div class="settings-grid mt-2">
        <div class="form-group">
          <label class="form-label">AI 服务商</label>
          <select id="provider" class="form-select">
            ${Object.entries(AI_PROVIDERS)
              .map(([key, val]) =>
                `<option value="${key}" ${p === key ? 'selected' : ''}>${val.name}</option>`
              ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input type="password" id="api-key" class="form-input" value="${state.modelConfig.apiKey}" placeholder="输入 API Key">
        </div>
        <div class="form-group">
          <label class="form-label">Base URL</label>
          <input type="text" id="base-url" class="form-input" value="${state.modelConfig.baseUrl || provider?.defaultBaseUrl || ''}" placeholder="API Base URL">
        </div>
        <div class="form-group">
          <label class="form-label">模型名称</label>
          <input type="text" id="model-name" class="form-input" value="${state.modelConfig.model || provider?.defaultModel || ''}" placeholder="模型 ID">
        </div>
      </div>
      <div class="flex gap-1 mt-1">
        <button class="btn btn-primary btn-sm" data-action="saveSettings">保存配置</button>
        <button class="btn btn-secondary btn-sm" data-action="testConnection">测试连接</button>
      </div>
    </details>
  `;
}

window.state = state;
window.render = render;
