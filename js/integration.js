/* js/integration.js
 *
 * 桥接模块：将 security.js、backup.js、pdf-parser.js、pdf-preview.js
 * 连接到现有 index.html 中的全局函数（allRefs、dbAddOrUpdate、dbClear、
 * refreshUI、showToast、fillFormFromMetadata、loadPdfJs）。
 *
 * 现有内联脚本中的旧版云端备份和 PDF 处理函数已被移除，
 * 由本文件通过 window.* 暴露的新函数替代。
 */

import {
  escapeHtml,
  setSafeText,
  safeExternalUrl,
  createElement
} from './security.js';

import {
  migrateLegacyDestinations,
  getDestinations,
  saveDestinations,
  addDestination,
  removeDestination,
  setDestinationToken,
  hasDestinationToken,
  testDestination,
  backupToDestination,
  readBackupFromDestination,
  createRestorePlan,
  applyRestorePlan,
  replaceAllFromBackup,
  getAutoDestinationIds,
  saveAutoDestinationIds,
  getBackupHistory
} from './backup.js';

import {
  normalizeDoi
} from './pdf-parser.js';

/* ---------- PWA: 使用相对路径注册 Service Worker ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch(error => console.error('Service Worker 注册失败', error));
  });
}

/* ---------- 启动时迁移旧 Token ---------- */

migrateLegacyDestinations();

/* ---------- 手机菜单 ---------- */

const menuToggle = document.querySelector('.menu-toggle');
const sidebar = document.querySelector('.sidebar');

menuToggle?.setAttribute('aria-expanded', 'false');
menuToggle?.setAttribute('aria-controls', 'sidebar');

menuToggle?.addEventListener('click', () => {
  const isOpen = sidebar?.classList.toggle('open') ?? false;
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

sidebar?.addEventListener('click', event => {
  if (
    window.matchMedia('(max-width: 768px)').matches &&
    event.target.closest('a, button, [data-view]')
  ) {
    sidebar.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }
});

/* ---------- 暴露安全工具函数到 window ---------- */

window.escapeHtml = escapeHtml;
window.safeExternalUrl = safeExternalUrl;
window.normalizeDoi = normalizeDoi;

/* ---------- 备份 UI 接入 ---------- */

window.unlockBackupDestination = function unlockBackupDestination(destId) {
  const token = window.prompt(
    '请输入 Token。Token 只保存在当前页面内存中，刷新后需要重新输入。'
  );

  if (!token) return;

  setDestinationToken(destId, token.trim());
  if (typeof showToast === 'function') showToast('本次会话已解锁', 'success');
  if (typeof renderCloud === 'function') renderCloud();
};

window.addBackupDestinationSecurely = function addBackupDestinationSecurely() {
  const platform = document.getElementById('addDestPlatform').value;
  const name = document.getElementById('addDestName').value.trim();
  const repo = document.getElementById('addDestRepo').value.trim();
  const branch =
    document.getElementById('addDestBranch')?.value.trim() ||
    (platform === 'gitee' ? 'master' : 'main');
  const token = document.getElementById('addDestToken').value.trim();

  try {
    addDestination({ platform, name, repo, branch, token });

    // 不让 Token 留在输入框或 DOM 中。
    document.getElementById('addDestToken').value = '';

    showToast('目的地已添加；Token 未写入本地存储', 'success');
    renderCloud();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.testBackupDestinationSecurely =
async function testBackupDestinationSecurely(destId) {
  try {
    if (!hasDestinationToken(destId)) {
      window.unlockBackupDestination(destId);
      if (!hasDestinationToken(destId)) return;
    }

    const result = await testDestination(destId);
    const name =
      result.full_name ||
      result.path_with_namespace ||
      result.name ||
      '仓库';

    showToast(`连接成功：${name}`, 'success');
  } catch (error) {
    showToast(`连接失败：${error.message}`, 'error');
  }
};

window.cloudBackupTo = async function cloudBackupTo(destId) {
  try {
    if (!hasDestinationToken(destId)) {
      window.unlockBackupDestination(destId);
      if (!hasDestinationToken(destId)) return;
    }

    const envelope = await backupToDestination(destId, allRefs);
    showToast(`备份成功：${envelope.recordCount} 条`, 'success');
    renderCloud();
  } catch (error) {
    showToast(`备份失败：${error.message}`, 'error');
    renderCloud();
  }
};

window.cloudBackupAll = async function cloudBackupAll() {
  const dests = getDestinations();
  if (dests.length === 0) {
    showToast('没有配置备份目的地', 'error');
    return;
  }
  for (const dest of dests) {
    await window.cloudBackupTo(dest.id);
  }
};

window.cloudRestoreFrom = async function cloudRestoreFrom(destId) {
  try {
    if (!hasDestinationToken(destId)) {
      window.unlockBackupDestination(destId);
      if (!hasDestinationToken(destId)) return;
    }

    const payload = await readBackupFromDestination(destId);
    const plan = createRestorePlan(allRefs, payload.refs);
    const summary = plan.summary;

    const confirmed = window.confirm(
      `备份时间：${payload.exportedAt || '旧版备份'}\n` +
      `云端记录：${payload.recordCount}\n` +
      `将新增：${summary.add}\n` +
      `将更新：${summary.update}\n` +
      `冲突：${summary.conflict}\n\n` +
      '冲突记录不会自动覆盖。是否继续？'
    );

    if (!confirmed) return;

    await applyRestorePlan(plan, dbAddOrUpdate);

    // 以数据库为准重新读取
    if (typeof dbGetAll === 'function') {
      allRefs = await dbGetAll();
    } else {
      allRefs = [
        ...allRefs.filter(
          local =>
            !plan.updates.some(update => update.id === local.id)
        ),
        ...plan.updates,
        ...plan.additions
      ];
    }

    refreshUI();
    showToast(
      `恢复完成：新增 ${summary.add}，更新 ${summary.update}，冲突 ${summary.conflict}`,
      'success'
    );
  } catch (error) {
    showToast(`恢复失败：${error.message}`, 'error');
  }
};

window.cloudReplaceFrom = async function cloudReplaceFrom(destId) {
  try {
    if (!hasDestinationToken(destId)) {
      window.unlockBackupDestination(destId);
      if (!hasDestinationToken(destId)) return;
    }

    const payload = await readBackupFromDestination(destId);

    const confirmed = window.confirm(
      `⚠️ 将使用 ${payload.recordCount} 条云端记录完全覆盖本地数据。\n` +
      '此操作不可撤销。请确认你已另存一份本地 JSON 导出。'
    );

    if (!confirmed) return;

    await replaceAllFromBackup(payload, dbClear, dbAddOrUpdate);
    allRefs = payload.refs;
    refreshUI();
    showToast('完全替换成功', 'success');
  } catch (error) {
    showToast(`替换失败：${error.message}`, 'error');
  }
};

window.removeDest = function removeDest(destId) {
  const dests = getDestinations();
  const dest = dests.find(d => d.id === destId);
  if (!dest) return;
  if (!confirm(`确定删除备份目的地「${dest.name}」？\n（云端备份数据不会被删除，只是不再从此处备份/恢复）`)) return;
  removeDestination(destId);
  showToast(`已删除 ${dest.name}`, 'success');
  renderCloud();
};

window.testNewDest = async function testNewDest() {
  const platform = document.getElementById('addDestPlatform').value;
  const repo = document.getElementById('addDestRepo').value.trim();
  const token = document.getElementById('addDestToken').value.trim();
  if (!repo || !token) { showToast('请填写仓库和 Token', 'error'); return; }

  // 临时创建一个目的地用于测试
  const tempId = 'temp_' + Date.now();
  try {
    addDestination({ platform, name: '临时测试', repo, branch: 'main', token });
    // 立即删除，只用于测试连接
    const dests = getDestinations();
    const tempDest = dests.find(d => d.name === '临时测试' && d.repo === repo);
    if (tempDest) {
      const result = await testDestination(tempDest.id);
      const name = result.full_name || result.path_with_namespace || result.name || '仓库';
      const isPrivate = result.private !== undefined ? result.private : !result.public;
      showToast(`连接成功！仓库: ${name} (${isPrivate ? '私有' : '公开'})`, 'success');
      removeDestination(tempDest.id);
    }
  } catch (error) {
    // 如果添加成功但测试失败，也要清理
    const dests = getDestinations();
    const tempDest = dests.find(d => d.name === '临时测试' && d.repo === repo);
    if (tempDest) removeDestination(tempDest.id);
    showToast('连接失败: ' + error.message, 'error');
  }
};

window.toggleAutoDest = function toggleAutoDest(destId, enabled) {
  let autoIds = getAutoDestinationIds();
  if (enabled) {
    if (!autoIds.includes(destId)) autoIds.push(destId);
  } else {
    autoIds = autoIds.filter(id => id !== destId);
  }
  saveAutoDestinationIds(autoIds);
  startAutoBackup();
  showToast(enabled ? '自动备份已启用' : '自动备份已禁用', 'success');
};

/* ---------- PDF 导入：保留原有 processPdf/smartPrefillPdf/showPdfPickerPanel ---------- */
/* 原有的 PDF 处理逻辑（smartPrefillPdf 台湾学术格式支持、showPdfPickerPanel
 * 文本点选式面板）仍在 index.html 内联脚本中，不需要模块覆盖。
 * pdf-parser.js 的 normalizeDoi 已暴露到 window.normalizeDoi 供调用。 */

/* ---------- 适配旧代码：暴露 getDestinations / getAutoDestIds 等 ---------- */

window.getDestinations = getDestinations;
window.getAutoDestIds = getAutoDestinationIds;
window.getBackupHistory = getBackupHistory;
window.hasDestinationToken = hasDestinationToken;
