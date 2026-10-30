import fs from 'node:fs'
import path from 'node:path'

const DEFAULTS = () => ({
  v: 1,
  createdAt: Date.now(),
  // 上网学到的经验：它自己长出来的知识，按分支分开存
  learned: [],
  // 每个自我各自的好奇心状态
  learnState: {},
  autoLearn: true,
  learnEveryMs: 45 * 60 * 1000,
})

function normalize(raw) {
  const base = DEFAULTS()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    learned: Array.isArray(raw.learned) ? raw.learned : [],
    learnState: raw.learnState && typeof raw.learnState === 'object' ? raw.learnState : {},
    autoLearn: raw.autoLearn !== false,
  }
}

export function loadStore(dir) {
  const file = path.join(dir, 'mind.json')
  try {
    return normalize(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return normalize(null)
  }
}

export function saveStore(dir, data) {
  const file = path.join(dir, 'mind.json')
  const tmp = `${file}.tmp`
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}
