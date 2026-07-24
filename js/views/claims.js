/**
 * js/views/claims.js
 * 论点—证据—反证卡片 + 论点-证据矩阵 + 导出 Markdown
 */

import { getState, refreshClaims, refreshEvidence, refreshProjects } from '../state.js';
import {
  createClaim, createEvidence,
  CLAIM_STATUS, EVIDENCE_TYPES, EVIDENCE_STRENGTH
} from '../models.js';
import {
  claimPut, claimDelete, claimGetById, claimGetAll,
  evidencePut, evidenceDelete, evidenceGetByClaim, evidenceGetAll,
  projectGetById
} from '../database/db.js';
import { escapeHtml } from '../security.js';

/* ---------- 论点列表 ---------- */
export function renderClaimsList(container) {
  const { claims, projects } = getState();

  if (claims.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚖️</div>
        <div class="empty-text">尚无论点</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:8px">在项目页或此处新建论点</div>
        <button class="btn btn-primary" style="margin-top:12px" onclick="window.acadNewClaim()">+ 新建论点</button>
      </div>
    `;
    return;
  }

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700">论点与证据 (${claims.length})</h2>
      <button class="btn btn-primary" onclick="window.acadNewClaim()">+ 新建论点</button>
    </div>
  `;

  for (const claim of claims) {
    const st = CLAIM_STATUS[claim.status] || CLAIM_STATUS.idea;
    const proj = projects.find(p => p.id === claim.projectId);
    const supportCount = (claim.supportingEvidence || []).length;
    const opposeCount = (claim.opposingEvidence || []).length;
    const indirectCount = (claim.indirectEvidence || []).length;

    html += `
      <div class="claim-card" onclick="window.acadOpenClaim('${claim.id}')" style="cursor:pointer">
        <div class="claim-card-header">
          <div>
            <div class="claim-title">${escapeHtml(claim.title)}</div>
            <span class="claim-status-badge ${st.class}">${st.icon} ${st.label}</span>
            ${proj ? `<span style="font-size:11px;color:var(--text-muted);margin-left:8px">📁 ${escapeHtml(proj.title)}</span>` : ''}
          </div>
        </div>
        <div class="claim-statement">${escapeHtml((claim.statement || '').slice(0, 300))}${claim.statement && claim.statement.length > 300 ? '...' : ''}</div>
        <div style="display:flex;gap:16px;font-size:12px">
          <span style="color:#16a34a">✅ 支持: ${supportCount}</span>
          <span style="color:#dc2626">❌ 反对: ${opposeCount}</span>
          <span style="color:#d97706">↗️ 间接: ${indirectCount}</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

/* ---------- 论点详情 ---------- */
export async function renderClaimDetail(container, claimId) {
  const claim = await claimGetById(claimId);
  if (!claim) {
    container.innerHTML = '<div class="empty-state"><div class="empty-text">论点不存在</div></div>';
    return;
  }

  const evidence = await evidenceGetByClaim(claimId);
  const supporting = evidence.filter(e => ['directSupport', 'indirectSupport'].includes(e.relationType));
  const opposing = evidence.filter(e => ['opposing', 'contradictory'].includes(e.relationType));
  const other = evidence.filter(e => !['directSupport', 'indirectSupport', 'opposing', 'contradictory'].includes(e.relationType));

  const st = CLAIM_STATUS[claim.status] || CLAIM_STATUS.idea;
  const { refs, projects } = getState();

  let html = `
    <div style="margin-bottom:12px">
      <button class="btn btn-secondary" onclick="window.acadNav('claims')">← 返回论点列表</button>
      <button class="btn btn-secondary" onclick="window.acadEditClaim('${claim.id}')" style="margin-left:8px">编辑</button>
      <button class="btn btn-secondary" onclick="window.acadDeleteClaim('${claim.id}')" style="margin-left:8px;color:var(--danger)">删除</button>
    </div>
    <div class="project-detail-header">
      <div class="project-detail-title">${escapeHtml(claim.title)}</div>
      <div style="margin:12px 0">
        <span class="claim-status-badge ${st.class}">${st.icon} ${st.label}</span>
        ${claim.projectId ? `<span style="margin-left:8px;font-size:13px;color:var(--text-muted)">📁 ${escapeHtml(projects.find(p => p.id === claim.projectId)?.title || '')}</span>` : ''}
      </div>
      ${claim.statement ? `<div class="project-detail-desc">${escapeHtml(claim.statement)}</div>` : ''}
      ${claim.scope ? `<div style="font-size:13px;color:var(--text-muted);margin-top:8px">范围: ${escapeHtml(claim.scope)}</div>` : ''}
      ${claim.chronology ? `<div style="font-size:13px;color:var(--text-muted)">年代: ${escapeHtml(claim.chronology)}</div>` : ''}
      ${claim.confidence ? `<div style="font-size:13px;margin-top:8px">信心指数: <strong>${'★'.repeat(Math.round(claim.confidence * 5))}${'☆'.repeat(5 - Math.round(claim.confidence * 5))}</strong> (${Math.round(claim.confidence * 100)}%)</div>` : ''}
    </div>
  `;

  // 支持证据
  html += `
    <div class="project-section">
      <div class="project-section-title">
        ✅ 支持证据 (${supporting.length})
        <button class="add-btn" onclick="window.acadAddEvidence('${claim.id}', 'directSupport')">+ 添加</button>
      </div>
      ${supporting.length > 0 ? supporting.map(e => renderEvidenceCard(e, refs)).join('') : '<div class="dash-empty">尚无支持证据</div>'}
    </div>
  `;

  // 反对证据
  html += `
    <div class="project-section">
      <div class="project-section-title">
        ❌ 反面证据 (${opposing.length})
        <button class="add-btn" onclick="window.acadAddEvidence('${claim.id}', 'opposing')">+ 添加</button>
      </div>
      ${opposing.length > 0 ? opposing.map(e => renderEvidenceCard(e, refs)).join('') : '<div class="dash-empty">尚无反面证据</div>'}
    </div>
  `;

  // 其他证据
  if (other.length > 0) {
    html += `
      <div class="project-section">
        <div class="project-section-title">📐 其他证据 (${other.length})</div>
        ${other.map(e => renderEvidenceCard(e, refs)).join('')}
      </div>
    `;
  }

  // 前人观点
  if (claim.previousScholarship) {
    html += `
      <div class="project-section">
        <div class="project-section-title">📚 前人观点</div>
        <div style="font-size:14px;line-height:1.8;color:var(--text-secondary)">${escapeHtml(claim.previousScholarship)}</div>
      </div>
    `;
  }

  // 可能的反对意见
  if (claim.possibleObjections && claim.possibleObjections.length > 0) {
    html += `
      <div class="project-section">
        <div class="project-section-title">⚠️ 可能的反对意见</div>
        ${claim.possibleObjections.map(o => `<div class="research-question"><div class="rq-text">${escapeHtml(typeof o === 'string' ? o : o.text)}</div></div>`).join('')}
      </div>
    `;
  }

  // 未解决问题
  if (claim.unresolvedQuestions && claim.unresolvedQuestions.length > 0) {
    html += `
      <div class="project-section">
        <div class="project-section-title">🔍 未解决问题</div>
        ${claim.unresolvedQuestions.map(q => `<div class="research-question"><div class="rq-text">${escapeHtml(typeof q === 'string' ? q : q.text)}</div></div>`).join('')}
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderEvidenceCard(ev, refs) {
  const et = EVIDENCE_TYPES[ev.relationType] || EVIDENCE_TYPES.directSupport;
  const es = EVIDENCE_STRENGTH[ev.strength] || EVIDENCE_STRENGTH.medium;
  const ref = refs.find(r => r.id === ev.referenceId);

  const loc = ev.location || {};
  const locStr = [
    loc.bookPage && `原书${loc.bookPage}页`,
    loc.pdfPage && `PDF${loc.pdfPage}页`,
    loc.volume,
    loc.folio && `第${loc.folio}叶`,
  ].filter(Boolean).join(' · ');

  return `
    <div class="evidence-item ${et.class}">
      <span class="evidence-type-icon">${et.icon}</span>
      <div class="evidence-content">
        <div>${escapeHtml(ev.statement || '')}</div>
        ${ev.quote ? `<div style="font-style:italic;color:var(--text-secondary);margin-top:4px;font-size:12px">"${escapeHtml(ev.quote)}"</div>` : ''}
        <div class="evidence-source">
          ${ref ? `<a onclick="window.showDetail('${ref.id}')" style="color:var(--primary);cursor:pointer">${escapeHtml(ref.title)}</a>` : ''}
          ${locStr ? ` · 📍 ${escapeHtml(locStr)}` : ''}
          ${ev.isFromSecondaryCitation ? ' · ⚠️ 转引' : ''}
          ${ev.isVerified ? ' · ✅ 已核对' : ' · ❓ 未核对'}
          <span class="evidence-strength ${es.class}">${es.label}</span>
        </div>
        <div class="note-actions">
          <button onclick="event.stopPropagation();window.acadEditEvidence('${ev.id}')">编辑</button>
          <button onclick="event.stopPropagation();window.acadDeleteEvidence('${ev.id}')">删除</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- 论点表单 ---------- */
export function renderClaimForm(container, existing = null, presetProjId = null) {
  const claim = existing || createClaim({ projectId: presetProjId });
  const { projects } = getState();

  container.innerHTML = `
    <div class="modal show" id="claimModal">
      <div class="modal-overlay" onclick="window.acadCloseClaimModal()"></div>
      <div class="modal-content" style="max-width:650px;max-height:85vh;overflow-y:auto">
        <div class="modal-header">
          <h3>${existing ? '编辑论点' : '新建论点'}</h3>
          <button class="modal-close" onclick="window.acadCloseClaimModal()">×</button>
        </div>
        <div class="modal-body" style="padding:20px">
          <div class="note-form-group">
            <label>论点标题</label>
            <input type="text" id="claimTitle" value="${escapeHtml(claim.title)}" placeholder="如：圣迹图的制作与官方儒学推广密切相关">
          </div>
          <div class="note-form-group">
            <label>论点陈述</label>
            <textarea id="claimStatement" rows="4" placeholder="详细描述你的论点...">${escapeHtml(claim.statement || '')}</textarea>
          </div>
          <div class="note-form-group">
            <label>所属项目</label>
            <select id="claimProject">
              <option value="">-- 不关联 --</option>
              ${projects.map(p =>
                `<option value="${p.id}" ${claim.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.title)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="location-grid">
            <div class="note-form-group">
              <label>论点状态</label>
              <select id="claimStatus">
                ${Object.entries(CLAIM_STATUS).map(([k, v]) =>
                  `<option value="${k}" ${claim.status === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="note-form-group">
              <label>信心指数 (0-1)</label>
              <input type="number" id="claimConfidence" value="${claim.confidence || 0}" min="0" max="1" step="0.1">
            </div>
            <div class="note-form-group">
              <label>范围</label>
              <input type="text" id="claimScope" value="${escapeHtml(claim.scope || '')}" placeholder="如：明代中期">
            </div>
            <div class="note-form-group">
              <label>年代</label>
              <input type="text" id="claimChronology" value="${escapeHtml(claim.chronology || '')}" placeholder="如：嘉靖年间">
            </div>
          </div>
          <div class="note-form-group">
            <label>前人观点</label>
            <textarea id="claimPrevScholar" rows="3" placeholder="前人对该问题的观点...">${escapeHtml(claim.previousScholarship || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-secondary" onclick="window.acadCloseClaimModal()">取消</button>
          <button class="btn btn-primary" onclick="window.acadSaveClaim('${claim.id}', ${existing ? 'true' : 'false'})">保存</button>
        </div>
      </div>
    </div>
  `;
}

export async function saveClaim(id, isExisting) {
  const data = {
    id,
    title: document.getElementById('claimTitle').value.trim(),
    statement: document.getElementById('claimStatement').value.trim(),
    projectId: document.getElementById('claimProject').value || null,
    status: document.getElementById('claimStatus').value,
    confidence: parseFloat(document.getElementById('claimConfidence').value) || 0,
    scope: document.getElementById('claimScope').value.trim(),
    chronology: document.getElementById('claimChronology').value.trim(),
    previousScholarship: document.getElementById('claimPrevScholar').value.trim(),
  };

  if (!data.title) {
    alert('请填写论点标题');
    return;
  }

  if (isExisting) {
    const existing = await claimGetById(id);
    if (existing) {
      Object.assign(existing, data);
      existing.updatedAt = new Date().toISOString();
      existing.revision = (existing.revision || 1) + 1;
      await claimPut(existing);
    }
  } else {
    const claim = createClaim(data);
    await claimPut(claim);
  }

  await refreshClaims();
  window.acadCloseClaimModal();
  window.acadNav('claims');
}

export async function deleteClaim(id) {
  if (!confirm('确定删除此论点？相关证据将保留但失去关联。')) return;
  await claimDelete(id);
  await refreshClaims();
  window.acadNav('claims');
}

/* ---------- 证据表单 ---------- */
export function renderEvidenceForm(container, claimId, existing = null, defaultType = 'directSupport') {
  const ev = existing || createEvidence({ claimId, relationType: defaultType });
  const { refs } = getState();
  const { claims } = getState();
  const claim = claims.find(c => c.id === claimId);

  container.innerHTML = `
    <div class="modal show" id="evidenceModal">
      <div class="modal-overlay" onclick="window.acadCloseEvidenceModal()"></div>
      <div class="modal-content" style="max-width:600px;max-height:85vh;overflow-y:auto">
        <div class="modal-header">
          <h3>${existing ? '编辑证据' : '添加证据'}</h3>
          ${claim ? `<span style="font-size:13px;color:var(--text-muted)">论点: ${escapeHtml(claim.title)}</span>` : ''}
          <button class="modal-close" onclick="window.acadCloseEvidenceModal()">×</button>
        </div>
        <div class="modal-body" style="padding:20px">
          <div class="note-form-group">
            <label>证据类型</label>
            <select id="evType">
              ${Object.entries(EVIDENCE_TYPES).map(([k, v]) =>
                `<option value="${k}" ${ev.relationType === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="note-form-group">
            <label>关联文献</label>
            <select id="evRefId">
              <option value="">-- 不关联 --</option>
              ${refs.filter(r => !r.deletedAt).map(r =>
                `<option value="${r.id}" ${ev.referenceId === r.id ? 'selected' : ''}>${escapeHtml(r.title || '无标题')}</option>`
              ).join('')}
            </select>
          </div>
          <div class="note-form-group">
            <label>证据陈述</label>
            <textarea id="evStatement" rows="3" placeholder="描述该证据如何支持或反对论点...">${escapeHtml(ev.statement || '')}</textarea>
          </div>
          <div class="note-form-group">
            <label>原文引文</label>
            <textarea id="evQuote" rows="3" placeholder="摘录原文...">${escapeHtml(ev.quote || '')}</textarea>
          </div>
          <div class="location-grid">
            <div class="note-form-group">
              <label>原书页码</label>
              <input type="text" id="evBookPage" value="${escapeHtml(ev.location?.bookPage || '')}" placeholder="如：126">
            </div>
            <div class="note-form-group">
              <label>PDF 页码</label>
              <input type="text" id="evPdfPage" value="${escapeHtml(ev.location?.pdfPage || '')}" placeholder="如：138">
            </div>
            <div class="note-form-group">
              <label>卷次</label>
              <input type="text" id="evVolume" value="${escapeHtml(ev.location?.volume || '')}" placeholder="如：卷三">
            </div>
            <div class="note-form-group">
              <label>叶码</label>
              <input type="text" id="evFolio" value="${escapeHtml(ev.location?.folio || '')}" placeholder="如：十八">
            </div>
          </div>
          <div class="location-grid">
            <div class="note-form-group">
              <label>证据强度</label>
              <select id="evStrength">
                ${Object.entries(EVIDENCE_STRENGTH).map(([k, v]) =>
                  `<option value="${k}" ${ev.strength === k ? 'selected' : ''}>${v.label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="note-form-group">
              <label>用于章节</label>
              <input type="text" id="evChapter" value="${escapeHtml(ev.chapterTarget || '')}" placeholder="如：第三章">
            </div>
          </div>
          <div class="note-form-group">
            <label>
              <input type="checkbox" id="evSecondary" ${ev.isFromSecondaryCitation ? 'checked' : ''} style="width:auto;margin-right:8px">
              此证据来自转引（未核对原件）
            </label>
          </div>
          <div class="note-form-group">
            <label>用户判断</label>
            <textarea id="evJudgment" rows="2" placeholder="对该证据的个人判断...">${escapeHtml(ev.userJudgment || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-secondary" onclick="window.acadCloseEvidenceModal()">取消</button>
          <button class="btn btn-primary" onclick="window.acadSaveEvidence('${ev.id}', '${claimId}', ${existing ? 'true' : 'false'})">保存</button>
        </div>
      </div>
    </div>
  `;
}

export async function saveEvidence(id, claimId, isExisting) {
  const data = {
    id,
    claimId,
    relationType: document.getElementById('evType').value,
    referenceId: document.getElementById('evRefId').value || null,
    statement: document.getElementById('evStatement').value.trim(),
    quote: document.getElementById('evQuote').value.trim(),
    location: {
      bookPage: document.getElementById('evBookPage').value.trim() || null,
      pdfPage: document.getElementById('evPdfPage').value.trim() || null,
      volume: document.getElementById('evVolume').value.trim() || null,
      folio: document.getElementById('evFolio').value.trim() || null,
    },
    strength: document.getElementById('evStrength').value,
    chapterTarget: document.getElementById('evChapter').value.trim(),
    isFromSecondaryCitation: document.getElementById('evSecondary').checked,
    userJudgment: document.getElementById('evJudgment').value.trim(),
    isVerified: !document.getElementById('evSecondary').checked,
  };

  if (isExisting) {
    const existing = getState().evidence.find(e => e.id === id);
    if (existing) {
      Object.assign(existing, data);
      existing.updatedAt = new Date().toISOString();
      existing.revision = (existing.revision || 1) + 1;
      await evidencePut(existing);
    }
  } else {
    const ev = createEvidence(data);
    await evidencePut(ev);
  }

  await refreshEvidence();
  window.acadCloseEvidenceModal();
  window.acadOpenClaim(claimId);
}

export async function deleteEvidence(id) {
  if (!confirm('确定删除此证据？')) return;
  await evidenceDelete(id);
  await refreshEvidence();
  // 刷新当前论点详情
  const { currentClaimId } = getState();
  if (currentClaimId) window.acadOpenClaim(currentClaimId);
}

/* ---------- 论点-证据矩阵 ---------- */
export async function renderMatrix(container, projectId) {
  const claims = projectId ? await claimGetByProject(projectId) : await claimGetAll();
  const allEvidence = await evidenceGetAll();

  const claimsWithEv = claims.map(c => {
    const ev = allEvidence.filter(e => e.claimId === c.id);
    return {
      ...c,
      supportCount: ev.filter(e => ['directSupport', 'indirectSupport'].includes(e.relationType)).length,
      opposeCount: ev.filter(e => ['opposing', 'contradictory'].includes(e.relationType)).length,
      indirectCount: ev.filter(e => ['limiting', 'background', 'priorScholarship', 'methodological', 'toVerify', 'reference'].includes(e.relationType)).length,
      totalCount: ev.length,
      hasSecondaryOnly: ev.every(e => e.isFromSecondaryCitation) && ev.length > 0,
      hasUnverified: ev.some(e => !e.isVerified),
    };
  });

  const sufficient = claimsWithEv.filter(c => c.supportCount >= 2 && c.opposeCount === 0);
  const weakClaims = claimsWithEv.filter(c => c.supportCount <= 1);
  const disputed = claimsWithEv.filter(c => c.opposeCount > 0);
  const secondaryOnly = claimsWithEv.filter(c => c.hasSecondaryOnly);

  let html = `
    <div style="margin-bottom:12px">
      <button class="btn btn-secondary" onclick="window.acadNav('claims')">← 返回论点列表</button>
      ${projectId ? `<button class="btn btn-secondary" onclick="window.acadOpenProject('${projectId}')" style="margin-left:8px">← 返回项目</button>` : ''}
    </div>
    <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">📊 论点—证据矩阵</h2>
  `;

  // 汇总统计
  html += `
    <div class="matrix-summary">
      <div class="matrix-stat"><div class="num">${claims.length}</div><div class="label">总论点</div></div>
      <div class="matrix-stat"><div class="num" style="color:#16a34a">${sufficient.length}</div><div class="label">证据充分</div></div>
      <div class="matrix-stat"><div class="num" style="color:#d97706">${weakClaims.length}</div><div class="label">证据不足</div></div>
      <div class="matrix-stat"><div class="num" style="color:#dc2626">${disputed.length}</div><div class="label">存在反面</div></div>
      <div class="matrix-stat"><div class="num" style="color:#dc2626">${secondaryOnly.length}</div><div class="label">仅转引</div></div>
    </div>
  `;

  if (claims.length === 0) {
    html += '<div class="dash-empty">尚无论点</div>';
  } else {
    html += `
      <table class="matrix-table">
        <thead>
          <tr>
            <th>论点</th>
            <th>状态</th>
            <th>✅ 支持</th>
            <th>❌ 反对</th>
            <th>↗️ 间接</th>
            <th>总计</th>
            <th>风险提示</th>
          </tr>
        </thead>
        <tbody>
          ${claimsWithEv.map(c => {
            const st = CLAIM_STATUS[c.status] || CLAIM_STATUS.idea;
            const risks = [];
            if (c.supportCount <= 1) risks.push('单一材料');
            if (c.opposeCount > 0) risks.push('存在反证');
            if (c.hasSecondaryOnly) risks.push('仅转引');
            if (c.hasUnverified) risks.push('未核对');
            if (c.totalCount === 0) risks.push('无证据');

            return `
              <tr onclick="window.acadOpenClaim('${c.id}')" style="cursor:pointer">
                <td class="matrix-claim-cell">${escapeHtml(c.title)}</td>
                <td><span class="claim-status-badge ${st.class}" style="font-size:10px">${st.label}</span></td>
                <td class="matrix-support">${c.supportCount || '—'}</td>
                <td class="matrix-oppose">${c.opposeCount || '—'}</td>
                <td class="matrix-indirect">${c.indirectCount || '—'}</td>
                <td style="text-align:center;font-weight:700">${c.totalCount}</td>
                <td style="font-size:11px;color:var(--danger)">${risks.join('、')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  container.innerHTML = html;
}

/* ---------- 导出项目为 Markdown ---------- */
export async function exportProjectMarkdown(projectId) {
  const proj = await projectGetById(projectId);
  if (!proj) return;

  const claims = await claimGetByProject(projectId);
  const allEvidence = await evidenceGetAll();
  const { refs } = getState();
  const projRefs = refs.filter(r => (proj.references || []).includes(r.id));

  let md = `# ${proj.title}\n\n`;
  if (proj.description) md += `> ${proj.description}\n\n`;
  if (proj.scope) md += `**研究范围**: ${proj.scope}\n\n`;
  if (proj.chronology) md += `**年代范围**: ${proj.chronology}\n\n`;

  // 研究问题
  if (proj.researchQuestions && proj.researchQuestions.length > 0) {
    md += `## 研究问题\n\n`;
    proj.researchQuestions.forEach(q => {
      md += `- ${q.text}\n`;
    });
    md += '\n';
  }

  // 假说
  if (proj.hypotheses && proj.hypotheses.length > 0) {
    md += `## 当前假说\n\n`;
    proj.hypotheses.forEach(h => {
      md += `- ${typeof h === 'string' ? h : h.text}\n`;
    });
    md += '\n';
  }

  // 论点与证据
  if (claims.length > 0) {
    md += `## 论点与证据\n\n`;
    for (const claim of claims) {
      const st = CLAIM_STATUS[claim.status] || CLAIM_STATUS.idea;
      md += `### ${claim.title}\n\n`;
      md += `**状态**: ${st.label}\n\n`;
      if (claim.statement) md += `${claim.statement}\n\n`;

      const ev = allEvidence.filter(e => e.claimId === claim.id);
      const supporting = ev.filter(e => ['directSupport', 'indirectSupport'].includes(e.relationType));
      const opposing = ev.filter(e => ['opposing', 'contradictory'].includes(e.relationType));

      if (supporting.length > 0) {
        md += `#### 支持证据\n\n`;
        supporting.forEach(e => {
          const ref = refs.find(r => r.id === e.referenceId);
          md += `- ${e.statement || ''}`;
          if (ref) md += `（${ref.title}）`;
          if (e.quote) md += `\n  > ${e.quote}`;
          md += '\n';
        });
        md += '\n';
      }

      if (opposing.length > 0) {
        md += `#### 反面证据\n\n`;
        opposing.forEach(e => {
          const ref = refs.find(r => r.id === e.referenceId);
          md += `- ${e.statement || ''}`;
          if (ref) md += `（${ref.title}）`;
          if (e.quote) md += `\n  > ${e.quote}`;
          md += '\n';
        });
        md += '\n';
      }
    }
  }

  // 相关书目
  if (projRefs.length > 0) {
    md += `## 相关书目\n\n`;
    projRefs.forEach(r => {
      md += `- ${r.authors || ''}，《${r.title || ''}》`;
      if (r.journal) md += `，${r.journal}`;
      if (r.year) md += `，${r.year}`;
      if (r.volume) md += `，第${r.volume}卷`;
      if (r.issue) md += `第${r.issue}期`;
      if (r.pages) md += `，第${r.pages}页`;
      md += '\n';
    });
    md += '\n';
  }

  // 待解决问题
  if (proj.openQuestions && proj.openQuestions.length > 0) {
    md += `## 待解决问题\n\n`;
    proj.openQuestions.forEach(q => {
      md += `- ${typeof q === 'string' ? q : q.text}\n`;
    });
    md += '\n';
  }

  // 下载
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${proj.title.replace(/[<>:"/\\|?*]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
