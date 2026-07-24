/**
 * js/views/notes.js
 * 结构化笔记视图 - 支持精确页码定位
 */

import { getState, refreshNotes, refreshRefs } from '../state.js';
import { NOTE_TYPES, READING_STATUS, createNote } from '../models.js';
import { notePut, noteDelete, noteGetByReference, refPut, refGetAll } from '../database/db.js';
import { escapeHtml } from '../security.js';

/* ---------- 笔记列表 ---------- */
export function renderNotesList(container) {
  const { notes, refs } = getState();
  const activeNotes = notes.filter(n => !n.deletedAt);

  if (activeNotes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">尚无笔记或摘录</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:8px">在文献详情页或项目页中添加笔记</div>
      </div>
    `;
    return;
  }

  // 按关联文献分组
  const byRef = {};
  const orphaned = [];
  activeNotes.forEach(n => {
    if (n.referenceId) {
      if (!byRef[n.referenceId]) byRef[n.referenceId] = [];
      byRef[n.referenceId].push(n);
    } else {
      orphaned.push(n);
    }
  });

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700">笔记与摘录 (${activeNotes.length})</h2>
    </div>
  `;

  // 按文献分组显示
  for (const [refId, refNotes] of Object.entries(byRef)) {
    const ref = refs.find(r => r.id === refId);
    html += `
      <div class="project-section">
        <div class="project-section-title">
          ${ref ? escapeHtml(ref.title || '无标题') : '未知文献'}
          ${ref ? `<span style="font-size:12px;font-weight:400;color:var(--text-muted);margin-left:8px">${escapeHtml(ref.authors || '')}</span>` : ''}
        </div>
        ${refNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(n => renderNoteCard(n, ref)).join('')}
      </div>
    `;
  }

  // 无关联文献的笔记
  if (orphaned.length > 0) {
    html += `
      <div class="project-section">
        <div class="project-section-title">📌 独立笔记</div>
        ${orphaned.map(n => renderNoteCard(n, null)).join('')}
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderNoteCard(note, ref) {
  const nt = NOTE_TYPES[note.type] || NOTE_TYPES.excerpt;
  const loc = note.location || {};
  const locParts = [];
  if (loc.bookPage) locParts.push(`原书第${loc.bookPage}页`);
  if (loc.pdfPage) locParts.push(`PDF第${loc.pdfPage}页`);
  if (loc.volume) locParts.push(`卷${loc.volume}`);
  if (loc.folio) locParts.push(`第${loc.folio}叶${loc.folioSide || ''}`);
  if (loc.chapter) locParts.push(loc.chapter);
  if (loc.paragraph) locParts.push(`¶${loc.paragraph}`);
  if (loc.plateNumber) locParts.push(`图版${loc.plateNumber}`);
  if (loc.archiveNumber) locParts.push(`档案号${loc.archiveNumber}`);

  return `
    <div class="note-card">
      <div class="note-card-header">
        <span class="note-type-badge">${nt.icon} ${nt.label}</span>
        ${ref ? `<span style="font-size:11px;color:var(--text-muted)">关联: <a onclick="window.showDetail('${ref.id}')" style="color:var(--primary);cursor:pointer">${escapeHtml(ref.title)}</a></span>` : ''}
      </div>
      <div class="note-content">${escapeHtml(note.content || '')}</div>
      ${locParts.length > 0 ? `
        <div class="note-location">
          ${locParts.map(p => `<span class="note-loc-item">📍 ${escapeHtml(p)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="note-actions">
        <button onclick="window.acadEditNote('${note.id}')">编辑</button>
        <button onclick="window.acadDeleteNote('${note.id}')">删除</button>
        ${ref ? `<button onclick="window.acadLinkNoteToClaim('${note.id}')">关联论点</button>` : ''}
      </div>
    </div>
  `;
}

/* ---------- 笔记表单 ---------- */
export function renderNoteForm(container, existing = null, presetRefId = null, presetProjId = null) {
  const note = existing || createNote({
    referenceId: presetRefId,
    projectId: presetProjId,
  });

  const { refs, projects } = getState();

  container.innerHTML = `
    <div class="modal show" id="noteModal">
      <div class="modal-overlay" onclick="window.acadCloseNoteModal()"></div>
      <div class="modal-content" style="max-width:650px;max-height:85vh;overflow-y:auto">
        <div class="modal-header">
          <h3>${existing ? '编辑笔记' : '新建笔记'}</h3>
          <button class="modal-close" onclick="window.acadCloseNoteModal()">×</button>
        </div>
        <div class="modal-body" style="padding:20px">
          <div class="note-form-group">
            <label>笔记类型</label>
            <select id="noteType">
              ${Object.entries(NOTE_TYPES).map(([k, v]) =>
                `<option value="${k}" ${note.type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="note-form-group">
            <label>关联文献</label>
            <select id="noteRefId">
              <option value="">-- 不关联 --</option>
              ${refs.filter(r => !r.deletedAt).map(r =>
                `<option value="${r.id}" ${note.referenceId === r.id ? 'selected' : ''}>${escapeHtml(r.title || '无标题')}</option>`
              ).join('')}
            </select>
          </div>
          <div class="note-form-group">
            <label>关联项目</label>
            <select id="noteProjId">
              <option value="">-- 不关联 --</option>
              ${projects.map(p =>
                `<option value="${p.id}" ${note.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.title)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="note-form-group">
            <label>内容</label>
            <textarea id="noteContent" rows="6" placeholder="输入笔记内容...">${escapeHtml(note.content || '')}</textarea>
          </div>
          <div class="note-form-group">
            <label>📍 精确页码定位</label>
            <div class="location-grid">
              <div class="note-form-group">
                <label>原书页码</label>
                <input type="text" id="locBookPage" value="${escapeHtml(note.location?.bookPage || '')}" placeholder="如：126">
              </div>
              <div class="note-form-group">
                <label>PDF 页码</label>
                <input type="text" id="locPdfPage" value="${escapeHtml(note.location?.pdfPage || '')}" placeholder="如：138">
              </div>
              <div class="note-form-group">
                <label>卷次</label>
                <input type="text" id="locVolume" value="${escapeHtml(note.location?.volume || '')}" placeholder="如：卷三">
              </div>
              <div class="note-form-group">
                <label>叶码</label>
                <input type="text" id="locFolio" value="${escapeHtml(note.location?.folio || '')}" placeholder="如：十八">
              </div>
              <div class="note-form-group">
                <label>正/反面</label>
                <select id="locFolioSide">
                  <option value="">--</option>
                  <option value="上" ${note.location?.folioSide === '上' ? 'selected' : ''}>上（正面）</option>
                  <option value="下" ${note.location?.folioSide === '下' ? 'selected' : ''}>下（背面）</option>
                </select>
              </div>
              <div class="note-form-group">
                <label>章节</label>
                <input type="text" id="locChapter" value="${escapeHtml(note.location?.chapter || '')}" placeholder="如：第三篇">
              </div>
              <div class="note-form-group">
                <label>段落</label>
                <input type="text" id="locParagraph" value="${escapeHtml(note.location?.paragraph || '')}" placeholder="如：2">
              </div>
              <div class="note-form-group">
                <label>图版号</label>
                <input type="text" id="locPlate" value="${escapeHtml(note.location?.plateNumber || '')}" placeholder="如：图版五">
              </div>
              <div class="note-form-group">
                <label>档案号</label>
                <input type="text" id="locArchive" value="${escapeHtml(note.location?.archiveNumber || '')}" placeholder="如：宫中档">
              </div>
              <div class="note-form-group">
                <label>图像区域</label>
                <input type="text" id="locImageRegion" value="${escapeHtml(note.location?.imageRegion || '')}" placeholder="如：左上角">
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-secondary" onclick="window.acadCloseNoteModal()">取消</button>
          <button class="btn btn-primary" onclick="window.acadSaveNote('${note.id}', ${existing ? 'true' : 'false'})">保存</button>
        </div>
      </div>
    </div>
  `;
}

export async function saveNote(id, isExisting) {
  const content = document.getElementById('noteContent').value.trim();
  if (!content) {
    alert('请输入笔记内容');
    return;
  }

  const data = {
    id,
    type: document.getElementById('noteType').value,
    referenceId: document.getElementById('noteRefId').value || null,
    projectId: document.getElementById('noteProjId').value || null,
    content,
    location: {
      bookPage: document.getElementById('locBookPage').value.trim() || null,
      pdfPage: document.getElementById('locPdfPage').value.trim() || null,
      volume: document.getElementById('locVolume').value.trim() || null,
      folio: document.getElementById('locFolio').value.trim() || null,
      folioSide: document.getElementById('locFolioSide').value || null,
      chapter: document.getElementById('locChapter').value.trim() || null,
      paragraph: document.getElementById('locParagraph').value.trim() || null,
      plateNumber: document.getElementById('locPlate').value.trim() || null,
      archiveNumber: document.getElementById('locArchive').value.trim() || null,
      imageRegion: document.getElementById('locImageRegion').value.trim() || null,
    },
  };

  if (isExisting) {
    const existing = getState().notes.find(n => n.id === id);
    if (existing) {
      Object.assign(existing, data);
      existing.updatedAt = new Date().toISOString();
      existing.revision = (existing.revision || 1) + 1;
      await notePut(existing);
    }
  } else {
    const note = createNote(data);
    await notePut(note);
  }

  await refreshNotes();
  window.acadCloseNoteModal();
  window.acadNav('notes');
}

export async function deleteNote(id) {
  if (!confirm('确定删除此笔记？')) return;
  await noteDelete(id);
  await refreshNotes();
  window.acadNav('notes');
}

/* ---------- 在文献详情页中渲染笔记 ---------- */
export async function renderNotesForReference(container, refId) {
  const notes = await noteGetByReference(refId);

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <strong>📝 笔记与摘录 (${notes.length})</strong>
      <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="window.acadNewNoteForRef('${refId}')">+ 添加笔记</button>
    </div>
  `;

  if (notes.length === 0) {
    html += '<div class="dash-empty">尚无笔记</div>';
  } else {
    html += notes.map(n => {
      const nt = NOTE_TYPES[n.type] || NOTE_TYPES.excerpt;
      const loc = n.location || {};
      const locParts = [];
      if (loc.bookPage) locParts.push(`原书第${loc.bookPage}页`);
      if (loc.pdfPage) locParts.push(`PDF第${loc.pdfPage}页`);
      if (loc.volume) locParts.push(loc.volume);
      if (loc.folio) locParts.push(`第${loc.folio}叶${loc.folioSide || ''}`);
      if (loc.chapter) locParts.push(loc.chapter);

      return `
        <div class="note-card">
          <div class="note-card-header">
            <span class="note-type-badge">${nt.icon} ${nt.label}</span>
            <span style="font-size:11px;color:var(--text-muted)">${new Date(n.updatedAt || n.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="note-content">${escapeHtml(n.content || '')}</div>
          ${locParts.length > 0 ? `<div class="note-location">${locParts.map(p => `<span class="note-loc-item">📍 ${escapeHtml(p)}</span>`).join('')}</div>` : ''}
          <div class="note-actions">
            <button onclick="window.acadEditNote('${n.id}')">编辑</button>
            <button onclick="window.acadDeleteNote('${n.id}')">删除</button>
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = html;
}

/* ---------- 修改阅读状态 ---------- */
export async function updateReadingStatus(refId, status) {
  const allRefs = await refGetAll();
  const ref = allRefs.find(r => r.id === refId);
  if (!ref) return;

  ref.workflow = ref.workflow || {};
  ref.workflow.readingStatus = status;
  ref.updatedAt = new Date().toISOString();
  ref.revision = (ref.revision || 1) + 1;
  await refPut(ref);
  await refreshRefs();
}
