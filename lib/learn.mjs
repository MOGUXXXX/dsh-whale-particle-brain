// 好奇心：不是按固定主题列表去搜，而是"脑子里现在最响、又最没想明白的那个词"。
//
// 选词的依据全部来自这张图本身：激活高（最近总在想）、还没被搜过（不明白）、
// 不是人名（不拿群友的名字去外面搜）。搜回来的句子会作为一条新经验注入那个自我，
// 于是它可能长出新的概念、和原来的词连上——这就是"自己上网学习"在意识层的样子。
//
// 搜索本身有两路：先用 qq-bridge 自己那套 webSearch（DeepSeek → Bing 兜底，
// 和 QQ 里的 AI 同一条管线），失败再退回宿主 ctx.web。
import path from 'node:path'
import { harvest } from './feeds.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BRIDGE_ROOT = path.resolve(HERE, '..', '..', '..')

const QUERY_SHAPES = {
  private: ['{w} 是什么意思', '{w} 为什么', '{w} 有什么故事'],
  group: ['{w} 是什么梗', '{w} 出处', '{w} 为什么这么火'],
}

// 这些词尾多半只是动作的一部分（看完/安静收），拿去搜没有意义。
const WEAK_TAIL = /[完了过着的得地上下起来去后前时里]$/

let bridgeError = ''
let bridgeModulePromise = null
function loadBridgeSearch() {
  if (!bridgeModulePromise) {
    bridgeModulePromise = import(pathToFileURL(path.join(BRIDGE_ROOT, 'src', 'web-search.js')).href)
      .then((mod) => (typeof mod.webSearch === 'function' ? mod : null))
      .catch(() => null)
  }
  return bridgeModulePromise
}

function normalizeSources(list) {
  const out = []
  for (const item of list || []) {
    if (!item) continue
    const url = String(item.url || item.link || '')
    const title = String(item.title || item.name || '')
    const snippet = String(item.snippet || item.description || item.text || '')
    if (!url && !title && !snippet) continue
    out.push({ url, title, snippet })
  }
  return out
}

async function searchOnce(web, query) {
  const bridge = await loadBridgeSearch()
  if (bridge) {
    try {
      const out = await bridge.webSearch(query, { root: BRIDGE_ROOT })
      return { provider: out.provider || 'bridge', sources: normalizeSources(out.results), content: '' }
    } catch (error) {
      bridgeError = String((error && error.message) || error)
    }
  }
  if (web && typeof web.search === 'function') {
    const res = await web.search({ query, maxResults: 4 })
    return { provider: 'host', sources: normalizeSources(res.sources), content: String(res.content || '') }
  }
  throw new Error(bridgeError || '没有可用的搜索后端')
}

// ── 广撒网 ──
// 好奇心是"往自己想不通的地方钻"，feed 是"抬头看看外面在发生什么"。
// 两个都要：只钻自己的词会越来越自闭，只看外面会变成复读机。
const FEED_ROTATION = ['meme', 'thought', 'meme', 'anime']
const FEED_LABEL = {
  meme: '刷了会儿热榜',
  anime: '看了会儿日漫',
  thought: '读了几页书',
}

export async function feedCycle({ store, branchId, kind }) {
  const turn = Number(store.feedTurn) || 0
  const pick = kind || FEED_ROTATION[turn % FEED_ROTATION.length]
  let r
  try {
    r = await harvest(pick)
  } catch (error) {
    return { ok: false, kind, added: 0, msg: '没连上（' + (error?.message || error) + '）' }
  }
  const seen = new Set(store.learned.map((x) => x.text))
  const now = Date.now()
  const added = []
  for (const it of r.items) {
    const text = String(it.text || '').replace(/\s+/g, ' ').trim().slice(0, 190)
    if (text.length < 4 || seen.has(text)) continue
    seen.add(text)
    added.push({
      text,
      url: it.url || '',
      title: it.from || '',
      topic: 'feed:' + pick,
      ch: branchId,
      at: now,
      kind: pick,
    })
  }
  if (added.length) store.learned.push(...added)
  if (store.learned.length > 600) store.learned.splice(0, store.learned.length - 600)
  store.feedTurn = turn + 1
  const label = FEED_LABEL[pick] || '看了看外面'
  return {
    ok: added.length > 0,
    kind: pick,
    added: added.length,
    msg: added.length ? label + '，记下 ' + added.length + ' 条' : label + '，没什么新的',
  }
}

function recentQueries(branchState) {
  const hist = branchState?.history || []
  return new Set(hist.slice(-10).map((h) => h.q))
}

export function pickCuriosity(nodes, names, branchState) {
  const banned = recentQueries(branchState)
  const pool = nodes
    .filter((n) => n.t.length >= 2)
    .filter((n) => !WEAK_TAIL.test(n.t))
    .filter((n) => !/^\d/.test(n.t))
    .filter((n) => !names.has(n.t))
    .filter((n) => n.n >= 2)
    .filter((n) => !banned.has(n.t))
    .sort((a, b) => b.c - a.c)
    .slice(0, 14)
  if (!pool.length) return null
  const top = pool.slice(0, 7)
  const total = top.reduce((a, n) => a + Math.max(0.05, n.c), 0)
  let r = Math.random() * total
  for (const n of top) {
    r -= Math.max(0.05, n.c)
    if (r <= 0) return n
  }
  return top[0]
}

/**
 * 跑一次好奇心循环。
 * @returns {Promise<{ok:boolean, topic?:string, added?:number, msg?:string}>}
 */
export async function curiosityCycle({ web, nodes, names, branchId, branchState, store }) {
  const target = pickCuriosity(nodes, names, branchState)
  if (!target) return { ok: false, msg: '还没有哪个词在脑子里响到值得去想' }

  const shapes = QUERY_SHAPES[branchId] || QUERY_SHAPES.group
  const shapeIndex = (branchState?.turns || 0) % shapes.length
  const query = shapes[shapeIndex].replace('{w}', target.t)

  let result
  try {
    result = await searchOnce(web, query)
  } catch (error) {
    return { ok: false, topic: target.t, query, msg: `搜不到：${error?.message || error}` }
  }

  const seenUrls = new Set(store.learned.map((x) => x.url).filter(Boolean))
  const seenTexts = new Set(store.learned.map((x) => x.text))
  const now = Date.now()
  const added = []

  const content = String(result?.content || '').trim()
  if (content.length >= 16) {
    const text = content.slice(0, 200)
    if (!seenTexts.has(text)) added.push({ text, url: '', title: '', topic: target.t, ch: branchId, at: now })
  }

  for (const src of result?.sources || []) {
    const text = String(src.snippet || src.title || '').replace(/\s+/g, ' ').trim()
    if (text.length < 10) continue
    if (src.url && seenUrls.has(src.url)) continue
    const clipped = text.slice(0, 190)
    if (seenTexts.has(clipped)) continue
    seenTexts.add(clipped)
    if (src.url) seenUrls.add(src.url)
    added.push({ text: clipped, url: src.url || '', title: src.title || '', topic: target.t, ch: branchId, at: now })
    if (added.length >= 3) break
  }

  if (added.length) store.learned.push(...added)
  if (store.learned.length > 600) store.learned.splice(0, store.learned.length - 600)

  return {
    ok: added.length > 0,
    topic: target.t,
    query,
    provider: result.provider,
    added: added.length,
    msg: added.length
      ? `想明白了「${target.t}」的一点（${result.provider}）`
      : `关于「${target.t}」没找到新东西`,
  }
}
