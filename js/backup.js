/* js/backup.js
 *
 * 目标：
 * 1. Token 只保存在当前页面内存中，不写入 localStorage/IndexedDB。
 * 2. 云端固定使用 data/library.json，不依赖本地随机 dest.id。
 * 3. 备份文件带 schemaVersion、时间、条数和 SHA-256 校验值。
 * 4. GitHub、GitLab、Gitee 使用各自的适配器。
 */

const DESTS_KEY = 'reflib_dests_v2';
const AUTO_DESTS_KEY = 'reflib_auto_dests_v2';
const HISTORY_KEY = 'reflib_backup_history_v2';
const BACKUP_FILE = 'data/library.json';
const SCHEMA_VERSION = 1;

/** Token 只存在内存中；刷新或关闭页面后自动消失。 */
const tokenVault = new Map();

function parseJsonSafely(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stripSecret(destination) {
  const { token, accessToken, ...safe } = destination || {};
  return safe;
}

/**
 * 从旧版本迁移：若 localStorage 中仍有 token，
 * 本次页面会暂时放入内存，随后立即从持久化数据中删除。
 */
export function migrateLegacyDestinations() {
  const legacyKeys = ['reflib_dests', DESTS_KEY];

  for (const key of legacyKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    const oldDestinations = parseJsonSafely(raw, []);
    if (!Array.isArray(oldDestinations)) continue;

    const cleanDestinations = oldDestinations.map(destination => {
      if (destination?.token && destination?.id) {
        tokenVault.set(destination.id, destination.token);
      }
      return {
        id: destination.id || crypto.randomUUID(),
        platform: destination.platform || 'github',
        name: destination.name || destination.platform || '备份目的地',
        repo: destination.repo || '',
        branch: destination.branch || 'main',
        filePath: destination.filePath || BACKUP_FILE,
        lastBackup: destination.lastBackup || null
      };
    });

    localStorage.setItem(
      DESTS_KEY,
      JSON.stringify(cleanDestinations.map(stripSecret))
    );

    if (key !== DESTS_KEY) localStorage.removeItem(key);
  }
}

export function getDestinations() {
  const destinations = parseJsonSafely(
    localStorage.getItem(DESTS_KEY) || '[]',
    []
  );

  return Array.isArray(destinations)
    ? destinations.map(stripSecret)
    : [];
}

export function saveDestinations(destinations) {
  const safeDestinations = (destinations || []).map(destination => ({
    id: destination.id || crypto.randomUUID(),
    platform: destination.platform,
    name: destination.name,
    repo: destination.repo,
    branch: destination.branch || 'main',
    filePath: destination.filePath || BACKUP_FILE,
    lastBackup: destination.lastBackup || null
  }));

  localStorage.setItem(DESTS_KEY, JSON.stringify(safeDestinations));
}

export function addDestination({
  platform,
  name,
  repo,
  branch = 'main',
  filePath = BACKUP_FILE,
  token
}) {
  if (!platform || !repo || !token) {
    throw new Error('平台、仓库和 Token 均不能为空');
  }

  const destinations = getDestinations();

  if (
    destinations.some(
      item => item.platform === platform && item.repo === repo
    )
  ) {
    throw new Error('该备份目的地已经存在');
  }

  const destination = {
    id: crypto.randomUUID(),
    platform,
    name: name || platform,
    repo,
    branch,
    filePath,
    lastBackup: null
  };

  destinations.push(destination);
  saveDestinations(destinations);
  tokenVault.set(destination.id, token);

  return destination;
}

export function removeDestination(destinationId) {
  saveDestinations(
    getDestinations().filter(item => item.id !== destinationId)
  );

  tokenVault.delete(destinationId);

  const autoIds = getAutoDestinationIds().filter(
    id => id !== destinationId
  );
  saveAutoDestinationIds(autoIds);
}

export function setDestinationToken(destinationId, token) {
  if (!token) {
    tokenVault.delete(destinationId);
    return;
  }
  tokenVault.set(destinationId, token);
}

export function hasDestinationToken(destinationId) {
  return tokenVault.has(destinationId);
}

function requireToken(destinationId) {
  const token = tokenVault.get(destinationId);
  if (!token) {
    throw new Error('本次会话尚未输入 Token，请先解锁此备份目的地');
  }
  return token;
}

export function getAutoDestinationIds() {
  const value = parseJsonSafely(
    localStorage.getItem(AUTO_DESTS_KEY) || '[]',
    []
  );
  return Array.isArray(value) ? value : [];
}

export function saveAutoDestinationIds(ids) {
  localStorage.setItem(
    AUTO_DESTS_KEY,
    JSON.stringify(Array.from(new Set(ids || [])))
  );
}

export function getBackupHistory() {
  const value = parseJsonSafely(
    localStorage.getItem(HISTORY_KEY) || '[]',
    []
  );
  return Array.isArray(value) ? value : [];
}

function addBackupHistory(destination, action, status, detail = '') {
  const history = getBackupHistory();

  history.unshift({
    destinationId: destination.id,
    destinationName: destination.name,
    platform: destination.platform,
    action,
    status,
    detail,
    time: new Date().toISOString()
  });

  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(history.slice(0, 50))
  );
}

function encodePathForGitHub(path) {
  return String(path)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    );
  }

  return btoa(binary);
}

function base64ToUtf8(base64) {
  const clean = String(base64).replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function createBackupEnvelope(references) {
  const refs = Array.isArray(references) ? references : [];
  const serializedRefs = JSON.stringify(refs);

  return {
    app: 'reference-library',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    recordCount: refs.length,
    checksumAlgorithm: 'SHA-256',
    checksum: await sha256Hex(serializedRefs),
    refs
  };
}

async function parseAndVerifyBackup(text) {
  const parsed = JSON.parse(text);

  // 兼容旧版：旧备份直接是数组。
  if (Array.isArray(parsed)) {
    return {
      app: 'reference-library',
      schemaVersion: 0,
      exportedAt: null,
      recordCount: parsed.length,
      checksumAlgorithm: null,
      checksum: null,
      refs: parsed,
      legacy: true
    };
  }

  if (!parsed || !Array.isArray(parsed.refs)) {
    throw new Error('备份文件格式不正确：缺少 refs 数组');
  }

  if (
    Number.isFinite(parsed.recordCount) &&
    parsed.recordCount !== parsed.refs.length
  ) {
    throw new Error('备份记录数校验失败');
  }

  if (parsed.checksum) {
    const actual = await sha256Hex(JSON.stringify(parsed.refs));
    if (actual !== parsed.checksum) {
      throw new Error('备份校验值不匹配，文件可能损坏或被改动');
    }
  }

  return parsed;
}

async function fetchJson(url, options = {}, allowedStatuses = []) {
  const response = await fetch(url, options);

  if (!response.ok && !allowedStatuses.includes(response.status)) {
    const raw = await response.text();
    let message = raw;

    try {
      const parsed = JSON.parse(raw);
      message =
        parsed.message ||
        parsed.error_description ||
        parsed.error ||
        raw;
    } catch {
      // 保留原始文本。
    }

    throw new Error(
      `${options.method || 'GET'} ${response.status}: ${message || response.statusText}`
    );
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function splitOwnerRepo(repo) {
  const parts = String(repo).split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new Error('GitHub/Gitee 仓库格式必须为 owner/repo');
  }
  return parts;
}

const githubAdapter = {
  async test(destination, token) {
    const [owner, repo] = splitOwnerRepo(destination.repo);
    return fetchJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
  },

  async read(destination, token) {
    const [owner, repo] = splitOwnerRepo(destination.repo);
    const path = encodePathForGitHub(
      destination.filePath || BACKUP_FILE
    );
    const branch = encodeURIComponent(destination.branch || 'main');

    const data = await fetchJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    return {
      contentBase64: data.content,
      revision: data.sha
    };
  },

  async write(destination, token, contentBase64, commitMessage) {
    const [owner, repo] = splitOwnerRepo(destination.repo);
    const path = encodePathForGitHub(
      destination.filePath || BACKUP_FILE
    );
    const branch = destination.branch || 'main';

    let existing = null;

    try {
      existing = await this.read(destination, token);
    } catch (error) {
      if (!String(error.message).includes(' 404:')) throw error;
    }

    const body = {
      message: commitMessage,
      content: contentBase64,
      branch
    };

    if (existing?.revision) body.sha = existing.revision;

    return fetchJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(body)
      }
    );
  }
};

const gitlabAdapter = {
  projectId(destination) {
    return encodeURIComponent(destination.repo);
  },

  encodedFilePath(destination) {
    return encodeURIComponent(
      destination.filePath || BACKUP_FILE
    );
  },

  async test(destination, token) {
    return fetchJson(
      `https://gitlab.com/api/v4/projects/${this.projectId(destination)}`,
      {
        headers: {
          'PRIVATE-TOKEN': token
        }
      }
    );
  },

  async read(destination, token) {
    const ref = encodeURIComponent(destination.branch || 'main');

    const data = await fetchJson(
      `https://gitlab.com/api/v4/projects/${this.projectId(destination)}/repository/files/${this.encodedFilePath(destination)}?ref=${ref}`,
      {
        headers: {
          'PRIVATE-TOKEN': token
        }
      }
    );

    return {
      contentBase64: data.content,
      revision: data.last_commit_id || data.commit_id
    };
  },

  async write(destination, token, contentBase64, commitMessage) {
    let existing = null;

    try {
      existing = await this.read(destination, token);
    } catch (error) {
      if (!String(error.message).includes(' 404:')) throw error;
    }

    const body = {
      branch: destination.branch || 'main',
      content: contentBase64,
      encoding: 'base64',
      commit_message: commitMessage
    };

    if (existing?.revision) {
      body.last_commit_id = existing.revision;
    }

    return fetchJson(
      `https://gitlab.com/api/v4/projects/${this.projectId(destination)}/repository/files/${this.encodedFilePath(destination)}`,
      {
        method: existing ? 'PUT' : 'POST',
        headers: {
          'PRIVATE-TOKEN': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );
  }
};

const giteeAdapter = {
  async test(destination, token) {
    const [owner, repo] = splitOwnerRepo(destination.repo);

    return fetchJson(
      `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/json'
        }
      }
    );
  },

  async read(destination, token) {
    const [owner, repo] = splitOwnerRepo(destination.repo);
    const path = encodePathForGitHub(
      destination.filePath || BACKUP_FILE
    );
    const branch = encodeURIComponent(destination.branch || 'master');

    const data = await fetchJson(
      `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/json'
        }
      }
    );

    return {
      contentBase64: data.content,
      revision: data.sha
    };
  },

  async write(destination, token, contentBase64, commitMessage) {
    const [owner, repo] = splitOwnerRepo(destination.repo);
    const path = encodePathForGitHub(
      destination.filePath || BACKUP_FILE
    );

    let existing = null;

    try {
      existing = await this.read(destination, token);
    } catch (error) {
      if (!String(error.message).includes(' 404:')) throw error;
    }

    const body = {
      access_token: token,
      message: commitMessage,
      content: contentBase64,
      branch: destination.branch || 'master'
    };

    if (existing?.revision) body.sha = existing.revision;

    return fetchJson(
      `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );
  }
};

function getAdapter(platform) {
  const adapters = {
    github: githubAdapter,
    gitlab: gitlabAdapter,
    gitee: giteeAdapter
  };

  const adapter = adapters[platform];
  if (!adapter) throw new Error(`不支持的备份平台：${platform}`);
  return adapter;
}

function getDestination(destinationId) {
  const destination = getDestinations().find(
    item => item.id === destinationId
  );

  if (!destination) throw new Error('备份目的地不存在');
  return destination;
}

export async function testDestination(destinationId) {
  const destination = getDestination(destinationId);
  const token = requireToken(destinationId);
  const adapter = getAdapter(destination.platform);

  return adapter.test(destination, token);
}

export async function backupToDestination(destinationId, references) {
  const destination = getDestination(destinationId);
  const token = requireToken(destinationId);
  const adapter = getAdapter(destination.platform);

  try {
    const envelope = await createBackupEnvelope(references);
    const serialized = JSON.stringify(envelope, null, 2);
    const contentBase64 = utf8ToBase64(serialized);

    await adapter.write(
      destination,
      token,
      contentBase64,
      `Backup reference library: ${envelope.recordCount} records at ${envelope.exportedAt}`
    );

    destination.lastBackup = envelope.exportedAt;

    const destinations = getDestinations().map(item =>
      item.id === destination.id ? destination : item
    );
    saveDestinations(destinations);

    addBackupHistory(
      destination,
      'backup',
      'success',
      `${envelope.recordCount} 条`
    );

    return envelope;
  } catch (error) {
    addBackupHistory(
      destination,
      'backup',
      'failed',
      error.message
    );
    throw error;
  }
}

export async function readBackupFromDestination(destinationId) {
  const destination = getDestination(destinationId);
  const token = requireToken(destinationId);
  const adapter = getAdapter(destination.platform);

  try {
    const remote = await adapter.read(destination, token);
    const decoded = base64ToUtf8(remote.contentBase64);
    const payload = await parseAndVerifyBackup(decoded);

    addBackupHistory(
      destination,
      'read',
      'success',
      `${payload.recordCount} 条`
    );

    return payload;
  } catch (error) {
    addBackupHistory(
      destination,
      'read',
      'failed',
      error.message
    );
    throw error;
  }
}

export function createRestorePlan(localRefs, incomingRefs) {
  const localById = new Map(
    (localRefs || []).map(item => [item.id, item])
  );

  const additions = [];
  const updates = [];
  const unchanged = [];
  const conflicts = [];

  for (const incoming of incomingRefs || []) {
    if (!incoming?.id) {
      conflicts.push({
        reason: 'missing-id',
        incoming
      });
      continue;
    }

    const local = localById.get(incoming.id);

    if (!local) {
      additions.push(incoming);
      continue;
    }

    const localJson = JSON.stringify(local);
    const incomingJson = JSON.stringify(incoming);

    if (localJson === incomingJson) {
      unchanged.push(incoming);
      continue;
    }

    const localUpdated = Date.parse(local.updatedAt || '');
    const incomingUpdated = Date.parse(incoming.updatedAt || '');

    if (
      Number.isFinite(localUpdated) &&
      Number.isFinite(incomingUpdated)
    ) {
      if (incomingUpdated > localUpdated) {
        updates.push(incoming);
      } else if (incomingUpdated < localUpdated) {
        unchanged.push(local);
      } else {
        conflicts.push({
          reason: 'same-time-different-content',
          local,
          incoming
        });
      }
    } else {
      conflicts.push({
        reason: 'no-reliable-updatedAt',
        local,
        incoming
      });
    }
  }

  return {
    additions,
    updates,
    unchanged,
    conflicts,
    summary: {
      add: additions.length,
      update: updates.length,
      unchanged: unchanged.length,
      conflict: conflicts.length
    }
  };
}

export async function applyRestorePlan(plan, dbAddOrUpdate) {
  if (typeof dbAddOrUpdate !== 'function') {
    throw new Error('缺少 dbAddOrUpdate 函数');
  }

  for (const item of [...plan.additions, ...plan.updates]) {
    await dbAddOrUpdate(item);
  }
}

export async function replaceAllFromBackup(
  payload,
  dbClear,
  dbAddOrUpdate
) {
  if (typeof dbClear !== 'function') {
    throw new Error('缺少 dbClear 函数');
  }

  await dbClear();

  for (const item of payload.refs) {
    await dbAddOrUpdate(item);
  }
}
