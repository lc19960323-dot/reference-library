/**
 * js/app.js
 * 学术工作台主模块 - 初始化、路由、全局接口
 *
 * 该模块作为 ES module 加载，负责:
 * 1. 初始化新数据库层 (IndexedDB v2)
 * 2. 加载所有数据到 state
 * 3. 注册全局 API (window.acad*)
 * 4. 处理新视图路由
 * 5. 与旧 index.html 内联脚本桥接
 */

import { initDatabase, exportAllData, importAllData, STORES } from './database/db.js';
import { refreshAllData, getState, setState, refreshRefs, refreshProjects, refreshNotes, refreshClaims, refreshEvidence } from './state.js';
import { PRESET_PROJECTS, createProject, READING_STATUS } from './models.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProjectList, renderProjectDetail, renderProjectForm, saveProject, loadPresetProjects,
  addQuestion, addHypothesis, addOpenQuestion, addRefToProject, confirmAddRef } from './views/projects.js';
import { renderNotesList, renderNoteForm, saveNote, deleteNote, renderNotesForReference, updateReadingStatus } from './views/notes.js';
import { renderClaimsList, renderClaimDetail, renderClaimForm, saveClaim, deleteClaim,
  renderEvidenceForm, saveEvidence, deleteEvidence, renderMatrix, exportProjectMarkdown } from './views/claims.js';
import { renderRecycleBin, restoreItem, hardDelete, clearRecycle } from './views/recycle.js';
import { escapeHtml } from './security.js';

/* ========== 初始化 ========== */
export async function initApp() {
  console.log('[App] Initializing academic workbench...');

  // 初始化新数据库
  await initDatabase();

  // 加载所有数据
  await refreshAllData();

  // 添加新导航项到侧边栏
  injectAcademicNav();

  // 注册全局 API
  registerGlobalAPI();

  console.log('[App] Academic workbench ready');
  console.log('[App] Data:', {
    refs: getState().refs.length,
    projects: getState().projects.length,
    notes: getState().notes.length,
    claims: getState().claims.length,
    evidence: getState().evidence.length,
  });
}

/* ========== 侧边栏导航注入 ========== */
function injectAcademicNav() {
  const sidebarNav = document.querySelector('.sidebar-nav');
  if (!sidebarNav) {
    // 侧边栏还没渲染，稍后重试
    setTimeout(injectAcademicNav, 500);
    return;
  }

  // 检查是否已注入
  if (document.getElementById('navAcademic')) return;

  const navHtml = `
    <div class="nav-section" id="navAcademic">
      <div class="nav-section-title">学术工作台</div>
      <div class="nav-item" onclick="window.acadNav('dashboard')">
        <span>🏠</span> 首页仪表盘
      </div>
      <div class="nav-item" onclick="window.acadNav('projects')">
        <span>📁</span> 研究项目
        <span class="nav-badge" id="navBadge-projects"></span>
      </div>
      <div class="nav-item" onclick="window.acadNav('claims')">
        <span>⚖️</span> 论点与证据
        <span class="nav-badge" id="navBadge-claims"></span>
      </div>
      <div class="nav-item" onclick="window.acadNav('notes')">
        <span>📝</span> 笔记与摘录
        <span class="nav-badge" id="navBadge-notes"></span>
      </div>
      <div class="nav-item" onclick="window.acadNav('recycle')">
        <span>🗑️</span> 回收站
      </div>
    </div>
  `;

  // 插入到导航最前面
  sidebarNav.insertAdjacentHTML('afterbegin', navHtml);

  // 更新徽章
  updateNavBadges();
}

function updateNavBadges() {
  const { projects, claims, notes } = getState();
  const setBadge = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count > 0 ? count : '';
  };
  setBadge('navBadge-projects', projects.length);
  setBadge('navBadge-claims', claims.length);
  setBadge('navBadge-notes', notes.length);
}

/* ========== 路由 ========== */
export async function acadNav(view) {
  const main = document.getElementById('mainContent') || document.querySelector('.main');
  if (!main) return;

  // 高亮当前导航项
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const navItems = document.querySelectorAll('#navAcademic .nav-item');
  const viewMap = { dashboard: 0, projects: 1, claims: 2, notes: 3, recycle: 4 };
  if (viewMap[view] !== undefined && navItems[viewMap[view]]) {
    navItems[viewMap[view]].classList.add('active');
  }

  setState({ view });

  // 刷新数据
  await refreshAllData();
  updateNavBadges();

  // 渲染对应视图
  const content = main.querySelector('.content') || main;
  switch (view) {
    case 'dashboard':
      renderDashboard(content);
      break;
    case 'projects':
      renderProjectList(content);
      break;
    case 'claims':
      renderClaimsList(content);
      break;
    case 'notes':
      renderNotesList(content);
      break;
    case 'recycle':
      await renderRecycleBin(content);
      break;
    // 特殊筛选视图
    case 'inbox':
    case 'toread':
    case 'reading':
    case 'unverified':
    case 'read-no-excerpt':
    case 'excerpted-no-writing':
    case 'writing-no-cited':
    case 'insufficient-claims':
      renderFilteredView(content, view);
      break;
    default:
      // 旧视图路由 - 由旧代码的 handleNavClick 处理，此处不干预
      break;
  }
}

function renderFilteredView(container, filter) {
  const { refs, notes, claims } = getState();
  let filtered = [];
  let title = '';

  switch (filter) {
    case 'inbox':
      filtered = refs.filter(r => r.workflow?.readingStatus === 'inbox');
      title = '📥 收件箱';
      break;
    case 'toread':
      filtered = refs.filter(r => ['toread', 'tobrowse'].includes(r.workflow?.readingStatus));
      title = '📖 待精读';
      break;
    case 'reading':
      filtered = refs.filter(r => r.workflow?.readingStatus === 'reading');
      title = '🔍 正在阅读';
      break;
    case 'unverified':
      filtered = refs.filter(r => ['unverified', 'recheck'].includes(r.workflow?.readingStatus));
      title = '❓ 待核验元数据';
      break;
    case 'read-no-excerpt':
      filtered = refs.filter(r => {
        const s = r.workflow?.readingStatus;
        return (s === 'read' || s === 'browsed') && !notes.some(n => n.referenceId === r.id);
      });
      title = '📝 已读未摘录';
      break;
    case 'excerpted-no-writing':
      filtered = refs.filter(r => r.workflow?.readingStatus === 'excerpted');
      title = '✍️ 已摘录未写作';
      break;
    case 'writing-no-cited':
      filtered = refs.filter(r => r.workflow?.readingStatus === 'writing');
      title = '📑 已写作未引用';
      break;
    case 'insufficient-claims':
      filtered = claims.filter(c => c.status === 'insufficient' || c.status === 'disputed');
      title = '⚠️ 证据不足的论点';
      // 用 claims 视图渲染
      if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-text">${title}：暂无</div></div>`;
      } else {
        container.innerHTML = `<h2 style="font-size:18px;font-weight:700;margin-bottom:16px">${title} (${filtered.length})</h2>`;
        filtered.forEach(claim => {
          container.insertAdjacentHTML('beforeend', `
            <div class="claim-card" onclick="window.acadOpenClaim('${claim.id}')" style="cursor:pointer">
              <div class="claim-title">${escapeHtml(claim.title)}</div>
              <div class="claim-statement">${escapeHtml((claim.statement || '').slice(0, 200))}</div>
            </div>
          `);
        });
      }
      return;
  }

  // 渲染文献列表
  container.innerHTML = `
    <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">${title} (${filtered.length})</h2>
    ${filtered.length > 0 ? filtered.map(ref => {
      const status = READING_STATUS[ref.workflow?.readingStatus] || READING_STATUS.inbox;
      return `
        <div class="ref-card" onclick="window.showDetail('${ref.id}')" style="cursor:pointer;margin-bottom:8px">
          <div class="ref-card-title">${escapeHtml(ref.title || '无标题')}</div>
          <div class="ref-card-authors">${escapeHtml(ref.authors || '')}</div>
          <span class="reading-status-badge ${status.class}">${status.icon} ${status.label}</span>
        </div>
      `;
    }).join('') : '<div class="empty-state"><div class="empty-text">暂无资料</div></div>'}
  `;
}

/* ========== 项目相关全局 API ========== */
function acadOpenProject(projectId) {
  setState({ currentProjectId: projectId });
  const main = document.querySelector('.main');
  const content = main.querySelector('.content') || main;
  renderProjectDetail(content, projectId);
}

function acadNewProject() {
  const overlay = document.createElement('div');
  overlay.id = 'projectModalContainer';
  document.body.appendChild(overlay);
  renderProjectForm(overlay);
}

function acadEditProject(projectId) {
  const overlay = document.createElement('div');
  overlay.id = 'projectModalContainer';
  document.body.appendChild(overlay);
  import('../database/db.js').then(({ projectGetById }) => {
    projectGetById(projectId).then(proj => {
      renderProjectForm(overlay, proj);
    });
  });
}

function acadCloseProjectModal() {
  const overlay = document.getElementById('projectModalContainer');
  if (overlay) overlay.remove();
}

function acadSaveProject(id, isExisting) {
  saveProject(id, isExisting === 'true' || isExisting === true);
}

async function acadLoadPresetProjects() {
  const added = await loadPresetProjects();
  if (typeof showToast === 'function') {
    showToast(`已加载 ${added} 个预设项目`, 'success');
  }
  acadNav('projects');
}

function acadAddQuestion(projectId) { addQuestion(projectId); }
function acadAddHypothesis(projectId) { addHypothesis(projectId); }
function acadAddOpenQuestion(projectId) { addOpenQuestion(projectId); }
function acadAddRefToProject(projectId) { addRefToProject(projectId); }
function acadConfirmAddRef(projectId, refId) { confirmAddRef(projectId, refId); }

/* ========== 笔记相关全局 API ========== */
function acadNewNoteForRef(refId) {
  const overlay = document.createElement('div');
  overlay.id = 'noteModalContainer';
  document.body.appendChild(overlay);
  renderNoteForm(overlay, null, refId);
}

function acadNewNote(projId) {
  const overlay = document.createElement('div');
  overlay.id = 'noteModalContainer';
  document.body.appendChild(overlay);
  renderNoteForm(overlay, null, null, projId);
}

function acadEditNote(noteId) {
  const overlay = document.createElement('div');
  overlay.id = 'noteModalContainer';
  document.body.appendChild(overlay);
  const note = getState().notes.find(n => n.id === noteId);
  renderNoteForm(overlay, note);
}

function acadCloseNoteModal() {
  const overlay = document.getElementById('noteModalContainer');
  if (overlay) overlay.remove();
}

function acadSaveNote(id, isExisting) {
  saveNote(id, isExisting === 'true' || isExisting === true);
}

function acadDeleteNote(id) { deleteNote(id); }

async function acadLinkNoteToClaim(noteId) {
  const { claims } = getState();
  if (claims.length === 0) {
    if (typeof showToast === 'function') showToast('请先创建论点', 'error');
    return;
  }
  const claimId = prompt('输入论点ID关联（或在论点详情页添加证据）：\n' +
    claims.map(c => `${c.id}: ${c.title}`).join('\n'));
  if (!claimId) return;
  // TODO: link note to claim
}

/* ========== 论点相关全局 API ========== */
function acadOpenClaim(claimId) {
  setState({ currentClaimId: claimId });
  const main = document.querySelector('.main');
  const content = main.querySelector('.content') || main;
  renderClaimDetail(content, claimId);
}

function acadNewClaim(projId) {
  const overlay = document.createElement('div');
  overlay.id = 'claimModalContainer';
  document.body.appendChild(overlay);
  renderClaimForm(overlay, null, projId || null);
}

function acadEditClaim(claimId) {
  const overlay = document.createElement('div');
  overlay.id = 'claimModalContainer';
  document.body.appendChild(overlay);
  import('../database/db.js').then(({ claimGetById }) => {
    claimGetById(claimId).then(claim => {
      renderClaimForm(overlay, claim);
    });
  });
}

function acadCloseClaimModal() {
  const overlay = document.getElementById('claimModalContainer');
  if (overlay) overlay.remove();
}

function acadSaveClaim(id, isExisting) {
  saveClaim(id, isExisting === 'true' || isExisting === true);
}

function acadDeleteClaim(id) { deleteClaim(id); }

/* ========== 证据相关全局 API ========== */
function acadAddEvidence(claimId, defaultType) {
  const overlay = document.createElement('div');
  overlay.id = 'evidenceModalContainer';
  document.body.appendChild(overlay);
  renderEvidenceForm(overlay, claimId, null, defaultType);
}

function acadEditEvidence(evId) {
  const overlay = document.createElement('div');
  overlay.id = 'evidenceModalContainer';
  document.body.appendChild(overlay);
  const ev = getState().evidence.find(e => e.id === evId);
  renderEvidenceForm(overlay, ev?.claimId, ev);
}

function acadCloseEvidenceModal() {
  const overlay = document.getElementById('evidenceModalContainer');
  if (overlay) overlay.remove();
}

function acadSaveEvidence(id, claimId, isExisting) {
  saveEvidence(id, claimId, isExisting === 'true' || isExisting === true);
}

function acadDeleteEvidence(id) { deleteEvidence(id); }

/* ========== 矩阵 API ========== */
function acadShowMatrix(projectId) {
  const main = document.querySelector('.main');
  const content = main.querySelector('.content') || main;
  renderMatrix(content, projectId);
}

/* ========== 导出 API ========== */
function acadExportProject(projectId) {
  exportProjectMarkdown(projectId);
}

async function acadExportBackup() {
  const data = await exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reflib-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('备份已导出', 'success');
}

function acadImportBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const mode = confirm('选择「确定」合并导入（保留现有数据），\n选择「取消」完全替换（删除现有数据）') ? 'merge' : 'replace';
      if (mode === 'replace' && !confirm('⚠️ 确定完全替换？现有数据将被覆盖！')) return;
      const result = await importAllData(data, mode);
      await refreshAllData();
      updateNavBadges();
      if (typeof showToast === 'function') {
        showToast(`导入完成：新增 ${result.added}，更新 ${result.updated}，跳过 ${result.skipped}`, 'success');
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('导入失败: ' + err.message, 'error');
    }
  };
  input.click();
}

/* ========== 回收站 API ========== */
function acadRestoreItem(id) { restoreItem(id); }
function acadHardDelete(id) { hardDelete(id); }
function acadClearRecycle() { clearRecycle(); }

/* ========== 全局 API 注册 ========== */
function registerGlobalAPI() {
  // 路由
  window.acadNav = acadNav;

  // 项目
  window.acadOpenProject = acadOpenProject;
  window.acadNewProject = acadNewProject;
  window.acadEditProject = acadEditProject;
  window.acadCloseProjectModal = acadCloseProjectModal;
  window.acadSaveProject = acadSaveProject;
  window.acadLoadPresetProjects = acadLoadPresetProjects;
  window.acadAddQuestion = acadAddQuestion;
  window.acadAddHypothesis = acadAddHypothesis;
  window.acadAddOpenQuestion = acadAddOpenQuestion;
  window.acadAddRefToProject = acadAddRefToProject;
  window.acadConfirmAddRef = acadConfirmAddRef;

  // 笔记
  window.acadNewNote = acadNewNote;
  window.acadNewNoteForRef = acadNewNoteForRef;
  window.acadEditNote = acadEditNote;
  window.acadCloseNoteModal = acadCloseNoteModal;
  window.acadSaveNote = acadSaveNote;
  window.acadDeleteNote = acadDeleteNote;
  window.acadLinkNoteToClaim = acadLinkNoteToClaim;

  // 论点
  window.acadOpenClaim = acadOpenClaim;
  window.acadNewClaim = acadNewClaim;
  window.acadEditClaim = acadEditClaim;
  window.acadCloseClaimModal = acadCloseClaimModal;
  window.acadSaveClaim = acadSaveClaim;
  window.acadDeleteClaim = acadDeleteClaim;

  // 证据
  window.acadAddEvidence = acadAddEvidence;
  window.acadEditEvidence = acadEditEvidence;
  window.acadCloseEvidenceModal = acadCloseEvidenceModal;
  window.acadSaveEvidence = acadSaveEvidence;
  window.acadDeleteEvidence = acadDeleteEvidence;

  // 矩阵
  window.acadShowMatrix = acadShowMatrix;

  // 导出
  window.acadExportProject = acadExportProject;
  window.acadExportBackup = acadExportBackup;
  window.acadImportBackup = acadImportBackup;

  // 回收站
  window.acadRestoreItem = acadRestoreItem;
  window.acadHardDelete = acadHardDelete;
  window.acadClearRecycle = acadClearRecycle;

  // 暴露数据刷新（供旧代码调用）
  window.acadRefresh = async () => {
    await refreshAllData();
    updateNavBadges();
  };

  // 暴露阅读状态更新
  window.acadUpdateReadingStatus = updateReadingStatus;

  // 暴露笔记渲染（供详情页调用）
  window.acadRenderNotesForRef = renderNotesForReference;

  // 标签页切换
  window.acadSwitchDetailTab = (index) => {
    document.querySelectorAll('.detail-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });
    document.querySelectorAll('.detail-tab-content').forEach((content, i) => {
      content.classList.toggle('active', i === index);
    });
  };
}
