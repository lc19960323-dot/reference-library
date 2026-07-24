/**
 * js/views/projects.js
 * 项目工作台视图 - 列表页 + 详情页
 */

import { getState, setState, refreshProjects, refreshRefs, refreshClaims, refreshNotes } from '../state.js';
import {
  createProject, createResearchQuestion, createTask,
  PROJECT_STATUS, READING_STATUS, CLAIM_STATUS, NOTE_TYPES
} from '../models.js';
import {
  projectPut, projectDelete, projectGetById,
  refGetAll, refPut, claimGetByProject, noteGetByProject
} from '../database/db.js';
import { escapeHtml } from '../security.js';

/* ---------- 项目列表 ---------- */
export function renderProjectList(container) {
  const { projects } = getState();

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-text">尚无研究项目</div>
        <button class="btn btn-primary" onclick="window.acadNewProject()">创建项目</button>
        <button class="btn btn-secondary" onclick="window.acadLoadPresetProjects()" style="margin-left:8px">加载预设项目</button>
      </div>
    `;
    return;
  }

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700">研究项目</h2>
      <div>
        <button class="btn btn-secondary" onclick="window.acadLoadPresetProjects()" style="margin-right:8px">加载预设</button>
        <button class="btn btn-primary" onclick="window.acadNewProject()">+ 新建项目</button>
      </div>
    </div>
  `;

  for (const proj of projects) {
    const refCount = (proj.references || []).length;
    const claimCount = (proj.claims || []).length;
    const questionCount = (proj.researchQuestions || []).length;
    const statusLabel = PROJECT_STATUS[proj.status] || proj.status;

    html += `
      <div class="project-card" onclick="window.acadOpenProject('${proj.id}')">
        <div class="project-card-header">
          <div>
            <div class="project-card-title">${escapeHtml(proj.title)}</div>
            <span class="reading-status-badge rs-${proj.status === 'active' ? 'reading' : proj.status === 'completed' ? 'read' : 'inbox'}">${statusLabel}</span>
          </div>
        </div>
        ${proj.description ? `<div class="project-card-desc">${escapeHtml(proj.description.slice(0, 200))}${proj.description.length > 200 ? '...' : ''}</div>` : ''}
        <div class="project-stats">
          <div class="project-stat"><span>📄</span> <span class="num">${refCount}</span> 文献</div>
          <div class="project-stat"><span>⚖️</span> <span class="num">${claimCount}</span> 论点</div>
          <div class="project-stat"><span>❓</span> <span class="num">${questionCount}</span> 问题</div>
          ${proj.chronology ? `<div class="project-stat"><span>🕐</span> ${escapeHtml(proj.chronology)}</div>` : ''}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

/* ---------- 项目详情 ---------- */
export async function renderProjectDetail(container, projectId) {
  const proj = await projectGetById(projectId);
  if (!proj) {
    container.innerHTML = '<div class="empty-state"><div class="empty-text">项目不存在</div></div>';
    return;
  }

  const allRefs = await refGetAll();
  const claims = await claimGetByProject(projectId);
  const projNotes = await noteGetByProject(projectId);
  const projRefs = allRefs.filter(r => (proj.references || []).includes(r.id) && !r.deletedAt);

  const statusLabel = PROJECT_STATUS[proj.status] || proj.status;

  let html = `
    <div style="margin-bottom:12px">
      <button class="btn btn-secondary" onclick="window.acadNav('projects')">← 返回项目列表</button>
      <button class="btn btn-secondary" onclick="window.acadEditProject('${projectId}')" style="margin-left:8px">编辑</button>
      <button class="btn btn-secondary" onclick="window.acadExportProject('${projectId}')" style="margin-left:8px">导出 Markdown</button>
    </div>
    <div class="project-detail-header">
      <div class="project-detail-title">${escapeHtml(proj.title)}</div>
      <div class="project-detail-desc">${escapeHtml(proj.description || '暂无描述')}</div>
      <div style="display:flex;gap:16px;font-size:13px;color:var(--text-muted)">
        <span>状态: <strong style="color:var(--text)">${statusLabel}</strong></span>
        ${proj.scope ? `<span>范围: <strong style="color:var(--text)">${escapeHtml(proj.scope)}</strong></span>` : ''}
        ${proj.chronology ? `<span>年代: <strong style="color:var(--text)">${escapeHtml(proj.chronology)}</strong></span>` : ''}
      </div>
    </div>
  `;

  // 研究问题
  html += `
    <div class="project-section">
      <div class="project-section-title">
        ❓ 研究问题
        <button class="add-btn" onclick="window.acadAddQuestion('${projectId}')">+ 添加</button>
      </div>
      ${(proj.researchQuestions || []).length > 0 ? proj.researchQuestions.map(q => `
        <div class="research-question">
          <div class="rq-text">${escapeHtml(q.text)}</div>
          <div class="rq-status">${q.status === 'open' ? '🔵 待解决' : q.status === 'resolved' ? '✅ 已解决' : '⏸️ 暂搁'}</div>
        </div>
      `).join('') : '<div class="dash-empty">尚无研究问题</div>'}
    </div>
  `;

  // 当前假说
  html += `
    <div class="project-section">
      <div class="project-section-title">
        💡 当前假说
        <button class="add-btn" onclick="window.acadAddHypothesis('${projectId}')">+ 添加</button>
      </div>
      ${(proj.hypotheses || []).length > 0 ? proj.hypotheses.map(h => `
        <div class="research-question">
          <div class="rq-text">${escapeHtml(h.text || h)}</div>
        </div>
      `).join('') : '<div class="dash-empty">尚无假说</div>'}
    </div>
  `;

  // 关联文献
  html += `
    <div class="project-section">
      <div class="project-section-title">
        📚 关联文献 (${projRefs.length})
        <button class="add-btn" onclick="window.acadAddRefToProject('${projectId}')">+ 添加文献</button>
      </div>
      ${projRefs.length > 0 ? projRefs.map(r => `
        <div class="dash-card-item" onclick="window.showDetail('${r.id}')">
          <span class="label">${escapeHtml(r.title || '无标题')}</span>
          <span style="font-size:11px;color:var(--text-muted)">${escapeHtml((r.authors || '').slice(0, 20))}${r.authors && r.authors.length > 20 ? '...' : ''}</span>
        </div>
      `).join('') : '<div class="dash-empty">尚无关联文献</div>'}
    </div>
  `;

  // 论点与证据
  html += `
    <div class="project-section">
      <div class="project-section-title">
        ⚖️ 论点与证据 (${claims.length})
        <button class="add-btn" onclick="window.acadNewClaim('${projectId}')">+ 新建论点</button>
      </div>
      ${claims.length > 0 ? claims.map(c => {
        const st = CLAIM_STATUS[c.status] || CLAIM_STATUS.idea;
        return `
          <div class="claim-card" onclick="window.acadOpenClaim('${c.id}')" style="cursor:pointer">
            <div class="claim-card-header">
              <div>
                <div class="claim-title">${escapeHtml(c.title)}</div>
                <span class="claim-status-badge ${st.class}">${st.icon} ${st.label}</span>
              </div>
            </div>
            <div class="claim-statement">${escapeHtml((c.statement || '').slice(0, 200))}${c.statement && c.statement.length > 200 ? '...' : ''}</div>
            <div style="display:flex;gap:12px;font-size:12px;color:var(--text-muted)">
              <span>✅ 支持: ${(c.supportingEvidence || []).length}</span>
              <span>❌ 反对: ${(c.opposingEvidence || []).length}</span>
              <span>↗️ 间接: ${(c.indirectEvidence || []).length}</span>
            </div>
          </div>
        `;
      }).join('') : '<div class="dash-empty">尚无论点</div>'}
      ${claims.length > 0 ? `
        <div style="margin-top:12px">
          <button class="btn btn-primary" onclick="window.acadShowMatrix('${projectId}')">📊 查看论点-证据矩阵</button>
        </div>
      ` : ''}
    </div>
  `;

  // 笔记
  html += `
    <div class="project-section">
      <div class="project-section-title">
        📝 项目笔记 (${projNotes.length})
      </div>
      ${projNotes.length > 0 ? projNotes.map(n => {
        const nt = NOTE_TYPES[n.type] || NOTE_TYPES.excerpt;
        return `
          <div class="note-card">
            <div class="note-card-header">
              <span class="note-type-badge">${nt.icon} ${nt.label}</span>
            </div>
            <div class="note-content">${escapeHtml((n.content || '').slice(0, 300))}${n.content && n.content.length > 300 ? '...' : ''}</div>
          </div>
        `;
      }).join('') : '<div class="dash-empty">尚无项目笔记</div>'}
    </div>
  `;

  // 待解决问题
  html += `
    <div class="project-section">
      <div class="project-section-title">
        🔍 待解决问题
        <button class="add-btn" onclick="window.acadAddOpenQuestion('${projectId}')">+ 添加</button>
      </div>
      ${(proj.openQuestions || []).length > 0 ? proj.openQuestions.map(q => `
        <div class="research-question">
          <div class="rq-text">${escapeHtml(typeof q === 'string' ? q : q.text)}</div>
        </div>
      `).join('') : '<div class="dash-empty">尚无待解决问题</div>'}
    </div>
  `;

  container.innerHTML = html;
}

/* ---------- 项目创建/编辑表单 ---------- */
export function renderProjectForm(container, existing = null) {
  const proj = existing || createProject({ title: '', description: '' });

  container.innerHTML = `
    <div class="modal show" id="projectModal">
      <div class="modal-overlay" onclick="window.acadCloseProjectModal()"></div>
      <div class="modal-content" style="max-width:600px">
        <div class="modal-header">
          <h3>${existing ? '编辑项目' : '新建研究项目'}</h3>
          <button class="modal-close" onclick="window.acadCloseProjectModal()">×</button>
        </div>
        <div class="modal-body" style="padding:20px">
          <div class="note-form-group">
            <label>项目名称</label>
            <input type="text" id="projTitle" value="${escapeHtml(proj.title)}" placeholder="如：《功同六经》">
          </div>
          <div class="note-form-group">
            <label>项目描述</label>
            <textarea id="projDesc" rows="4" placeholder="研究范围、目标...">${escapeHtml(proj.description)}</textarea>
          </div>
          <div class="note-form-group">
            <label>研究范围</label>
            <input type="text" id="projScope" value="${escapeHtml(proj.scope || '')}" placeholder="如：明代书籍出版与儒学知识史">
          </div>
          <div class="note-form-group">
            <label>年代范围</label>
            <input type="text" id="projChronology" value="${escapeHtml(proj.chronology || '')}" placeholder="如：明代（1368-1644）">
          </div>
          <div class="note-form-group">
            <label>状态</label>
            <select id="projStatus">
              ${Object.entries(PROJECT_STATUS).map(([k, v]) =>
                `<option value="${k}" ${proj.status === k ? 'selected' : ''}>${v}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-secondary" onclick="window.acadCloseProjectModal()">取消</button>
          <button class="btn btn-primary" onclick="window.acadSaveProject('${proj.id}', ${existing ? 'true' : 'false'})">保存</button>
        </div>
      </div>
    </div>
  `;
}

export async function saveProject(id, isExisting) {
  const data = {
    id,
    title: document.getElementById('projTitle').value.trim(),
    description: document.getElementById('projDesc').value.trim(),
    scope: document.getElementById('projScope').value.trim(),
    chronology: document.getElementById('projChronology').value.trim(),
    status: document.getElementById('projStatus').value,
  };

  if (!data.title) {
    alert('请填写项目名称');
    return;
  }

  if (isExisting) {
    const existing = await projectGetById(id);
    if (existing) {
      Object.assign(existing, data);
      existing.updatedAt = new Date().toISOString();
      existing.revision = (existing.revision || 1) + 1;
      await projectPut(existing);
    }
  } else {
    const proj = createProject(data);
    await projectPut(proj);
  }

  await refreshProjects();
  window.acadCloseProjectModal();
  window.acadNav('projects');
}

/* ---------- 预设项目 ---------- */
export async function loadPresetProjects() {
  const { PRESET_PROJECTS } = await import('../models.js');
  const existing = getState().projects;
  let added = 0;

  for (const preset of PRESET_PROJECTS) {
    // 检查是否已存在同名项目
    if (existing.some(p => p.title === preset.title)) continue;
    const proj = createProject(preset);
    await projectPut(proj);
    added++;
  }

  await refreshProjects();
  return added;
}

/* ---------- 添加研究问题 ---------- */
export async function addQuestion(projectId) {
  const text = prompt('请输入研究问题：');
  if (!text) return;

  const proj = await projectGetById(projectId);
  if (!proj) return;

  proj.researchQuestions = proj.researchQuestions || [];
  proj.researchQuestions.push(createResearchQuestion(text));
  proj.updatedAt = new Date().toISOString();
  proj.revision = (proj.revision || 1) + 1;
  await projectPut(proj);
  await refreshProjects();
  window.acadOpenProject(projectId);
}

/* ---------- 添加假说 ---------- */
export async function addHypothesis(projectId) {
  const text = prompt('请输入假说：');
  if (!text) return;

  const proj = await projectGetById(projectId);
  if (!proj) return;

  proj.hypotheses = proj.hypotheses || [];
  proj.hypotheses.push({ text, createdAt: new Date().toISOString() });
  proj.updatedAt = new Date().toISOString();
  proj.revision = (proj.revision || 1) + 1;
  await projectPut(proj);
  await refreshProjects();
  window.acadOpenProject(projectId);
}

/* ---------- 添加待解决问题 ---------- */
export async function addOpenQuestion(projectId) {
  const text = prompt('请输入待解决问题：');
  if (!text) return;

  const proj = await projectGetById(projectId);
  if (!proj) return;

  proj.openQuestions = proj.openQuestions || [];
  proj.openQuestions.push(text);
  proj.updatedAt = new Date().toISOString();
  proj.revision = (proj.revision || 1) + 1;
  await projectPut(proj);
  await refreshProjects();
  window.acadOpenProject(projectId);
}

/* ---------- 添加文献到项目 ---------- */
export async function addRefToProject(projectId) {
  const allRefs = await refGetAll();
  const activeRefs = allRefs.filter(r => !r.deletedAt);
  const proj = await projectGetById(projectId);

  if (activeRefs.length === 0) {
    alert('尚无文献可添加');
    return;
  }

  const existingIds = proj.references || [];
  const available = activeRefs.filter(r => !existingIds.includes(r.id));

  if (available.length === 0) {
    alert('所有文献已在此项目中');
    return;
  }

  // 创建选择弹窗
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="this.parentElement.remove()"></div>
    <div class="modal-content" style="max-width:600px;max-height:80vh;overflow-y:auto">
      <div class="modal-header">
        <h3>选择文献加入「${escapeHtml(proj.title)}」</h3>
        <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="modal-body" style="padding:16px">
        ${available.map(r => `
          <div class="dash-card-item" onclick="window.acadConfirmAddRef('${projectId}', '${r.id}')" style="cursor:pointer">
            <span class="label">${escapeHtml(r.title || '无标题')}</span>
            <span style="font-size:11px;color:var(--text-muted)">${escapeHtml((r.authors || '').slice(0, 30))}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export async function confirmAddRef(projectId, refId) {
  const proj = await projectGetById(projectId);
  if (!proj) return;

  proj.references = proj.references || [];
  if (!proj.references.includes(refId)) {
    proj.references.push(refId);
    proj.updatedAt = new Date().toISOString();
    proj.revision = (proj.revision || 1) + 1;
    await projectPut(proj);
  }

  // 同时更新文献的 projects 字段
  const ref = await refGetAll().then(refs => refs.find(r => r.id === refId));
  if (ref) {
    ref.projects = ref.projects || [];
    if (!ref.projects.includes(projectId)) {
      ref.projects.push(projectId);
      await refPut(ref);
    }
  }

  await refreshProjects();
  await refreshRefs();
  document.querySelectorAll('.modal.show').forEach(m => {
    if (m.querySelector('h3')?.textContent.includes('选择文献')) m.remove();
  });
  window.acadOpenProject(projectId);
}
