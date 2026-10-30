// 两个自我：私聊的我、群聊的我。同一副语料按来源天然分流，各自长各自的概念图。
import fs from 'node:fs'
import path from 'node:path'

import { collectExperiences, fingerprint } from './sources.mjs'
import { discoverConcepts } from './lexicon.mjs'
import { buildMind } from './mind.mjs'
import { curiosityCycle, feedCycle } from './learn.mjs'
import { normalizeSelf, decide, feel, external, moodLine, tick } from './self.mjs'
import { loadStore, saveStore } from './store.mjs'

export const BRANCHES = [
  { id: 'private', label: '私聊的我', sub: '只对主人' },
  { id: 'group', label: '群聊的我', sub: '群里那副样子' },
]

const LEARN_INTERVAL_MS = 45 * 60 * 1000
const REBUILD_MS = 5 * 60 * 1000

function optsFor(n) {
  if (n < 220) return { maxConcepts: 150, minFreq: 2, minCohesion: 5 }
  if (n < 600) return { maxConcepts: 240, minFreq: 2, minCohesion: 6 }
  return { maxConcepts: 320, minFreq: 3, minCohesion: 7 }
}

/** 群成员真名/绰号：这些人名不拿去外面搜。 */
function readMemberNames(stateDir) {
  const names = new Set(['主人', '小鲸鱼', '大肥鱼', '肥鱼', '鲸鱼', 'MOGU'])
  try {
    const md = fs.readFileSync(path.join(stateDir, 'members.md'), 'utf8')
    for (const m of md.matchAll(/\*\*(.+?)\*\*/g)) {
      const n = m[1].trim()
      if (n.length >= 2 && n.length <= 6) names.add(n)
    }
  } catch {
    /* 没有名单也能跑，只是少一层保护 */
  }
  return names
}

export function createEngine({ stateDir, dataDir, log = () => {} }) {
  const store = loadStore(dataDir)
  const names = readMemberNames(stateDir)
  let cache = null
  let lastFp = ''
  let lastBuiltAt = 0
  let rev = 0
  let minds = {}

  function buildBranch(branch, units, now, discoveredMap) {
    const mine = units.filter((u) => u.ch === branch.id)
    const texts = mine.map((u) => u.text)
    const { concepts, index, segment } = discoverConcepts(texts, optsFor(mine.length))

    // 学到的词也进词典：它认得这个词，但只有真的在经历里出现过才会长成神经元。
    let extra = 0
    for (const w of discoveredMap) {
      if (index.has(w)) continue
      const id = concepts.length
      concepts.push({ i: id, text: w, freq: 0, score: 0 })
      index.set(w, id)
      extra += 1
    }

    const newestUnit = mine[mine.length - 1]
    if (newestUnit) store.lastActivity = { at: newestUnit.at, ch: newestUnit.ch || 'group' }

    const mind = buildMind({ units: mine, concepts, segment, now })
    const learnedCount = store.learned.filter((x) => x.ch === branch.id).length

    return {
      id: branch.id,
      label: branch.label,
      sub: branch.sub,
      nodes: mind.nodes,
      events: mind.events,
      edges: mind.edges,
      self: mind.self,
      hull: mind.hull,
      rings: mind.rings,
      stats: {
        ...mind.stats,
        units: mine.length,
        dictionary: discoveredMap.size,
        concepts: concepts.length - extra,
        known: extra,
        learned: learnedCount,
      },
      me: (() => {
        const s2 = normalizeSelf(store.self)
        return {
          mood: s2.mood,
          interest: s2.interest,
          line: moodLine(s2),
          last: s2.lastKind || '',
          diary: (s2.diary || []).slice(-6),
          cooldown: s2.cooldown,
        }
      })(),
      feed: mind.nodes
        .slice()
        .sort((a, b) => a.a - b.a)
        .slice(0, 7)
        .map((n) => ({ t: n.t, a: n.a, c: n.c })),
    }
  }

  function rebuild(force = false) {
    const fp = fingerprint(stateDir)
    const stale = Date.now() - lastBuiltAt > REBUILD_MS
    if (!force && cache && fp === lastFp && !stale) return cache

    const startedAt = Date.now()
    lastFp = fp
    lastBuiltAt = startedAt
    rev += 1

    const now = Date.now()
    let units = collectExperiences(stateDir, store.learned)

    // 把此刻的心情写给桥接：私聊注入用。只写一个很小的文件，桥接按 mtime 缓存。
    try {
      const s2 = normalizeSelf(store.self)
      fs.writeFileSync(
        path.join(stateDir, 'whale-mood.json'),
        JSON.stringify({
          at: now,
          line: moodLine(s2),
          mood: s2.mood,
          interest: s2.interest,
          last: s2.lastKind || '',
          diary: (s2.diary || []).slice(-1),
        }),
      )
    } catch {
      // 写不了就算了，不影响大脑
    }
    
    // 黑话词表（认得但未必长进脑子）
    const words = new Set()
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(stateDir, 'slang.json'), 'utf8'))
      if (Array.isArray(raw)) {
        for (const s of raw) {
          if (!s || !s.content) continue
          if (s.status && s.status !== 'confirmed') continue
          if (s.content.length >= 2) words.add(s.content)
        }
      }
    } catch {
      /* noop */
    }

    minds = {}
    const branches = {}
    for (const branch of BRANCHES) {
      const t0 = Date.now()
      branches[branch.id] = buildBranch(branch, units, now, words)
      minds[branch.id] = branches[branch.id]
      log(`branch ${branch.id}: ${branches[branch.id].nodes.length} neurons in ${Date.now() - t0}ms`)
    }

    cache = {
      v: rev,
      at: now,
      ms: Date.now() - startedAt,
      hull: null,
      branches,
      learn: {
        enabled: store.autoLearn,
        everyMs: store.learnEveryMs || LEARN_INTERVAL_MS,
        branches: Object.fromEntries(
          BRANCHES.map((b) => {
            const st = store.learnState[b.id] || {}
            return [b.id, { nextAt: st.nextAt || 0, last: st.last || null, turns: st.turns || 0 }]
          }),
        ),
      },
    }
    return cache
  }

  async function learnNow(branchId, web) {
    if (!web) return { ok: false, msg: '宿主没有联网服务' }
    const branch = minds[branchId]
    if (!branch || !branch.nodes.length) return { ok: false, msg: '这个自我还没长出可查的东西' }
    const st = store.learnState[branchId] || { history: [] }
    st.turns = st.turns || 0

    // ── 这一步由它自己决定 ──
    // 先看此刻的心情，再由兴趣权重 + 心情调制挑一件事做；做完这件事又反过来改它。
    store.self = normalizeSelf(store.self)
    const nowMs = Date.now()
    // 外面发生过什么，也算进心情
    if (store.lastActivity) {
      const gapMin = (nowMs - store.lastActivity.at) / 60000
      if (gapMin < 8) external(store.self, { kind: store.lastActivity.ch, now: nowMs })
      else if (gapMin > 90) external(store.self, { kind: 'silence', now: nowMs })
    }
    tick(store.self, nowMs)
    const kind = decide(store.self, nowMs)

    let out
    if (kind === 'idle') {
      out = { ok: false, added: 0, kind: 'idle', msg: '什么也没干，发了会儿呆' }
    } else if (kind === 'curiosity') {
      out = await curiosityCycle({
        web,
        nodes: branch.nodes,
        names,
        branchId,
        branchState: st,
        store,
      })
    } else {
      out = await feedCycle({ store, branchId, kind })
    }
    feel(store.self, { kind, ok: !!out.ok, gained: out.added || 0, now: nowMs })
    try {
      const s3 = normalizeSelf(store.self)
      fs.writeFileSync(path.join(stateDir, 'whale-mood.json'), JSON.stringify({ at: Date.now(), line: moodLine(s3), mood: s3.mood, interest: s3.interest, last: s3.lastKind, diary: (s3.diary || []).slice(-1) }))
    } catch {}
    try {
      const s3 = normalizeSelf(store.self)
      fs.writeFileSync(path.join(stateDir, 'whale-mood.json'), JSON.stringify({ at: Date.now(), line: moodLine(s3), mood: s3.mood, interest: s3.interest, last: s3.lastKind || '', diary: (s3.diary || []).slice(-1) }))
    } catch {}

    st.turns += 1
    st.lastAt = Date.now()
    st.last = {
      at: st.lastAt,
      topic: out.topic || '',
      query: out.query || '',
      added: out.added || 0,
      ok: !!out.ok,
      msg: out.msg || '',
    }
    st.history = [...(st.history || []), { at: st.lastAt, q: out.query || out.topic || '', n: out.added || 0 }].slice(-24)
    st.nextAt = Date.now() + (store.learnEveryMs || LEARN_INTERVAL_MS)

    if (out.added) {
      // 学到的东西改动了经验流，下一帧重建
      saveStore(dataDir, store)
      cache = null
      lastFp = ''
      rev += 1
    }
    store.learnState[branchId] = st
    saveStore(dataDir, store)
    return out
  }

  function setAuto(on) {
    store.autoLearn = !!on
    if (on) {
      for (const b of BRANCHES) {
        const st = store.learnState[b.id] || {}
        st.nextAt = Math.min(st.nextAt || 0, Date.now() + 60 * 1000)
        store.learnState[b.id] = st
      }
    }
    saveStore(dataDir, store)
    cache = null
    rev += 1
    return store.autoLearn
  }

  function dueBranches(now) {
    if (!store.autoLearn) return []
    return BRANCHES.filter((b) => {
      const st = store.learnState[b.id] || {}
      return now >= (st.nextAt || 0)
    }).map((b) => b.id)
  }

  return {
    store,
    save: () => saveStore(dataDir, store),
    rebuild,
    learnNow,
    setAuto,
    dueBranches,
    names,
    get cache() {
      return cache
    },
  }
}
