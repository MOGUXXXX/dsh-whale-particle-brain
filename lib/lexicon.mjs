// 无监督概念发现：不预设任何"人格维度"，让词从语料里自己长出来。
//
// 办法是经典的新词发现三件套（纯本地、无模型）：
//   ① 频次——出现得够多才可能是一个概念
//   ② 左右邻字熵——真词的左右搭配很杂，噪声串的左右搭配很单调
//   ③ 内部凝固度——把词切开之后互信息会掉下来，"电影"比"电的"凝得更紧
// 打分通过后按最长匹配把经验切开，得到每个经验单元命中的概念。
//
// 之后所有"人格/性格"都不再是常量表，而是这张概念图上的统计结果。

const HAN = /[\u4e00-\u9fff]/
const HAN_ONLY = /^[\u4e00-\u9fff]+$/
const WORDY = /^[\u4e00-\u9fffa-zA-Z0-9]+$/

// 虚词/功能字：不能当概念的首尾（"的""了""吗"这类不会自己成为概念）。
const FN = new Set(
  '的了着过吗呢吧啊哦哈嗯呀嘛啦么呗咯诶欸哇咦唉嘿喂哎是在和与及就也都还又很太更最不没别要被把给让对从向于为而但所以这那哪个些们我你他她它其之与或如若因即使得地上去下来出到说会能可想觉知已经将正刚才再却并且等使叫'.split(
    '',
  ),
)

// 纯语法词：高频但没有"概念"意义，靠它们连不成意识内容。
// 这是通用中文处理，不是人格设定——真正的概念（抽象/诗人/肥鱼/冷知识…）全部来自语料统计。
const GRAMMATICAL = new Set(
  ('已经 自己 东西 时候 一次 一直 然后 只有 本身 大家 大概 前面 后面 一点 有点 一起 正常 '
    + '继续 变成 直接 通常 经常 现在 今天 明天 昨天 可以 但是 因为 所以 如果 就是 还是 没有 '
    + '我们 你们 他们 她们 什么 怎么 这个 那个 这样 那样 一下 一样 一般 之间 之后 之前 而且 '
    + '并且 或者 虽然 不过 其实 确实 应该 可能 知道 觉得 认为 表示 需要 进行 出现 存在 发生 '
    + '使用 通过 根据 由于 因此 于是 同时 另外 此外 例如 比如 等等 一些 每个 各种 非常 特别 '
    + '比较 更加 稍微 差不多 几乎 完全 全部 整个 部分 主要 重要 相关 方面 情况 问题 时候'
  ).split(/\s+/),
)

const MIN_FREQ = 3
const MIN_ENTROPY = 0.75
const MIN_COHESION = 7
const MAX_LEN = 4

function runsOf(text) {
  const runs = []
  let cur = ''
  for (const ch of text) {
    if (HAN.test(ch) || /[a-zA-Z0-9]/.test(ch)) cur += ch
    else {
      if (cur) runs.push(cur)
      cur = ''
    }
  }
  if (cur) runs.push(cur)
  return runs
}

function entropy(map) {
  let total = 0
  for (const v of map.values()) total += v
  if (total <= 0) return 0
  let h = 0
  for (const v of map.values()) {
    const p = v / total
    h -= p * Math.log2(p)
  }
  return h
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by)
}

const LATIN_RUN = /^[a-zA-Z0-9]+$/

/**
 * @param {string[]} texts 经验单元文本
 * @param {{maxConcepts?: number, minFreq?: number, minEntropy?: number, minCohesion?: number}} opts
 */
export function discoverConcepts(texts, opts = {}) {
  const maxConcepts = opts.maxConcepts ?? 300
  const minFreq = opts.minFreq ?? MIN_FREQ
  const minEntropy = opts.minEntropy ?? MIN_ENTROPY
  const minCohesion = opts.minCohesion ?? MIN_COHESION
  const cnt = new Map()
  const runsPerText = []
  let totalChars = 0

  for (const text of texts) {
    const runs = []
    for (const run of runsOf(text)) {
      // 英文/数字整段算一个候选（AI、wdf、B站 旁边的纯拉丁串），不拆子串，
      // 否则 attention 会被切成 at/tt/te/en…
      if (LATIN_RUN.test(run)) {
        if (run.length >= 2 && run.length <= 12) bump(cnt, run)
        continue
      }
      if (run.length < 2) continue // 单字不成概念
      runs.push(run)
      totalChars += run.length
      for (let n = 1; n <= MAX_LEN; n += 1) {
        for (let i = 0; i + n <= run.length; i += 1) {
          bump(cnt, run.slice(i, i + n))
        }
      }
    }
    runsPerText.push(runs)
  }
  if (totalChars === 0) return { concepts: [], index: new Map(), segment: () => [] }

  // 第二遍：只给够频次的候选统计左右邻字（省内存）
  const leftNeighbors = new Map()
  const rightNeighbors = new Map()
  const wanted = new Set()
  for (const [gram, c] of cnt) {
    if (c >= minFreq && gram.length >= 2) wanted.add(gram)
  }
  for (const runs of runsPerText) {
    for (const run of runs) {
      for (let n = 2; n <= MAX_LEN; n += 1) {
        for (let i = 0; i + n <= run.length; i += 1) {
          const gram = run.slice(i, i + n)
          if (!wanted.has(gram)) continue
          const l = i > 0 ? run[i - 1] : '§'
          const r = i + n < run.length ? run[i + n] : '§'
          if (!leftNeighbors.has(gram)) {
            leftNeighbors.set(gram, new Map())
            rightNeighbors.set(gram, new Map())
          }
          bump(leftNeighbors.get(gram), l)
          bump(rightNeighbors.get(gram), r)
        }
      }
    }
  }

  const scored = []
  for (const [gram, c] of cnt) {
    if (c < minFreq) continue
    if (gram.length < 2 || gram.length > MAX_LEN) continue
    if (!WORDY.test(gram)) continue
    if (GRAMMATICAL.has(gram)) continue
    if (/^\d+$/.test(gram)) continue
    if (/^\d/.test(gram)) continue
    // 整段英文/数字（AI、wdf、nb）：没法算邻字熵，按频次直接收下——它们本身就是完整符号。
    if (LATIN_RUN.test(gram)) {
      scored.push({ text: gram, freq: c, score: Math.sqrt(c) * 1.6 })
      continue
    }
    if (!HAN.test(gram)) continue
    if (FN.has(gram[0]) || FN.has(gram[gram.length - 1])) continue
    if (new Set(gram).size === 1) continue

    const le = entropy(leftNeighbors.get(gram) || new Map())
    const re = entropy(rightNeighbors.get(gram) || new Map())
    if (le < minEntropy || re < minEntropy) continue

    let cohesion = Infinity
    for (let k = 1; k < gram.length; k += 1) {
      const a = cnt.get(gram.slice(0, k)) || 0
      const b = cnt.get(gram.slice(k)) || 0
      if (!a || !b) {
        cohesion = 0
        break
      }
      const pmi = (c * totalChars) / (a * b)
      if (pmi < cohesion) cohesion = pmi
    }
    if (!Number.isFinite(cohesion) || cohesion < minCohesion) continue

    const score = Math.sqrt(c) * Math.min(le, re) * Math.log1p(cohesion)
    scored.push({ text: gram, freq: c, score })
  }

  scored.sort((a, b) => b.score - a.score)

  // 去掉被更长更强概念包含的碎片："表情包" 收下之后就不再单独留 "表情"。
  const picked = []
  const freqOf = (t) => cnt.get(t) || 0
  for (const cand of scored) {
    if (picked.length >= maxConcepts) break
    let covered = false
    for (const p of picked) {
      if (p.text.length > cand.text.length && p.text.includes(cand.text)) {
        if (freqOf(p.text) >= freqOf(cand.text) * 0.6) {
          covered = true
          break
        }
      } else if (cand.text.length > p.text.length && cand.text.includes(p.text)) {
        if (freqOf(cand.text) >= freqOf(p.text) * 0.6) {
          // 新来的更长更强，顶掉旧的碎片
          const idx = picked.indexOf(p)
          if (idx >= 0) picked.splice(idx, 1)
        }
      }
    }
    if (!covered) picked.push(cand)
  }

  const concepts = picked.map((p, i) => ({
    i,
    text: p.text,
    freq: p.freq,
    score: p.score,
  }))

  const index = new Map()
  concepts.forEach((c) => index.set(c.text, c.i))

  return { concepts, index, segment: (text) => segmentWith(text, index) }
}

/** 最长匹配分词，返回概念 id 数组（按出现顺序，去重）。 */
export function segmentWith(text, index) {
  const out = []
  const seen = new Set()
  for (const run of runsOf(text)) {
    let i = 0
    while (i < run.length) {
      let hit = -1
      let hitLen = 0
      for (let n = Math.min(MAX_LEN, run.length - i); n >= 2; n -= 1) {
        const id = index.get(run.slice(i, i + n))
        if (id !== undefined) {
          hit = id
          hitLen = n
          break
        }
      }
      if (hit >= 0) {
        if (!seen.has(hit)) {
          seen.add(hit)
          out.push(hit)
        }
        i += hitLen
      } else {
        i += 1
      }
    }
  }
  return out
}
