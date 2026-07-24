/**
 * js/views/dashboard.js
 * 首页仪表盘视图
 */

import { getState } from '../state.js';
import { READING_STATUS } from '../models.js';
import { escapeHtml } from '../security.js';

export function renderDashboard(container) {
  const { refs, projects, notes, claims } = getState();
  const activeRefs = refs.filter(r => !r.deletedAt);

  // 按阅读状态统计
  const statusCounts = {};
  Object.keys(READING_STATUS).forEach(s => statusCounts[s] = 0);
  activeRefs.forEach(r => {
    const status = r.workflow?.readingStatus || r.workflow?.readingStatus || 'inbox';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  // 待核验元数据
  const unverified = activeRefs.filter(r => {
    const s = r.workflow?.readingStatus;
    return s === 'unverified' || s === 'recheck';
  });

  // 已读未摘录
  const readNoExcerpt = activeRefs.filter(r => {
    const s = r.workflow?.readingStatus;
    return (s === 'read' || s === 'browsed') && !notes.some(n => n.referenceId === r.id);
  });

  // 已摘录未写作
  const excerptedNoWriting = activeRefs.filter(r => {
    const s = r.workflow?.readingStatus;
    return s === 'excerpted' && s !== 'writing' && s !== 'cited';
  });

  // 已写作未引用
  const writingNoCited = activeRefs.filter(r => {
    const s = r.workflow?.readingStatus;
    return s === 'writing' && s !== 'cited';
  });

  // 证据不足的论点
  const insufficientClaims = claims.filter(c => c.status === 'insufficient' || c.status === 'disputed');

  // 最近新增
  const recent = [...activeRefs]
    .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
    .slice(0, 5);

  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'planning');

  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="dash-card">
        <div class="dash-card-title">📊 资料概览</div>
        <div class="dash-card-item" onclick="window.acadNav('all')">
          <span class="label">总资料数</span>
          <span class="count">${activeRefs.length}</span>
        </div>
        <div class="dash-card-item" onclick="window.acadNav('inbox')">
          <span class="label">📥 收件箱</span>
          <span class="count">${statusCounts.inbox || 0}</span>
        </div>
        <div class="dash-card-item" onclick="window.acadNav('toread')">
          <span class="label">📖 待精读</span>
          <span class="count">${(statusCounts.toread || 0) + (statusCounts.tobrowse || 0)}</span>
        </div>
        <div class="dash-card-item" onclick="window.acadNav('reading')">
          <span class="label">🔍 正在阅读</span>
          <span class="count">${statusCounts.reading || 0}</span>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-title">📋 待办事项</div>
        ${unverified.length > 0 ? `
          <div class="dash-card-item" onclick="window.acadNav('unverified')">
            <span class="label">❓ 待核验元数据</span>
            <span class="count">${unverified.length}</span>
          </div>` : ''}
        ${readNoExcerpt.length > 0 ? `
          <div class="dash-card-item" onclick="window.acadNav('read-no-excerpt')">
            <span class="label">📝 已读未摘录</span>
            <span class="count">${readNoExcerpt.length}</span>
          </div>` : ''}
        ${excerptedNoWriting.length > 0 ? `
          <div class="dash-card-item" onclick="window.acadNav('excerpted-no-writing')">
            <span class="label">✍️ 已摘录未写作</span>
            <span class="count">${excerptedNoWriting.length}</span>
          </div>` : ''}
        ${writingNoCited.length > 0 ? `
          <div class="dash-card-item" onclick="window.acadNav('writing-no-cited')">
            <span class="label">📑 已写作未引用</span>
            <span class="count">${writingNoCited.length}</span>
          </div>` : ''}
        ${unverified.length === 0 && readNoExcerpt.length === 0 && excerptedNoWriting.length === 0 && writingNoCited.length === 0 ? '<div class="dash-empty">暂无待办事项</div>' : ''}
      </div>

      <div class="dash-card">
        <div class="dash-card-title">📁 研究项目</div>
        ${activeProjects.length > 0 ? activeProjects.slice(0, 5).map(p => `
          <div class="dash-card-item" onclick="window.acadOpenProject('${p.id}')">
            <span class="label">${escapeHtml(p.title)}</span>
            <span class="count">${(p.references || []).length}</span>
          </div>
        `).join('') : '<div class="dash-empty">尚无项目，点击「项目」创建</div>'}
      </div>

      <div class="dash-card">
        <div class="dash-card-title">⚖️ 论点状态</div>
        <div class="dash-card-item" onclick="window.acadNav('claims')">
          <span class="label">总论点数</span>
          <span class="count">${claims.length}</span>
        </div>
        ${insufficientClaims.length > 0 ? `
          <div class="dash-card-item" onclick="window.acadNav('insufficient-claims')">
            <span class="label">⚠️ 证据不足</span>
            <span class="count">${insufficientClaims.length}</span>
          </div>` : ''}
        <div class="dash-card-item" onclick="window.acadNav('claims')">
          <span class="label">📝 正在论证</span>
          <span class="count">${claims.filter(c => c.status === 'arguing').length}</span>
        </div>
        <div class="dash-card-item" onclick="window.acadNav('claims')">
          <span class="label">✅ 基本成立</span>
          <span class="count">${claims.filter(c => c.status === 'established').length}</span>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-title">🕐 最近新增</div>
        ${recent.length > 0 ? recent.map(r => `
          <div class="dash-card-item" onclick="window.showDetail('${r.id}')">
            <span class="label">${escapeHtml(r.title || '无标题')}</span>
            <span style="font-size:11px;color:var(--text-muted)">${r.year || ''}</span>
          </div>
        `).join('') : '<div class="dash-empty">尚无资料</div>'}
      </div>

      <div class="dash-card">
        <div class="dash-card-title">💾 数据备份</div>
        <div class="dash-card-item" onclick="window.acadExportBackup()">
          <span class="label">📤 导出备份</span>
          <span style="font-size:11px;color:var(--text-muted)">JSON</span>
        </div>
        <div class="dash-card-item" onclick="window.acadImportBackup()">
          <span class="label">📥 导入备份</span>
          <span style="font-size:11px;color:var(--text-muted)">恢复</span>
        </div>
        <div class="dash-card-item" onclick="window.acadNav('recycle')">
          <span class="label">🗑️ 回收站</span>
          <span class="count">查看</span>
        </div>
      </div>
    </div>
  `;
}
