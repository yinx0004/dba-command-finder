import type { Text } from './schema';

export const LANGS = ['zh'] as const; // add 'en' when the English pages are ready
export type Lang = (typeof LANGS)[number];

/** Picks the reader's language, falling back to Chinese, which every entry has. */
export function t(text: Text | undefined, lang: Lang): string {
  if (!text) return '';
  return (text as Record<string, string | undefined>)[lang] ?? text.zh;
}

export function tList(list: { zh: string[]; en?: string[] } | undefined, lang: Lang): string[] {
  if (!list) return [];
  return (list as Record<string, string[] | undefined>)[lang] ?? list.zh;
}

export const UI = {
  zh: {
    siteName: 'DBA Command Finder',
    tagline: (s: string, t: string) => `${s} → ${t} 运维命令对照`,
    heroTitle: (s: string, t: string) => `${s} 运维命令，在 ${t} 里怎么做？`,
    heroSub: (s: string, t: string) => `输入 ${s} 命令、${t} 命令或中文关键词。每条对照都写清版本差异，没有等价命令时会明确告诉你。`,
    searchLabel: '搜索命令或关键词',
    searchPlaceholder: '例如 show processlist、锁等待、主从延迟、db.currentOp',
    tryLabel: '试试：',
    found: '找到 {n} 条', // {n} is filled in by the search box
    noResultTitle: '没有收录这条命令',
    noResultBody: '可以换个说法试试，或者',
    submitMapping: '提交一条映射',
    noResultTail: '，帮其他 DBA 少踩一次坑。',
    browse: '按类别浏览',
    popular: 'DBA 最常查的',
    count: (n: number) => `${n} 条`,
    home: '首页',
    contribute: '贡献',
    eq: { exact: '完全等价', approx: '近似', none: '无等价', missing: '未收录' },
    noEquivalent: '没有对应命令',
    allVersions: '全部版本',
    since: (v: string) => `${v}+`,
    until: (v: string) => `< ${v}`,
    deprecatedIn: (v: string) => `${v} 起已过时`,
    // Version filter. {line} is the reader's version line, {v} a version from the data; filled in the browser.
    ver: {
      mine: '我的版本',
      all: '全部版本',
      needsPatch: '需要 {v} 及以上',
      removedPatch: '{v} 起移除，之前的 {line} 版本可用',
      notYet: '{line} 上不可用（{v} 起才有）',
      removed: '{line} 上不可用（{v} 起移除）',
      noneOnLine: '{line} 上没有可用的命令',
    },
    copy: '复制',
    copied: '已复制',
    fields: '输出字段对照',
    fieldName: '含义',
    fieldNote: '说明',
    differences: '差异与注意事项',
    notWritten: '还没有收录这个数据库的写法',
    alternatives: (db: string) => `在 ${db} 里改看什么`,
    alternativesSub: '排查同一类问题时可以用的信号：',
    related: '相关',
    docs: '官方文档',
    editOnGitHub: '在 GitHub 上编辑此页',
    reportError: '报告错误',
    unverified: '尚未在真实实例上验证',
    verifiedOn: (parts: string) => `已在真实实例上验证：${parts}`,
    someSkipped: '部分命令未自动验证',
    notRunByLab: (why: string) => `未自动验证：${why}`,
    fieldFoundIn: (versions: string) => `已在 ${versions} 的实际输出里找到`,
    deprecated: '这条对照已过时',
    replacedBy: '请改看',
    notFound: '页面不存在',
    notFoundBody: '这条对照可能改名或删除了，试试搜索：',
    footerNote: '命令对照由社区维护，欢迎纠错和补充',
    langSwitch: 'EN',
    categoryEmpty: '没找到要的？',
  },
} as const;
