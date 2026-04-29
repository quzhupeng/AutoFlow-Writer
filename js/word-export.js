/**
 * Word 文档导出模块 — 流程架构树状图专用
 * 将 L1-L3 树状图文本转为 .docx 文件
 */

const DOCX_CDN = 'https://unpkg.com/docx@8.5.0/build/index.umd.js';

export async function exportToWord(treeText, departmentName = '企业') {
  try {
    if (!window.docx) {
      await loadDocxLibrary();
    }

    const {
      Document, Packer, Paragraph, TextRun,
      AlignmentType, HeadingLevel,
    } = window.docx;

    const children = [];

    // Title
    children.push(new Paragraph({
      children: [new TextRun({
        text: `${departmentName}端到端三级流程架构键盘图`,
        bold: true,
        size: 36,
        font: 'Microsoft YaHei',
        color: '1a1a2e',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    }));

    // Date
    const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    children.push(new Paragraph({
      children: [new TextRun({
        text: `生成时间：${date}`,
        size: 20,
        font: 'Microsoft YaHei',
        color: '666666',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }));

    // Empty line
    children.push(new Paragraph({ children: [] }));

    // Parse tree lines
    const lines = treeText.split('\n');
    for (const raw of lines) {
      const stripped = raw.trim();
      if (!stripped) continue;

      if (stripped.startsWith('L1：') || stripped.startsWith('L1:')) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: stripped,
            bold: true,
            size: 28,
            font: 'Microsoft YaHei',
            color: '1a73e8',
          })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 100 },
        }));
      } else if (stripped.startsWith('L2：') || stripped.startsWith('L2:')) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: stripped,
            bold: true,
            size: 24,
            font: 'Microsoft YaHei',
            color: '137333',
          })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
        }));
      } else if (stripped.startsWith('L3：') || stripped.startsWith('L3:')) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: stripped,
            size: 22,
            font: 'Microsoft YaHei',
            color: '333333',
          })],
          indent: { left: 720 },
          spacing: { before: 40, after: 40 },
        }));
      } else {
        // Branch characters or other lines
        children.push(new Paragraph({
          children: [new TextRun({
            text: stripped,
            size: 20,
            font: 'Consolas',
            color: '666666',
          })],
          spacing: { before: 20, after: 20 },
        }));
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { size: 22, font: 'Microsoft YaHei' },
          },
        },
      },
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1300, bottom: 1440, left: 1300 } },
        },
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const filename = `${departmentName}_流程架构键盘图.docx`;
    triggerDownload(blob, filename);
    return true;
  } catch (err) {
    console.error('Word export error:', err);
    alert(`导出失败: ${err.message}\n\n您可以复制架构文本手动粘贴到 Word 中。`);
    return false;
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  setTimeout(() => {
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }, 0);
}

function loadDocxLibrary() {
  return new Promise((resolve, reject) => {
    if (window.docx) { resolve(); return; }

    const script = document.createElement('script');
    script.src = DOCX_CDN;
    script.onload = () => {
      if (window.docx && window.docx.Document) {
        resolve();
      } else {
        reject(new Error('docx 库加载后未找到 Document 类'));
      }
    };
    script.onerror = () => reject(new Error('docx 库加载失败，请检查网络'));
    document.head.appendChild(script);
  });
}
