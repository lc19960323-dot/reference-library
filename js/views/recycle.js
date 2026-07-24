/**
 * js/views/recycle.js
 * 回收站视图 - 查看、恢复、永久删除
 */

import { recycleGetAll, refRestore, refHardDelete, recycleClear } from '../database/db.js';
import { refreshRefs, refreshAllData } from '../state.js';
import { escapeHtml } from '../security.js';

export async function renderRecycleBin(container) {
  const items = await recycleGetAll();

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700">🗑️ 回收站 (${items.length})</h2>
      ${items.length > 0 ? `<button class="btn btn-secondary" onclick="window.acadClearRecycle()" style="color:var(--danger)">清空回收站</button>` : ''}
    </div>
  `;

  if (items.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-icon">🗑️</div>
        <div class="empty-text">回收站为空</div>
      </div>
    `;
  } else {
    for (const item of items) {
      const deletedAt = item.deletedAt ? new Date(item.deletedAt).toLocaleString('zh-CN') : '';
      html += `
        <div class="recycle-item">
          <div class="recycle-item-info">
            <div class="recycle-item-title">${escapeHtml(item.title || '无标题')}</div>
            <div class="recycle-item-meta">
              ${escapeHtml(item.authors || '')} ${item.year ? '· ' + item.year : ''} ${item.type ? '· ' + item.type : ''}
              ${deletedAt ? ' · 删除于 ' + deletedAt : ''}
            </div>
          </div>
          <div class="recycle-actions">
            <button class="restore-btn" onclick="window.acadRestoreItem('${item.id}')">恢复</button>
            <button class="delete-btn" onclick="window.acadHardDelete('${item.id}')">永久删除</button>
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

export async function restoreItem(id) {
  await refRestore(id);
  await refreshRefs();
  window.acadNav('recycle');
}

export async function hardDelete(id) {
  if (!confirm('⚠️ 永久删除不可恢复！确定吗？')) return;
  await refHardDelete(id);
  await refreshRefs();
  window.acadNav('recycle');
}

export async function clearRecycle() {
  if (!confirm('⚠️ 将永久删除回收站中的所有记录，不可恢复！确定吗？')) return;
  await recycleClear();
  await refreshAllData();
  window.acadNav('recycle');
}
