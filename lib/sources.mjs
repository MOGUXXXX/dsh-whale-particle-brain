// 经验流：把 qq-bridge 里所有"小鲸鱼经历过的东西"摊平成一条条带时间的经验单元。
//
// 这里刻意**不读人格设定文件**（personas/*.md）。人格在脑子里是从经验里长出来的东西，
// 不是一份贴上去的说明书——所以喂给意识模型的只有：群友真正说过的话、它自己的内心独白、
// 主人要它记住的事、它学到的黑话、它知道的冷知识、它自己上网学的词条。
import fs from 'node:fs'
import path from 'node:path'

const DAY = 86400000

function readTextSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function statSafe(file) {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

/** 本地时区当天零点。日志只有 HH:MM:SS，日期靠文件 mtime 反推。 */
export function startOfLocalDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const LINE_RE = /^\[(\d{2}):(\d{2}):(\d{2})\]\s+(\S+)\s+\[[^\]]*\]\s+(.*)$/

/**
 * 解析一份 activity 日志。
 * 时间只有时分秒，从最后一行（≈文件 mtime）往前倒推日期；倒着走时时间变大就说明跨了一天。
 */
export function parseActivityLog(text, fileMtimeMs) {
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const m = LINE_RE.exec(line)
    if (!m) continue
    const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    const key = m[4]
    const body = m[5]
    let kind = null
    let content = ''
    if (body.startsWith('消息已入未读：')) {
      kind = 'chat'
      content = body.slice('消息已入未读：'.length)
    } else if (body.startsWith('AI 内部输出：')) {
      kind = 'mind'
      content = body.slice('AI 内部输出：'.length)
    } else {
      continue
    }
    out.push({ secs, key, kind, content })
  }
  const base = startOfLocalDay(fileMtimeMs)
  let dayBack = 0
  let prevSecs = null
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const row = out[i]
    if (prevSecs !== null && row.secs > prevSecs) dayBack += 1
    row.at = base - dayBack * DAY + row.secs * 1000
    prevSecs = row.secs
  }
  return out
}

/** 去掉引用前缀/图片占位/日志里漏出来的 JSON，留下真正的人话。 */
export function cleanExperienceText(raw) {
  let s = String(raw || '')
  s = s.replace(/\[引用[^\]]*\]/g, ' ')
  s = s.replace(/\[图[:：][^\]]*\]/g, ' ')
  s = s.replace(/\[表情[^\]]*\]/g, ' ')
  s = s.replace(/\[视频\]/g, ' ')
  s = s.replace(/@\S+\s*/g, ' ')
  s = s.replace(/\[[^\]]{0,20}\]/g, ' ')
  // 内部输出里夹带的界面负载（{"title":"状态核对","gap":12,...}）不是经历。
  for (let i = 0; i < 4; i += 1) s = s.replace(/\{[^{}]{0,600}\}/g, ' ')
  s = s.replace(/"[a-zA-Z_][a-zA-Z0-9_]*"\s*:/g, ' ')
  // 日期、时间、序号：不构成概念
  s = s.replace(/\d{4}[-/]\d{1,2}([-/]\d{1,2})?/g, ' ')
  s = s.replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
  s = s.replace(/\bseq\s*\d+(\s*-\s*\d+)?/gi, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

const MIN_TEXT = 2
const MAX_TEXT = 220

/** 一条经验属于哪个自我：私聊里的我 / 群里的我。 */
export function channelOf(key) {
  const s = String(key || '')
  if (s.startsWith('private:')) return 'private'
  if (s.startsWith('group:')) return 'group'
  return ''
}

function pushUnit(list, seen, unit) {
  const text = cleanExperienceText(unit.text)
  if (!text) return
  if (text.length < MIN_TEXT) return
  const clipped = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text
  const sig = `${unit.src}|${unit.at}|${clipped}`
  if (seen.has(sig)) return
  seen.add(sig)
  list.push({
    id: `u${list.length}`,
    text: clipped,
    at: unit.at,
    src: unit.src,
    key: unit.key || '',
    ch: unit.ch || channelOf(unit.key),
  })
}

/**
 * 收集全部经验单元。按时间升序返回。
 * src: chat 群友说的 / mind 自己想的 / memory 记下的 / slang 学到的词 / evidence 词的原始出处
 *      / cold 冷知识 / web 上网学的
 */
export function collectExperiences(stateDir, learned = []) {
  const units = []
  const seen = new Set()

  for (const name of ['qq-activity.log.1', 'qq-activity.log']) {
    const file = path.join(stateDir, name)
    const st = statSafe(file)
    if (!st) continue
    const rows = parseActivityLog(readTextSafe(file), st.mtimeMs)
    for (const row of rows) {
      pushUnit(units, seen, { text: row.content, at: row.at, src: row.kind, key: row.key })
    }
  }

  const memory = readJsonSafe(path.join(stateDir, 'shared-memory.json'), { entries: [] })
  for (const e of memory.entries || []) {
    if (!e || !e.text) continue
    pushUnit(units, seen, {
      text: e.text,
      at: Number(e.createdAt) || Date.now(),
      src: 'memory',
      key: e.sourceKey || '',
      // 没记来源的老条目多半是群里的近况（"群里的「杯子」梗"这种），归群聊。
      ch: channelOf(e.sourceKey) || 'group',
    })
  }

  // 黑话：只留"词本身"和它被真实使用的句子。
  // 那些「wdf 是 what the fuck 的缩写」的释义是词典，不是经历——喂进去只会长出"缩写/谐音"这种元语言概念。
  const slang = readJsonSafe(path.join(stateDir, 'slang.json'), [])
  if (Array.isArray(slang)) {
    for (const s of slang) {
      if (!s) continue
      if (s.status && s.status !== 'confirmed') continue
      const at = Date.parse(s.createdAt || '') || Date.now()
      const ch = channelOf((s.evidence || [])[0]?.key) || 'group'
      for (const ev of s.evidence || []) {
        if (!ev || !ev.text) continue
        pushUnit(units, seen, {
          text: ev.text,
          at: Number(ev.time) || at,
          src: 'evidence',
          key: ev.key,
          ch: channelOf(ev.key) || ch,
        })
      }
    }
  }

  const coldFile = path.join(stateDir, 'cold-knowledge.json')
  const cold = readJsonSafe(coldFile, { items: [] })
  const coldStat = statSafe(coldFile)
  const coldBase = coldStat ? coldStat.mtimeMs : Date.now()
  ;(cold.items || []).forEach((text, i) => {
    // 冷知识是私聊里主动找话题用的，进私聊那个自我。
    pushUnit(units, seen, { text, at: coldBase - i * 3600 * 1000, src: 'cold', ch: 'private' })
  })

  for (const item of learned || []) {
    if (!item || !item.text) continue
    pushUnit(units, seen, {
      text: item.text,
      at: Number(item.at) || Date.now(),
      src: 'web',
      ch: item.ch || 'group',
    })
  }

  units.sort((a, b) => a.at - b.at)
  return units
}

/** 便宜的变更指纹：文件 mtime + size。 */
export function fingerprint(stateDir) {
  const names = ['qq-activity.log', 'qq-activity.log.1', 'shared-memory.json', 'slang.json', 'cold-knowledge.json']
  const parts = []
  for (const name of names) {
    const st = statSafe(path.join(stateDir, name))
    parts.push(st ? `${name}:${Math.round(st.mtimeMs)}:${st.size}` : `${name}:-`)
  }
  return parts.join('|')
}

export function stateDirCandidates(explicit) {
  const list = []
  if (explicit) list.push(explicit)
  if (process.env.WHALE_BRAIN_STATE) list.push(process.env.WHALE_BRAIN_STATE)
  list.push(path.join('D:', path.sep, 'DSH', 'default-workspace', 'qq-bridge', 'state'))
  list.push(path.join(process.cwd(), '..', 'qq-bridge', 'state'))
  return list
}
