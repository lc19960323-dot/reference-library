/**
 * js/state.js
 * 集中状态管理 - 供新模块使用
 * 旧 index.html 中的全局变量 (allRefs, currentView 等) 仍由内联脚本管理
 * 新模块通过本文件统一管理新增的状态
 */

import { refGetAll, projectGetAll, noteGetAll, claimGetAll, evidenceGetAll } from './database/db.js';

const state = {
  // 当前视图
  view: 'all',
  // 数据缓存
  refs: [],
  projects: [],
  notes: [],
  claims: [],
  evidence: [],
  // 当前操作上下文
  currentProjectId: null,
  currentClaimId: null,
  currentReferenceId: null,
  currentNoteId: null,
  // 筛选
  projectFilter: null,
  // 最后一次操作（用于撤销）
  lastAction: null,
};

const listeners = new Set();

export function getState() { return state; }

export function setState(updates) {
  Object.assign(state, updates);
  notifyListeners();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error('State listener error:', e); }
  }
}

export async function refreshAllData() {
  const [refs, projects, notes, claims, evidence] = await Promise.all([
    refGetAll(),
    projectGetAll(),
    noteGetAll(),
    claimGetAll(),
    evidenceGetAll(),
  ]);
  setState({ refs, projects, notes, claims, evidence });
  return state;
}

export async function refreshRefs() {
  state.refs = await refGetAll();
  notifyListeners();
  return state.refs;
}

export async function refreshProjects() {
  state.projects = await projectGetAll();
  notifyListeners();
  return state.projects;
}

export async function refreshNotes() {
  state.notes = await noteGetAll();
  notifyListeners();
  return state.notes;
}

export async function refreshClaims() {
  state.claims = await claimGetAll();
  notifyListeners();
  return state.claims;
}

export async function refreshEvidence() {
  state.evidence = await evidenceGetAll();
  notifyListeners();
  return state.evidence;
}

// 保存最后一次操作用于撤销
export function saveLastAction(action) {
  state.lastAction = action;
}

export function getLastAction() {
  return state.lastAction;
}
