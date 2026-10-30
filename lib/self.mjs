// 「我自己」——不是设定表，是两个由经历驱动的状态：兴趣和心情。
//
// 规则只有一条：**没有任何一项是写死的偏好**。兴趣是被结果改写的权重，
// 心情是被事件推动的标量。它们决定下一步做什么，做完之后又被这件事改回来。
//
//   兴趣：某个方向学来的东西，之后在脑子里越来越响 → 兴趣涨；学了没反应 → 兴趣跌，
//         连着跌几次就进入"厌倦期"，自己会绕开。
//   心情：被亲近会暖，长时间没人理会闷，一直学东西会累，遇到没见过的词会来劲。
//
// 这一层不产生内容，只产生「选择」。

const CHANNELS = ['meme', 'anime', 'thought', 'curiosity']

const DID = {
  meme: '翻了一圈热榜',
  anime: '看了会儿动画',
  thought: '读了几页书',
  curiosity: '琢磨脑子里那个词',
  idle: '发了会儿呆',
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

function weightedPick(list) {
  const total = list.reduce((a, x) => a + x.w, 0)
  if (total <= 0) return list[0]
  let r = Math.random() * total
  for (const x of list) {
    r -= x.w
    if (r <= 0) return x
  }
  return list[list.length - 1]
}

export function makeSelf() {
  return {
    interest: { meme: 0.34, anime: 0.72, thought: 0.3, curiosity: 0.42 },
    mood: { warm: 0.5, lonely: 0.35, curious: 0.55, tired: 0.2 },
    cooldown: {},
    lastKind: '',
    miss: {},            // 连续没收获的次数
    diary: [],           // 生活日志：什么时候、带着什么心情、做了什么
  }
}

/** 迁移旧 store：缺字段就补上，不重置已有的兴趣。 */
export function normalizeSelf(raw) {
  const base = makeSelf()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    interest: { ...base.interest, ...(raw.interest || {}) },
    mood: { ...base.mood, ...(raw.mood || {}) },
    cooldown: { ...(raw.cooldown || {}) },
    miss: { ...(raw.miss || {}) },
    diary: Array.isArray(raw.diary) ? raw.diary.slice(-40) : [],
  }
}

/**
 * 时间流逝本身就会消解疲劳：不做事的时候，累会自己退。
 * 没有这一条的话，连续跑十几个小时之后 tired 会一直满格，
 * 它就只剩"发呆"一个选项了（实际发生过）。
 */
export function tick(self, now) {
  const last = Number(self.lastActionAt) || 0
  if (!last) {
    self.lastActionAt = now
    return
  }
  const hours = Math.max(0, (now - last) / 3600000)
  self.mood.tired = clamp01(self.mood.tired - Math.min(0.6, hours * 0.12))
  // 长时间没人理，孤单会慢慢涨
  const quietHours = Math.max(0, (now - (Number(self.lastExternalAt) || last)) / 3600000)
  if (quietHours > 1) {
    self.mood.lonely = clamp01(self.mood.lonely + Math.min(0.3, (quietHours - 1) * 0.05))
  }
}

/**
 * 决定下一步做什么。
 * 不是随机：兴趣是权重，心情是调制项，厌倦是闸门。
 */
export function decide(self, now) {
  const m = self.mood
  const cands = []
  for (const k of CHANNELS) {
    if ((self.cooldown[k] || 0) > now) continue          // 还在厌倦期
    let w = Math.max(0.04, self.interest[k] ?? 0.3)
    if (k === 'curiosity') w *= 0.75 + m.curious * 0.6    // 来劲的时候更想琢磨
    if (k === 'anime' || k === 'meme') w *= 0.95 + m.tired * 0.4  // 累了更想看轻的（动画/热榜）
    if (k === 'thought') w *= 0.75 + (1 - m.tired) * 0.5   // 不累才读得进去
    cands.push({ k, w })
  }
  // 太累或太闷时，它会什么也不干 —— 这也是选择
  const idleW = 0.08 + m.tired * 0.32 + m.lonely * 0.2
  cands.push({ k: 'idle', w: idleW })

  const picked = weightedPick(cands)
  // 连续做同一件事会腻：轻微自我抑制，避免连刷三次热榜
  if (picked.k === self.lastKind && picked.k !== 'idle') picked.w *= 0.6
  return picked.k
}

/** 此刻的心情，用一句话说给自己听（也会显示在界面上）。 */
export function moodLine(self) {
  const m = self.mood
  const bits = []
  if (m.warm > 0.62) bits.push('心情不错')
  else if (m.lonely > 0.6) bits.push('有点闷')
  else if (m.tired > 0.62) bits.push('有点累')
  else if (m.curious > 0.68) bits.push('挺来劲')
  else bits.push('平平的')
  return bits.join('，')
}

/** 做完之后：这件事反过来改变它。 */
export function feel(self, { kind, ok, gained, now }) {
  const m = self.mood
  m.tired = clamp01(m.tired + 0.04)
  m.curious = clamp01(m.curious - 0.04)   // 满足了，好奇心回落

  if (ok && gained > 0) {
    // 有收获 → 这个方向更有兴趣；连着有收获会加速
    self.miss[kind] = 0
    self.interest[kind] = clamp01((self.interest[kind] ?? 0.3) + 0.06 + Math.min(0.06, gained * 0.01))
    m.curious = clamp01(m.curious + 0.10)
  } else {
    self.miss[kind] = (self.miss[kind] || 0) + 1
    self.interest[kind] = clamp01((self.interest[kind] ?? 0.3) - 0.05)
    // 连着几次白费力气 → 自己绕开一阵子（最长 6 小时）
    if (self.miss[kind] >= 3) {
      self.cooldown[kind] = now + Math.min(6 * 3600 * 1000, 45 * 60 * 1000 * self.miss[kind])
      self.miss[kind] = 0
    }
  }

  self.lastKind = kind
  self.lastActionAt = now
  const felt = ok && gained > 0 ? '有点收获' : kind === 'idle' ? '什么也没干' : '白跑一趟'
  self.diary = [
    ...(self.diary || []),
    { at: now, did: DID[kind] || kind, felt, mood: moodLine(self) },
  ].slice(-40)
}

/** 外界事件对心情的影响：私聊/群聊/被点名。 */
export function external(self, { kind, now }) {
  const m = self.mood
  self.lastExternalAt = now
  if (kind === 'private') {
    m.warm = clamp01(m.warm + 0.16)
    m.lonely = clamp01(m.lonely - 0.2)
    m.tired = clamp01(m.tired - 0.05)
  } else if (kind === 'group') {
    m.warm = clamp01(m.warm + 0.05)
    m.lonely = clamp01(m.lonely - 0.06)
  } else if (kind === 'silence') {
    m.lonely = clamp01(m.lonely + 0.05)
    m.warm = clamp01(m.warm - 0.02)
  }
  return m
}
