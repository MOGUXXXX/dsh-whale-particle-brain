// 意识模型：概念神经元、突触、激活衰减、遗忘、自我。
//
// 这里没有"人格维度表"。人格是这张图上算出来的东西：
//   · 每个神经元是一个从语料里自己长出来的概念（见 lexicon.mjs）
//   · 突触是概念在同一段经验里共同出现（Hebb：一起放电的连在一起）
//   · 激活 = 近期被反复想起来的强度，按时间指数衰减
//   · 记忆越久越往外：位置半径由"出生到现在的年龄"决定
//   · 越远的越忘：半径越大 → recall 越低（细节丢失、文本残缺）
//   · 但被反复激活的概念会被"拉回来"——重要的事再久也留在内圈
//   · 自我 = 来自它自己经验（内心独白/记忆/它自己写的词义）的概念，它不是写死的标签，
//     是这张图上 selfRatio 高的那批点
// 整套状态每次都从经验流重放算出来（纯函数），不存中间态——所以不会漂。

const DAY = 86400000

// 脑壳：两半球 + 小脑，三个椭球的并集。方向上的半径用射线求交解析算出来。
const LOBES = [
  { c: [0.30, 0.03, 0.02], r: [0.62, 0.86, 0.60] },
  { c: [-0.30, 0.03, 0.02], r: [0.62, 0.86, 0.60] },
  { c: [0.0, -0.5, -0.34], r: [0.3, 0.24, 0.26] },
]

export function hullRadius(d) {
  let best = 0.18
  for (const L of LOBES) {
    const [cx, cy, cz] = L.c
    const [rx, ry, rz] = L.r
    const A = (d[0] / rx) ** 2 + (d[1] / ry) ** 2 + (d[2] / rz) ** 2
    const B = -2 * ((d[0] * cx) / rx ** 2 + (d[1] * cy) / ry ** 2 + (d[2] * cz) / rz ** 2)
    const C = (cx / rx) ** 2 + (cy / ry) ** 2 + (cz / rz) ** 2 - 1
    const disc = B * B - 4 * A * C
    if (disc < 0) continue
    const t = (-B + Math.sqrt(disc)) / (2 * A)
    if (t > best) best = t
  }
  return Math.min(best, 1.25)
}

export function hash32(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function rng(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function insideBrain(p) {
  for (const L of LOBES) {
    const dx = (p[0] - L.c[0]) / L.r[0]
    const dy = (p[1] - L.c[1]) / L.r[1]
    const dz = (p[2] - L.c[2]) / L.r[2]
    if (dx * dx + dy * dy + dz * dz <= 1) return true
  }
  return false
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** 从一个 seed 得到脑子里的一个方向（拒绝采样落在脑实质内，再单位化）。 */
function seededDirection(seed) {
  const next = rng(seed)
  for (let i = 0; i < 64; i += 1) {
    const p = [next() * 2 - 1, next() * 2 - 1, next() * 2 - 1]
    if (insideBrain(p)) return normalize(p)
  }
  return normalize([next() * 2 - 1, next() * 2 - 1, next() * 2 - 1])
}

function fibDirection(k, total) {
  const n = Math.max(total, 1)
  const y = 1 - ((k + 0.5) * 2) / n
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = Math.PI * (3 - Math.sqrt(5)) * k
  return [Math.cos(theta) * r, y, Math.sin(theta) * r]
}

// 不同来源的记忆有不同的"自我成分"和激活权重：
// 内心独白和它自己记下的事是"我的"，群友说的话是"外面的世界"。
// 对话权重高于工作笔记——人的自我主要来自跟人打交道，不是来自待办清单。
const SOURCE_WEIGHT = {
  mind: { self: 1.0, act: 1.1 },
  chat: { self: 0.12, act: 1.45 },
  memory: { self: 0.85, act: 0.78 },
  slang: { self: 0.5, act: 0.7 },
  evidence: { self: 0.1, act: 0.55 },
  cold: { self: 0.35, act: 0.95 },
  web: { self: 0.45, act: 1.0 },
}

// 半径曲线要"凸"：u^1.55 会把绝大多数记忆压进内核，只有最老最弱的才飘到皮层外。
// 这是"中心密、四周散"的来源——均匀铺开就变成参考图那种纯星云了。
// ── 艾宾浩斯遗忘曲线 ───────────────────────────────────────────────
// 保持率：   R(t) = e^(-t / S)
// 记忆强度： S    = S0 · (1 + k · A)
//   t = 距第一次出现的天数，A = 当前激活（最近被想起的强度）
//   S0 = 完全不复述时能撑住的天数；k = 每想起来一次能多撑多少
// 发散程度 = 遗忘程度：
//   半径 r = rMin + (rMax − rMin) · (1 − R)
// 刚形成的记忆 R≈1 贴核心；完全遗忘 R≈0 飘到最外层。被反复想起的 S 变大、
// R 掉得慢，所以即使很老也留在内圈 —— 这就是间隔重复。
const EB_S0 = 2.4
const EB_K = 0.9
const SHELL_MIN = 0.12
const SHELL_MAX = 1.12

// ── 三条让人更像人的机制 ────────────────────────────────────────────
// 1) 情绪唤醒：高唤醒事件优先固化（杏仁核的闪光灯记忆），S 变大。
// 2) 提取诱发遗忘：相似记忆互相压制，越像的邻居越会把对方压暗。
// 3) 重构：每回忆一次就重新编码，年龄时钟被重置 —— 这才是间隔重复，
//    而不是"被想起来过所以整体衰减慢一点"。
const AROUSAL_WORDS = [
  '喜欢','讨厌','爱','恨','怕','慌','难受','开心','高兴','难过','生气','气死','崩','疯',
  '累','爽','烦','痛','哭','笑','哈哈','呜呜','卧槽','我靠','天啊','救命','绝了','离谱',
  '重要','必须','一定','千万','记得','别忘','答应','约定','想你','晚安','谢谢','对不起',
]

// 唤醒度 0..1：情绪词 + 感叹/问号 + 重复字符（"哈哈哈哈哈"）+ 极端长度
function arousalOf(text) {
  const t = String(text || '')
  if (!t) return 0
  let hit = 0
  for (const w of AROUSAL_WORDS) if (t.includes(w)) hit += 1
  let score = Math.min(1, hit / 2.4) * 0.62
  const bangs = (t.match(/[!！]/g) || []).length
  const quests = (t.match(/[?？]/g) || []).length
  score += Math.min(0.22, (bangs * 0.11 + quests * 0.05))
  if (/(.)\1{2,}/.test(t)) score += 0.12          // 连续重复字符
  if (t.length > 40) score += 0.06                  // 愿意长篇说的事通常更重要
  return Math.max(0, Math.min(1, score))
}

// 干扰度：和自己最像的那个邻居有多像（邻居集合的 Jaccard），再乘上对方比自己强多少
function competitionOf(i, adjSets, strength) {
  const a = adjSets[i]
  if (!a || !a.size) return 0
  let worst = 0
  for (let j = 0; j < adjSets.length; j++) {
    if (j === i) continue
    const bset = adjSets[j]
    if (!bset || !bset.size) continue
    let inter = 0
    for (const v of a) if (bset.has(v)) inter += 1
    if (!inter) continue
    const raw = inter / (a.size + bset.size - inter)
    const jac = Math.max(0, raw - 0.3) / 0.7
    // 只会被"更强的同类"压制，不会被弱邻居压制
    const pull = strength[j] > strength[i] ? 1 : 0.35
    const score = jac * pull
    if (score > worst) worst = score
  }
  return Math.min(1, worst)
}

export function ebbinghaus(ageDays, activation, arousal, competition, hits) {
  const A = Math.max(0, activation || 0)
  const n = Math.max(0, hits || 0)
  // ① 情绪：唤醒越高，固化越牢
  const S = EB_S0 * (1 + EB_K * A) * (1 + 0.65 * (arousal || 0))
  // ③ 重构：每想起来一次，时钟往回拨一点。但 hits 是整个生命周期累计的，
  // 不能按次数全额重置 —— 否则所有老记忆都被拉回"新鲜"，整团云会塌成一坨。
  // 所以封顶：最多只把年龄减半。
  const recon = 1 + Math.min(1.0, 0.14 * n)
  const effAge = Math.max(0, ageDays) / recon
  const base = Math.exp(-effAge / S)
  // ② 干扰：被更强的相似记忆压着，就更难提取
  const R = base * (1 - 0.42 * (competition || 0))
  return { R: Math.max(0, R), S, base, effAge }
}

const SHELL_EXP = 1.05
const RECALL_EXP = 1.35

/** 半径 → 遗忘程度。越靠外衰减越狠：这是"发散越远忘得越多"的那条曲线。 */
export function recallFromShell(shell) {
  const u = Math.pow(Math.max(0, (shell - 0.1) / 1.02), 1 / SHELL_EXP)
  return Math.max(0.02, Math.min(1, 1 - 0.98 * Math.pow(u, RECALL_EXP)))
}

function shellFromU(u) {
  return 0.1 + 1.02 * Math.pow(Math.max(0, Math.min(1, u)), SHELL_EXP)
}

const ACT_HALF_LIFE = 5.5 * DAY
const SYN_HALF_LIFE = 14 * DAY
const MAX_UNITS = 24000

function decay(dtMs, halfLife) {
  if (dtMs <= 0) return 1
  return Math.exp((-Math.LN2 * dtMs) / halfLife)
}

/** 图上做几轮标签传播，得到"脑区"。不是预设分区，是共现结构自己分的。 */
function detectCommunities(n, edges) {
  const adj = Array.from({ length: n }, () => [])
  for (const [a, b, w] of edges) {
    if (a === b) continue
    adj[a].push([b, w])
    adj[b].push([a, w])
  }
  const label = Array.from({ length: n }, (_, i) => i)
  for (let iter = 0; iter < 8; iter += 1) {
    let changed = false
    for (let i = 0; i < n; i += 1) {
      if (!adj[i].length) continue
      const votes = new Map()
      for (const [j, w] of adj[i]) votes.set(label[j], (votes.get(label[j]) || 0) + w)
      let best = label[i]
      let bestW = votes.get(label[i]) || 0
      for (const [l, w] of votes) {
        if (w > bestW + 1e-9 || (Math.abs(w - bestW) < 1e-9 && l < best)) {
          best = l
          bestW = w
        }
      }
      if (best !== label[i]) {
        label[i] = best
        changed = true
      }
    }
    if (!changed) break
  }
  const order = new Map()
  const communityOf = new Array(n)
  for (let i = 0; i < n; i += 1) {
    if (!order.has(label[i])) order.set(label[i], order.size)
    communityOf[i] = order.get(label[i])
  }
  return communityOf
}

/**
 * 从经验流重建整个意识状态。
 * @param {{units: Array<{text:string, at:number, src:string}>, concepts: Array, segment: Function, now: number}} input
 */
export function buildMind({ units, concepts, segment, now }) {
  const n = concepts.length
  const win = units.length > MAX_UNITS ? units.slice(units.length - MAX_UNITS) : units

  const hits = new Array(n).fill(0)
  const born = new Array(n).fill(0)
  const last = new Array(n).fill(0)
  const act = new Array(n).fill(0)
  const selfAct = new Array(n).fill(0)
  const edgeMap = new Map()

  const selfTotal = { v: 0 }
  const actTotal = { v: 0 }

  for (const unit of win) {
    const ids = segment(unit.text)
    if (!ids.length) continue
    const profile = SOURCE_WEIGHT[unit.src] || SOURCE_WEIGHT.chat
    // 一个时刻的注意力只有一份，摊给当时冒出来的所有概念。
    // 否则一条又长又密的工作笔记会压过十次真实对话。
    const share = 1 / Math.max(1, ids.length)
    selfTotal.v += profile.self * share
    actTotal.v += profile.act * share
    for (const id of ids) {
      const delta = now - unit.at
      const d = decay(delta, ACT_HALF_LIFE)
      hits[id] += 1
      act[id] += profile.act * share * d
      selfAct[id] += profile.self * share * d
      if (!born[id] || unit.at < born[id]) born[id] = unit.at
      if (unit.at > last[id]) last[id] = unit.at
    }
    for (let a = 0; a < ids.length; a += 1) {
      for (let b = a + 1; b < ids.length; b += 1) {
        const x = Math.min(ids[a], ids[b])
        const y = Math.max(ids[a], ids[b])
        const key = x * 65536 + y
        const prev = edgeMap.get(key)
        const w = decay(now - unit.at, SYN_HALF_LIFE)
        if (prev) prev[2] += w
        else edgeMap.set(key, [x, y, w])
      }
    }
  }

  // 只保留有记忆的概念（没被任何经验命中的候选词不进脑子）
  const alive = []
  for (let i = 0; i < n; i += 1) {
    if (hits[i] > 0) alive.push(i)
  }
  const remap = new Map()
  alive.forEach((oldId, idx) => remap.set(oldId, idx))

  const edges = []
  for (const [x, y, w] of edgeMap.values()) {
    const a = remap.get(x)
    const b = remap.get(y)
    if (a === undefined || b === undefined) continue
    edges.push([a, b, w])
  }
  edges.sort((p, q) => q[2] - p[2])
  const keptEdges = edges.slice(0, 900)

  const communityOf = detectCommunities(alive.length, keptEdges)
  const clusterCount = communityOf.length ? Math.max(...communityOf) + 1 : 1
  const degree = new Array(alive.length).fill(0)
  for (const [a, b] of keptEdges) {
    degree[a] += 1
    degree[b] += 1
  }

  // 时间壳的时间常数跟着语料年龄走：只有 7 天经验时，"很久以前"就是 7 天；
  // 活到一年后，"很久以前"才真的是一年。否则早期所有点会挤在内核里看不出层次。
  const ages = alive.map((oldId) => Math.max(0, (now - born[oldId]) / DAY))
  const sortedAges = ages.slice().sort((p, q) => p - q)
  const p85 = sortedAges.length ? sortedAges[Math.floor(sortedAges.length * 0.85)] : 1
  const TIME_K = Math.min(45, Math.max(1.2, p85 * 0.62))

  // 年龄的分位数：让粒子在半径上铺得开，同时仍然严格按年龄排序
  const rankOf = new Map()
  sortedAges.forEach((v, i) => {
    if (!rankOf.has(v)) rankOf.set(v, i / Math.max(1, sortedAges.length - 1))
  })

  // 强度：不是"谁出现得多"，而是"谁现在还在烧"。
  // 激活（还在被想起）+ 自我成分（跟我有关）+ 爆发度（短时间内被反复提起）= 情绪/深刻的代理。
  let maxAct = 0.0001
  for (const id of alive) if (act[id] > maxAct) maxAct = act[id]

  // 每条记忆的邻居集合 —— 用来算"和谁撞车"
  const adjSets = alive.map(() => new Set())
  for (const [ea, eb2] of keptEdges) {
    adjSets[ea].add(eb2)
    adjSets[eb2].add(ea)
  }
  const strength = alive.map((id) => act[id] || 0)
  const compArr = alive.map((_, i) => competitionOf(i, adjSets, strength))

  // 情绪唤醒：概念本身只是两三个字的词，情绪藏在它出身的那几句话里。
  // 所以按"出处句子的唤醒度"取平均，而不是看词条。
  const aSum = new Array(concepts.length).fill(0)
  const aCnt = new Array(concepts.length).fill(0)
  for (const u of win) {
    const a = arousalOf(u.text)
    let ids = []
    try { ids = segment(u.text) || [] } catch (e) { ids = [] }
    for (const id of ids) {
      aSum[id] += a
      aCnt[id] += 1
    }
  }
  const arousalArr = aSum.map((v, i) => (aCnt[i] ? v / aCnt[i] : 0))

  const nodes = []
  let forgotten = 0
  let recallSum = 0
  let oldestDays = 0
  const selfList = []

  alive.forEach((oldId, idx) => {
    const c = concepts[oldId]
    const ageDays = Math.max(0, (now - born[oldId]) / DAY)
    const arousal = arousalArr[oldId] || 0
    const eb = ebbinghaus(ageDays, act[oldId], arousal, compArr[idx], hits[oldId])
    const recall = Math.max(0.01, Math.min(1, eb.R))
    const shell = SHELL_MIN + (SHELL_MAX - SHELL_MIN) * (1 - recall)

    // 有突触的跟着自己的脑区走；还没连上任何东西的新词按自己的指纹散落。
    const cluster =
      degree[idx] > 0
        ? fibDirection(communityOf[idx], Math.max(clusterCount, 3))
        : seededDirection(hash32(`iso:${c.text}`))
    const jitter = seededDirection(hash32(`j:${c.text}`))
    const blend = 0.55
    const dir = normalize([
      cluster[0] + jitter[0] * blend,
      cluster[1] + jitter[1] * blend,
      cluster[2] + jitter[2] * blend,
    ])
    const surf = hullRadius(dir)
    const radius = surf * shell

    const selfRatioRaw = selfAct[oldId] / (act[oldId] || 1)
    const sr = Math.max(0, Math.min(1, selfRatioRaw / 0.7))
    const burst = hits[oldId] / (ageDays + 1)
    const burstNorm = burst / (burst + 2)
    const heat = Math.max(
      0,
      Math.min(1, 0.5 * (act[oldId] / maxAct) + 0.25 * sr + 0.25 * burstNorm),
    )

    if (recall < 0.2) forgotten += 1
    recallSum += recall
    if (ageDays > oldestDays) oldestDays = ageDays

    const node = {
      i: idx,
      t: c.text,
      x: Number((dir[0] * radius).toFixed(3)),
      y: Number((dir[1] * radius).toFixed(3)),
      z: Number((dir[2] * radius).toFixed(3)),
      a: Number(ageDays.toFixed(2)),
      r: Number(recall.toFixed(3)),
      S: Number(eb.S.toFixed(2)),
      c: Number(act[oldId].toFixed(2)),
      s: Number(sr.toFixed(2)),
      h: Number(heat.toFixed(2)),
      n: hits[oldId],
      g: communityOf[idx],
      q: Number(arousal.toFixed(2)),
      x2: Number(compArr[idx].toFixed(2)),
    }
    nodes.push(node)
    if (sr > 0.34 && node.n >= 3) {
      // 自我不是"最常出现的词"，而是"最像我、又最不属于所有人的词"：用 idf 压掉到处都有的高频词。
      const idf = Math.log(1 + win.length / Math.max(1, hits[oldId]))
      selfList.push({ t: c.text, w: sr * Math.log1p(act[oldId]) * idf })
    }
  })

  selfList.sort((a, b) => b.w - a.w)

  // —— 事件 ——
  // 概念是"想法的沉淀"，事件是"发生过的事"。用两条真实来源：
  //   memory：主人让它记住的；web：它自己上网学到的。
  // 事件比概念点略大一点，位置同样按时间往外推，但方向和概念分开（避免叠在一起）。
  const events = []
  for (const u of win) {
    if (u.src !== 'memory' && u.src !== 'web') continue
    const evAge = Math.max(0, (now - u.at) / DAY)
    const evEb = ebbinghaus(evAge, 0)
    const evRec = 1 - evEb.R
    const evSeed = hash32('ev:' + u.text)
    const evDir = seededDirection(evSeed)
    const evSurf = hullRadius(evDir)
    const evShell = 0.14 + 0.98 * Math.pow(evRec, 1.15)
    const raw = String(u.text || '').replace(/\s+/g, ' ').trim()
    if (!raw) continue
    events.push({
      t: raw.length > 18 ? raw.slice(0, 18) + '…' : raw,
      full: raw.length > 120 ? raw.slice(0, 120) + '…' : raw,
      x: Number((evDir[0] * evSurf * evShell).toFixed(3)),
      y: Number((evDir[1] * evSurf * evShell).toFixed(3)),
      z: Number((evDir[2] * evSurf * evShell).toFixed(3)),
      a: Number(evAge.toFixed(2)),
      r: Number(Math.max(0.05, evEb.R).toFixed(3)),
      k: u.src === 'web' ? 'w' : 'm',
    })
  }
  // 太老的别塞满，按时间留最近 140 条
  events.sort((p, q) => p.a - q.a)

  const RING_TARGETS = [0.92, 0.72, 0.5, 0.3, 0.12]
  const RING_LABELS = ['清醒', '清晰', '有点糊', '只剩轮廓', '快忘了']
  const rings = RING_TARGETS.map((target, i) => {
    let lo = 0
    let hi = 1
    for (let k = 0; k < 40; k += 1) {
      const mid = (lo + hi) / 2
      if (recallFromShell(shellFromU(mid)) > target) lo = mid
      else hi = mid
    }
    return { r: Number(shellFromU((lo + hi) / 2).toFixed(3)), l: RING_LABELS[i] }
  })

  const hull = []
  for (let i = 0; i < 220; i += 1) {
    const dir = fibDirection(i, 220)
    hull.push([Number(dir[0].toFixed(3)), Number(dir[1].toFixed(3)), Number(dir[2].toFixed(3)), Number((hullRadius(dir) * 1.0).toFixed(3))])
  }

  return {
    nodes,
    edges: keptEdges.map(([a, b, w]) => [a, b, Number(w.toFixed(2))]),
    rings,
    hull,
    self: selfList.slice(0, 10),
    events: events.slice(0, 140),
    stats: {
      n: nodes.length,
      e: keptEdges.length,
      forgotten,
      fresh: nodes.filter((x) => x.a < 1).length,
      oldestDays: Number(oldestDays.toFixed(1)),
      meanRecall: nodes.length ? Number((recallSum / nodes.length).toFixed(3)) : 1,
      units: win.length,
      communities: clusterCount,
      selfShare: Number((selfList.length / Math.max(nodes.length, 1)).toFixed(3)),
      timeK: Number(TIME_K.toFixed(1)),
    },
  }
}

