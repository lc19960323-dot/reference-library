/**
 * js/database/db.js
 *
 * IndexedDB v2 - 学术工作台数据库层
 *
 * 多 store 架构 + schema 版本管理 + 软删除 + 回收站
 *
 * Stores:
 *  - references: 文献记录 (v1 兼容 + 新字段)
 *  - projects: 研究项目
 *  - notes: 结构化笔记与摘录
 *  - claims: 论点卡片
 *  - evidence: 证据卡片
 *  - recycleBin: 回收站 (软删除记录)
 *  - meta: 元数据 (schemaVersion, 最后备份时间等)
 */

const DB_NAME = 'RefLib';
const DB_VERSION = 2;

const STORES = {
  REFERENCES: 'references',
  PROJECTS: 'projects',
  NOTES: 'notes',
  CLAIMS: 'claims',
  EVIDENCE: 'evidence',
  RECYCLE: 'recycleBin',
  META: 'meta',
};

let _db = null;
let _useFallback = false;

/* ---------- ID 生成 ---------- */
export function generateId(prefix = 'rec') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/* ---------- 统一元数据 ---------- */
export function addMetadata(record) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    createdAt: record.createdAt || record.created_at || now,
    updatedAt: now,
    deletedAt: null,
    revision: record.revision || 1,
    ...record,
  };
}

/* ---------- 数据库初始化与迁移 ---------- */
export async function initDatabase() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      console.warn('IndexedDB open failed, using fallback', e);
      _useFallback = true;
      resolve(null);
      return;
    }

    req.onupgradeneeded = (event) => {
      const database = event.target.result;
      const oldVersion = event.oldVersion;

      // v1 -> v2: 保留 references store，添加新 stores
      if (!database.objectStoreNames.contains(STORES.REFERENCES)) {
        const store = database.createObjectStore(STORES.REFERENCES, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('year', 'year', { unique: false });
        store.createIndex('recordType', 'recordType', { unique: false });
        store.createIndex('deletedAt', 'deletedAt', { unique: false });
      }

      // 添加新 stores
      if (!database.objectStoreNames.contains(STORES.PROJECTS)) {
        const store = database.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.NOTES)) {
        const store = database.createObjectStore(STORES.NOTES, { keyPath: 'id' });
        store.createIndex('referenceId', 'referenceId', { unique: false });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.CLAIMS)) {
        const store = database.createObjectStore(STORES.CLAIMS, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.EVIDENCE)) {
        const store = database.createObjectStore(STORES.EVIDENCE, { keyPath: 'id' });
        store.createIndex('claimId', 'claimId', { unique: false });
        store.createIndex('referenceId', 'referenceId', { unique: false });
        store.createIndex('relationType', 'relationType', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.RECYCLE)) {
        database.createObjectStore(STORES.RECYCLE, { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains(STORES.META)) {
        database.createObjectStore(STORES.META, { keyPath: 'key' });
      }

      // 迁移 v1 数据：为现有记录添加统一元数据
      if (oldVersion < 2 && database.objectStoreNames.contains(STORES.REFERENCES)) {
        const tx = event.target.transaction;
        try {
          const store = tx.objectStore(STORES.REFERENCES);
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const record = cursor.value;
              // 添加缺失的统一元数据
              if (!record.schemaVersion) record.schemaVersion = 2;
              if (!record.createdAt) record.createdAt = record.created_at || new Date().toISOString();
              if (!record.updatedAt) record.updatedAt = record.updated_at || record.createdAt;
              if (!record.deletedAt) record.deletedAt = null;
              if (!record.revision) record.revision = 1;
              // 添加 workflow 字段
              if (!record.workflow) {
                record.workflow = {
                  readingStatus: 'inbox',
                  priority: 0,
                  plannedDate: null,
                  actualReadTime: null,
                  lastReadPosition: null,
                };
              }
              // 添加新容器字段
              if (!record.projects) record.projects = [];
              if (!record.notes) record.notes = [];
              if (!record.claims) record.claims = [];
              if (!record.relations) record.relations = [];
              if (!record.attachments) record.attachments = [];
              if (!record.provenance) record.provenance = {};
              if (!record._aiSuggestions) record._aiSuggestions = [];
              cursor.update(record);
              cursor.continue();
            }
          };
        } catch (migrateErr) {
          console.error('Migration error:', migrateErr);
        }
      }

      // 写入 schema 版本到 meta store
      if (database.objectStoreNames.contains(STORES.META)) {
        const tx = event.target.transaction;
        const metaStore = tx.objectStore(STORES.META);
        metaStore.put({ key: 'schemaVersion', value: DB_VERSION });
        metaStore.put({ key: 'lastMigration', value: new Date().toISOString() });
      }
    };

    req.onsuccess = (event) => {
      _db = event.target.result;
      console.log(`[DB] IndexedDB opened: ${DB_NAME} v${DB_VERSION}`);
      resolve(_db);
    };

    req.onerror = (event) => {
      console.warn('IndexedDB error, falling back to localStorage', event.target.error);
      _useFallback = true;
      resolve(null);
    };

    req.onblocked = () => {
      console.warn('IndexedDB blocked, falling back to localStorage');
      _useFallback = true;
      resolve(null);
    };
  });
}

/* ---------- 通用 CRUD ---------- */
function _tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function _request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- References ---------- */
export async function refGetAll(includeDeleted = false) {
  if (_useFallback) return _fallbackGetAll();
  const store = _tx(STORES.REFERENCES);
  const all = await _request(store.getAll());
  return includeDeleted ? all : all.filter(r => !r.deletedAt);
}

export async function refGetById(id) {
  if (_useFallback) return _fallbackGetAll().find(r => r.id === id) || null;
  const store = _tx(STORES.REFERENCES);
  return _request(store.get(id));
}

export async function refPut(record) {
  const data = addMetadata(record);
  data.updatedAt = new Date().toISOString();
  if (_useFallback) { _fallbackSave(data); return data; }
  const store = _tx(STORES.REFERENCES, 'readwrite');
  await _request(store.put(data));
  return data;
}

export async function refAdd(record) {
  const data = addMetadata(record);
  if (_useFallback) { _fallbackSave(data); return data; }
  const store = _tx(STORES.REFERENCES, 'readwrite');
  await _request(store.add(data));
  return data;
}

export async function refSoftDelete(id) {
  if (_useFallback) {
    const all = _fallbackGetAll();
    const idx = all.findIndex(r => r.id === id);
    if (idx >= 0) {
      all[idx].deletedAt = new Date().toISOString();
      all[idx].updatedAt = new Date().toISOString();
      all[idx].revision = (all[idx].revision || 1) + 1;
      _fallbackSaveAll(all);
    }
    return;
  }
  const store = _tx(STORES.REFERENCES, 'readwrite');
  const record = await _request(store.get(id));
  if (record) {
    record.deletedAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    record.revision = (record.revision || 1) + 1;
    // 同时写入回收站
    const recycleStore = _tx(STORES.RECYCLE, 'readwrite');
    await _request(recycleStore.put({ ...record, _originalStore: STORES.REFERENCES }));
    await _request(store.put(record));
  }
}

export async function refRestore(id) {
  if (_useFallback) {
    const all = _fallbackGetAll();
    const idx = all.findIndex(r => r.id === id);
    if (idx >= 0) {
      all[idx].deletedAt = null;
      all[idx].updatedAt = new Date().toISOString();
      all[idx].revision = (all[idx].revision || 1) + 1;
      _fallbackSaveAll(all);
    }
    return;
  }
  const store = _tx(STORES.REFERENCES, 'readwrite');
  const record = await _request(store.get(id));
  if (record) {
    record.deletedAt = null;
    record.updatedAt = new Date().toISOString();
    record.revision = (record.revision || 1) + 1;
    await _request(store.put(record));
    // 从回收站移除
    const recycleStore = _tx(STORES.RECYCLE, 'readwrite');
    await _request(recycleStore.delete(id));
  }
}

export async function refHardDelete(id) {
  if (_useFallback) {
    _fallbackSaveAll(_fallbackGetAll().filter(r => r.id !== id));
    return;
  }
  const store = _tx(STORES.REFERENCES, 'readwrite');
  await _request(store.delete(id));
  const recycleStore = _tx(STORES.RECYCLE, 'readwrite');
  await _request(recycleStore.delete(id));
}

/* ---------- Recycle Bin ---------- */
export async function recycleGetAll() {
  if (_useFallback) return _fallbackGetAll().filter(r => r.deletedAt);
  const store = _tx(STORES.RECYCLE);
  return _request(store.getAll());
}

export async function recycleClear() {
  if (_useFallback) {
    _fallbackSaveAll(_fallbackGetAll().filter(r => !r.deletedAt));
    return;
  }
  const recycleStore = _tx(STORES.RECYCLE, 'readwrite');
  await _request(recycleStore.clear());
  // 同时物理删除 references 中 deletedAt 不为空的记录
  const refStore = _tx(STORES.REFERENCES, 'readwrite');
  const all = await _request(refStore.getAll());
  for (const r of all) {
    if (r.deletedAt) await _request(refStore.delete(r.id));
  }
}

/* ---------- Projects ---------- */
export async function projectGetAll() {
  if (_useFallback) return _fallbackGetStore('projects');
  const store = _tx(STORES.PROJECTS);
  return _request(store.getAll());
}

export async function projectGetById(id) {
  if (_useFallback) return _fallbackGetStore('projects').find(p => p.id === id) || null;
  const store = _tx(STORES.PROJECTS);
  return _request(store.get(id));
}

export async function projectPut(record) {
  const data = addMetadata(record);
  if (_useFallback) { _fallbackPutStore('projects', data); return data; }
  const store = _tx(STORES.PROJECTS, 'readwrite');
  await _request(store.put(data));
  return data;
}

export async function projectDelete(id) {
  if (_useFallback) { _fallbackDeleteStore('projects', id); return; }
  const store = _tx(STORES.PROJECTS, 'readwrite');
  await _request(store.delete(id));
}

/* ---------- Notes ---------- */
export async function noteGetAll() {
  if (_useFallback) return _fallbackGetStore('notes');
  const store = _tx(STORES.NOTES);
  return _request(store.getAll());
}

export async function noteGetByReference(refId) {
  if (_useFallback) return _fallbackGetStore('notes').filter(n => n.referenceId === refId);
  const store = _tx(STORES.NOTES);
  const index = store.index('referenceId');
  return _request(index.getAll(refId));
}

export async function noteGetByProject(projId) {
  if (_useFallback) return _fallbackGetStore('notes').filter(n => n.projectId === projId);
  const store = _tx(STORES.NOTES);
  const index = store.index('projectId');
  return _request(index.getAll(projId));
}

export async function notePut(record) {
  const data = addMetadata(record);
  if (_useFallback) { _fallbackPutStore('notes', data); return data; }
  const store = _tx(STORES.NOTES, 'readwrite');
  await _request(store.put(data));
  return data;
}

export async function noteDelete(id) {
  if (_useFallback) { _fallbackDeleteStore('notes', id); return; }
  const store = _tx(STORES.NOTES, 'readwrite');
  await _request(store.delete(id));
}

/* ---------- Claims ---------- */
export async function claimGetAll() {
  if (_useFallback) return _fallbackGetStore('claims');
  const store = _tx(STORES.CLAIMS);
  return _request(store.getAll());
}

export async function claimGetById(id) {
  if (_useFallback) return _fallbackGetStore('claims').find(c => c.id === id) || null;
  const store = _tx(STORES.CLAIMS);
  return _request(store.get(id));
}

export async function claimGetByProject(projId) {
  if (_useFallback) return _fallbackGetStore('claims').filter(c => c.projectId === projId);
  const store = _tx(STORES.CLAIMS);
  const index = store.index('projectId');
  return _request(index.getAll(projId));
}

export async function claimPut(record) {
  const data = addMetadata(record);
  if (_useFallback) { _fallbackPutStore('claims', data); return data; }
  const store = _tx(STORES.CLAIMS, 'readwrite');
  await _request(store.put(data));
  return data;
}

export async function claimDelete(id) {
  if (_useFallback) { _fallbackDeleteStore('claims', id); return; }
  const store = _tx(STORES.CLAIMS, 'readwrite');
  await _request(store.delete(id));
}

/* ---------- Evidence ---------- */
export async function evidenceGetAll() {
  if (_useFallback) return _fallbackGetStore('evidence');
  const store = _tx(STORES.EVIDENCE);
  return _request(store.getAll());
}

export async function evidenceGetByClaim(claimId) {
  if (_useFallback) return _fallbackGetStore('evidence').filter(e => e.claimId === claimId);
  const store = _tx(STORES.EVIDENCE);
  const index = store.index('claimId');
  return _request(index.getAll(claimId));
}

export async function evidencePut(record) {
  const data = addMetadata(record);
  if (_useFallback) { _fallbackPutStore('evidence', data); return data; }
  const store = _tx(STORES.EVIDENCE, 'readwrite');
  await _request(store.put(data));
  return data;
}

export async function evidenceDelete(id) {
  if (_useFallback) { _fallbackDeleteStore('evidence', id); return; }
  const store = _tx(STORES.EVIDENCE, 'readwrite');
  await _request(store.delete(id));
}

/* ---------- Backup & Restore ---------- */
export async function exportAllData() {
  const [refs, projects, notes, claims, evidence, recycle] = await Promise.all([
    refGetAll(true),
    projectGetAll(),
    noteGetAll(),
    claimGetAll(),
    evidenceGetAll(),
    recycleGetAll(),
  ]);

  return {
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores: {
      references: refs,
      projects,
      notes,
      claims,
      evidence,
      recycleBin: recycle,
    },
    counts: {
      references: refs.length,
      projects: projects.length,
      notes: notes.length,
      claims: claims.length,
      evidence: evidence.length,
    },
  };
}

export async function importAllData(data, mode = 'merge') {
  if (!data || !data.stores) throw new Error('Invalid backup format');

  const result = { added: 0, updated: 0, skipped: 0 };

  for (const [storeName, records] of Object.entries(data.stores)) {
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      try {
        if (storeName === STORES.REFERENCES) {
          if (mode === 'replace') {
            await refPut(record);
            result.updated++;
          } else {
            const existing = await refGetById(record.id);
            if (existing) {
              if (new Date(record.updatedAt) > new Date(existing.updatedAt || existing.updated_at || 0)) {
                await refPut(record);
                result.updated++;
              } else {
                result.skipped++;
              }
            } else {
              await refAdd(record);
              result.added++;
            }
          }
        } else if (storeName === STORES.PROJECTS) {
          await projectPut(record);
          result.updated++;
        } else if (storeName === STORES.NOTES) {
          await notePut(record);
          result.updated++;
        } else if (storeName === STORES.CLAIMS) {
          await claimPut(record);
          result.updated++;
        } else if (storeName === STORES.EVIDENCE) {
          await evidencePut(record);
          result.updated++;
        } else if (storeName === STORES.RECYCLE) {
          // Skip recycle bin on import
        }
      } catch (e) {
        console.error('Import error for record:', record.id, e);
        result.skipped++;
      }
    }
  }

  return result;
}

export async function clearAllData() {
  for (const storeName of Object.values(STORES)) {
    if (_useFallback) {
      _fallbackClearStore(storeName === STORES.REFERENCES ? 'references' : storeName);
      continue;
    }
    const store = _tx(storeName, 'readwrite');
    await _request(store.clear());
  }
}

export function isUsingFallback() { return _useFallback; }
export function getDBVersion() { return DB_VERSION; }
export { STORES };

/* ---------- localStorage Fallback ---------- */
function _lsKey(store) { return `reflib_${store}`; }

function _fallbackGetAll() {
  try { return JSON.parse(localStorage.getItem(_lsKey('references')) || '[]'); }
  catch { return []; }
}

function _fallbackSaveAll(refs) {
  try { localStorage.setItem(_lsKey('references'), JSON.stringify(refs)); }
  catch(e) { console.error('Fallback save failed', e); }
}

function _fallbackSave(record) {
  const all = _fallbackGetAll();
  const idx = all.findIndex(r => r.id === record.id);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  _fallbackSaveAll(all);
}

function _fallbackGetStore(store) {
  try { return JSON.parse(localStorage.getItem(_lsKey(store)) || '[]'); }
  catch { return []; }
}

function _fallbackPutStore(store, record) {
  const all = _fallbackGetStore(store);
  const idx = all.findIndex(r => r.id === record.id);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  try { localStorage.setItem(_lsKey(store), JSON.stringify(all)); }
  catch(e) { console.error(`Fallback save for ${store} failed`, e); }
}

function _fallbackDeleteStore(store, id) {
  const all = _fallbackGetStore(store).filter(r => r.id !== id);
  try { localStorage.setItem(_lsKey(store), JSON.stringify(all)); }
  catch(e) { console.error(`Fallback delete for ${store} failed`, e); }
}

function _fallbackClearStore(store) {
  try { localStorage.removeItem(_lsKey(store)); }
  catch(e) { console.error(`Fallback clear for ${store} failed`, e); }
}

/* ---------- 旧版兼容桥接 ---------- */
// 旧代码使用 dbAdd / dbPut / dbDelete / dbGetAll / dbClear
// 这些函数仍由 index.html 内联脚本定义，这里不做覆盖
// 新模块通过 import 使用新的 API
