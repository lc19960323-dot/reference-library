/**
 * js/models.js
 *
 * 数据模型定义与工厂函数
 * 包含: Reference, Project, Note, Claim, Evidence
 * 以及常量定义 (阅读状态、笔记类型、证据类型、论点状态)
 */

import { generateId, addMetadata } from './database/db.js';

/* ========== 常量 ========== */

export const READING_STATUS = {
  inbox: { label: '收件箱', icon: '📥', class: 'rs-inbox' },
  unverified: { label: '待核验', icon: '❓', class: 'rs-unverified' },
  tobrowse: { label: '待浏览', icon: '👁️', class: 'rs-tobrowse' },
  toread: { label: '待精读', icon: '📖', class: 'rs-toread' },
  reading: { label: '正在阅读', icon: '🔍', class: 'rs-reading' },
  browsed: { label: '已浏览', icon: '✅', class: 'rs-browsed' },
  read: { label: '已精读', icon: '✓', class: 'rs-read' },
  excerpted: { label: '已摘录', icon: '📝', class: 'rs-excerpted' },
  writing: { label: '已进入写作', icon: '✍️', class: 'rs-writing' },
  cited: { label: '已引用', icon: '📑', class: 'rs-cited' },
  skipped: { label: '暂不采用', icon: '⏭️', class: 'rs-skipped' },
  recheck: { label: '需要复查', icon: '🔄', class: 'rs-recheck' },
};

export const NOTE_TYPES = {
  summary: { label: '内容摘要', icon: '📋' },
  excerpt: { label: '原文摘录', icon: '📄' },
  judgment: { label: '个人判断', icon: '💭' },
  sourceValue: { label: '史料价值', icon: '⚖️' },
  methodReview: { label: '方法评论', icon: '🔬' },
  quotableClaim: { label: '可引用论点', icon: '💬' },
  counterEvidence: { label: '反面证据', icon: '⚠️' },
  toVerify: { label: '待核查事项', icon: '🔍' },
  relation: { label: '与其他文献关系', icon: '🔗' },
  writingTarget: { label: '写作去向', icon: '✍️' },
  versionNote: { label: '版本说明', icon: '📚' },
  imageNote: { label: '图像说明', icon: '🖼️' },
};

export const EVIDENCE_TYPES = {
  directSupport: { label: '直接支持', icon: '✅', class: 'evidence-supporting' },
  indirectSupport: { label: '间接支持', icon: '↗️', class: 'evidence-indirect' },
  limiting: { label: '限制条件', icon: '⚠️', class: 'evidence-indirect' },
  opposing: { label: '反面证据', icon: '❌', class: 'evidence-opposing' },
  contradictory: { label: '矛盾证据', icon: '⚡', class: 'evidence-opposing' },
  background: { label: '背景证据', icon: '📐', class: 'evidence-background' },
  priorScholarship: { label: '前人观点', icon: '📚', class: 'evidence-background' },
  methodological: { label: '方法依据', icon: '🔬', class: 'evidence-indirect' },
  toVerify: { label: '待核实', icon: '❓', class: 'evidence-indirect' },
  reference: { label: '仅供参考', icon: '📋', class: 'evidence-background' },
};

export const EVIDENCE_STRENGTH = {
  strong: { label: '强', class: 'es-strong' },
  medium: { label: '中', class: 'es-medium' },
  weak: { label: '弱', class: 'es-weak' },
};

export const CLAIM_STATUS = {
  idea: { label: '初步想法', icon: '💡', class: 'cs-idea' },
  arguing: { label: '正在论证', icon: '📝', class: 'cs-arguing' },
  insufficient: { label: '证据不足', icon: '⚠️', class: 'cs-insufficient' },
  disputed: { label: '存在争议', icon: '⚡', class: 'cs-disputed' },
  established: { label: '基本成立', icon: '✅', class: 'cs-established' },
  written: { label: '已写入章节', icon: '✍️', class: 'cs-written' },
  abandoned: { label: '已放弃', icon: '🚫', class: 'cs-abandoned' },
  recheck: { label: '需要复查', icon: '🔄', class: 'cs-recheck' },
};

export const PROJECT_STATUS = {
  planning: '规划中',
  active: '进行中',
  paused: '暂停',
  completed: '已完成',
  archived: '归档',
};

/* ========== 扩展类型标签 (路线图要求) ========== */
export const EXTENDED_TYPE_LABELS = {
  article: '学术论文', book: '书籍专著', webpage: '网页资源',
  ancient: '古籍', image: '图像', table: '表格',
  bookChapter: '书章', thesis: '学位论文', conferencePaper: '会议论文',
  review: '书评', newspaperArticle: '报纸文章', databaseEntry: '数据库条目',
  manuscript: '手稿', archiveFile: '档案', imperialEdict: '诏令',
  memorial: '奏疏', localGazetteer: '方志', genealogy: '族谱',
  catalogue: '目录', map: '地图', dataset: '数据集', other: '其他',
};

export const EXTENDED_TYPE_ICONS = {
  article: '📝', book: '📖', webpage: '🌐', ancient: '📜',
  image: '🖼️', table: '📊', bookChapter: '📑', thesis: '🎓',
  conferencePaper: '🎤', review: '📰', newspaperArticle: '📰',
  databaseEntry: '🗃️', manuscript: '✍️', archiveFile: '📂',
  imperialEdict: '📜', memorial: '📋', localGazetteer: '🗺️',
  genealogy: '📚', catalogue: '📖', map: '🗺️', dataset: '📊', other: '📄',
};

/* ========== Reference Model ========== */
export function createReference(data = {}) {
  return addMetadata({
    id: data.id || generateId('ref'),
    type: data.type || 'article',
    recordType: data.recordType || data.type || 'article',
    title: data.title || '',
    authors: data.authors || '',
    journal: data.journal || '',
    publisher: data.publisher || '',
    year: data.year || '',
    volume: data.volume || '',
    issue: data.issue || '',
    pages: data.pages || '',
    doi: data.doi || '',
    url: data.url || '',
    abstract: data.abstract || '',
    keywords: data.keywords || '',
    tags: data.tags || [],
    category: data.category || '',
    notes: data.notes || '',
    // 古籍字段
    dynasty: data.dynasty || '',
    edition: data.edition || '',
    source: data.source || '',
    medium: data.medium || '',
    size: data.size || '',
    accessDate: data.accessDate || '',
    isbn: data.isbn || '',
    website: data.website || '',
    // 图像字段
    imageData: data.imageData || null,
    // 学术工作台扩展
    workflow: data.workflow || {
      readingStatus: data.readingStatus || 'inbox',
      priority: data.priority || 0,
      plannedDate: null,
      estimatedTime: null,
      actualReadTime: null,
      startTime: null,
      finishTime: null,
      lastReadPosition: null,
    },
    projects: data.projects || [],
    collections: data.collections || [],
    relations: data.relations || [],
    attachments: data.attachments || [],
    provenance: data.provenance || {},
    _aiSuggestions: data._aiSuggestions || [],
    // 保留旧字段兼容
    created_at: data.created_at || data.createdAt,
    updated_at: data.updated_at || data.updatedAt,
  });
}

/* ========== Project Model ========== */
export function createProject(data = {}) {
  return addMetadata({
    id: data.id || generateId('proj'),
    title: data.title || '新研究项目',
    description: data.description || '',
    status: data.status || 'planning',
    researchQuestions: data.researchQuestions || [],
    hypotheses: data.hypotheses || [],
    scope: data.scope || '',
    chronology: data.chronology || '',
    entities: data.entities || [],
    references: data.references || [],
    primarySources: data.primarySources || [],
    secondarySources: data.secondarySources || [],
    claims: data.claims || [],
    openQuestions: data.openQuestions || [],
    tasks: data.tasks || [],
    chapters: data.chapters || [],
    savedSearches: data.savedSearches || [],
  });
}

export function createResearchQuestion(text = '') {
  return {
    id: generateId('rq'),
    text,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
}

export function createTask(data = {}) {
  return {
    id: generateId('task'),
    title: data.title || '',
    description: data.description || '',
    status: data.status || 'pending',
    priority: data.priority || 0,
    dueDate: data.dueDate || null,
    projectId: data.projectId || null,
    referenceId: data.referenceId || null,
    entityId: data.entityId || null,
    claimId: data.claimId || null,
    createdAt: new Date().toISOString(),
  };
}

/* ========== Note Model ========== */
export function createNote(data = {}) {
  return addMetadata({
    id: data.id || generateId('note'),
    referenceId: data.referenceId || null,
    projectId: data.projectId || null,
    type: data.type || 'excerpt',
    content: data.content || '',
    location: data.location || {
      bookPage: null,
      pdfPage: null,
      volume: null,
      folio: null,
      folioSide: null,
      chapter: null,
      paragraph: null,
      plateNumber: null,
      tableNumber: null,
      archiveNumber: null,
      imageRegion: null,
    },
    tags: data.tags || [],
    claimId: data.claimId || null,
    isVerified: data.isVerified || false,
  });
}

/* ========== Claim Model ========== */
export function createClaim(data = {}) {
  return addMetadata({
    id: data.id || generateId('claim'),
    projectId: data.projectId || null,
    title: data.title || '新论点',
    statement: data.statement || '',
    status: data.status || 'idea',
    scope: data.scope || '',
    chronology: data.chronology || '',
    supportingEvidence: data.supportingEvidence || [],
    opposingEvidence: data.opposingEvidence || [],
    indirectEvidence: data.indirectEvidence || [],
    previousScholarship: data.previousScholarship || '',
    possibleObjections: data.possibleObjections || [],
    unresolvedQuestions: data.unresolvedQuestions || [],
    chapterTargets: data.chapterTargets || [],
    confidence: data.confidence || 0,
    referenceIds: data.referenceIds || [],
  });
}

/* ========== Evidence Model ========== */
export function createEvidence(data = {}) {
  return addMetadata({
    id: data.id || generateId('ev'),
    claimId: data.claimId || null,
    referenceId: data.referenceId || null,
    noteId: data.noteId || null,
    relationType: data.relationType || 'directSupport',
    statement: data.statement || '',
    quote: data.quote || '',
    location: data.location || {
      bookPage: null,
      pdfPage: null,
      volume: null,
      folio: null,
    },
    userJudgment: data.userJudgment || '',
    isFromOriginal: data.isFromOriginal || false,
    isFromSecondaryCitation: data.isFromSecondaryCitation || false,
    strength: data.strength || 'medium',
    chapterTarget: data.chapterTarget || '',
    isVerified: data.isVerified || false,
  });
}

/* ========== 预设项目 ========== */
export const PRESET_PROJECTS = [
  {
    title: '《功同六经》',
    description: '硕士论文：明代「孔子圣迹图」的制作与传衍。研究圣迹图的版本系统、制作脉络、传衍路径及其在儒学知识史中的位置。',
    status: 'active',
    scope: '明代书籍出版与儒学知识史',
    chronology: '明代（1368-1644）',
  },
  {
    title: '「倒严」研究',
    description: '明代嘉靖年间反严嵩政治运动研究，涉及杨继盛、沈鍊等人的政治抗争及其文化影响。',
    status: 'planning',
    scope: '明代政治史',
    chronology: '嘉靖至隆庆（1522-1572）',
  },
  {
    title: '清代伪造公文案',
    description: '清代伪造公文案件的史料整理与研究。',
    status: 'planning',
    scope: '清代法制史',
    chronology: '清代（1644-1912）',
  },
  {
    title: '「代天巡狩」',
    description: '巡按御史制度与「代天巡狩」概念研究。',
    status: 'planning',
    scope: '明代制度史',
    chronology: '明代（1368-1644）',
  },
  {
    title: '《鸣凤记》',
    description: '明代戏曲《鸣凤记》研究，涉及其文本版本、政治叙事与倒严运动的文学表达。',
    status: 'planning',
    scope: '明代文学史',
    chronology: '嘉靖至万历（1522-1620）',
  },
  {
    title: '博士研究计划',
    description: '博士阶段研究规划，聚焦明代书籍出版与儒学知识史。',
    status: 'planning',
    scope: '明代书籍出版与儒学知识史',
    chronology: '明代至清初',
  },
];
