/* js/pdf-preview.js
 * 使用 DOM API 设置 textContent/value，不把 PDF 元数据拼进 innerHTML。
 */

const PDF_FIELDS = {
  title: '标题',
  authors: '作者',
  journal: '期刊/来源',
  year: '年份',
  volume: '卷',
  issue: '期',
  pages: '页码',
  doi: 'DOI',
  abstract: '摘要',
  keywords: '关键词'
};

export function showPdfExtractionPreview({
  metadata,
  dataSource,
  onApply,
  onCancel
}) {
  document.getElementById('pdfPreviewPanel')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pdfPreviewPanel';
  overlay.className = 'pdf-preview-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'pdfPreviewTitle');

  const panel = document.createElement('section');
  panel.className = 'pdf-preview-panel';

  const heading = document.createElement('h3');
  heading.id = 'pdfPreviewTitle';
  heading.textContent = 'PDF 信息提取结果';

  const source = document.createElement('p');
  source.className = 'pdf-preview-source';
  source.textContent = `数据来源：${dataSource || '未知'}`;

  const form = document.createElement('div');
  form.className = 'pdf-preview-fields';

  for (const [key, label] of Object.entries(PDF_FIELDS)) {
    const group = document.createElement('label');
    group.className = 'pdf-preview-field';

    const labelText = document.createElement('span');
    const provenance = metadata?._provenance?.[key];
    const confidence = provenance?.confidence
      ? `（${Math.round(provenance.confidence * 100)}%）`
      : '';

    labelText.textContent = `${label}${confidence}`;

    const isLongField = key === 'abstract' || key === 'keywords';
    const input = document.createElement(isLongField ? 'textarea' : 'input');

    input.id = `preview_${key}`;
    input.name = key;
    input.value = String(metadata?.[key] || '');

    if (isLongField) input.rows = key === 'abstract' ? 6 : 3;

    group.append(labelText, input);
    form.appendChild(group);
  }

  const actions = document.createElement('div');
  actions.className = 'pdf-preview-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.textContent = '确认填入表单';
  applyButton.className = 'btn-primary';

  const close = () => overlay.remove();

  cancelButton.addEventListener('click', () => {
    close();
    onCancel?.();
  });

  applyButton.addEventListener('click', () => {
    const result = {};

    for (const key of Object.keys(PDF_FIELDS)) {
      result[key] =
        document.getElementById(`preview_${key}`)?.value.trim() || '';
    }

    result.type = metadata?.type || 'article';
    close();
    onApply?.(result);
  });

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      close();
      onCancel?.();
    }
  });

  actions.append(cancelButton, applyButton);
  panel.append(heading, source, form, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelector('input, textarea')?.focus();
}
