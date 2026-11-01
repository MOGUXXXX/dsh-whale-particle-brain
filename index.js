// 小鲸鱼·粒子大脑 —— 宿主半区。
//
// 只做三件事：
//   ① 后台把 qq-bridge 的经验流重建成两个自我（私聊 / 群聊）的意识图
//   ② 给浏览器半区一个只读快照 + 两个开关（现在学 / 自己学）
//   ③ 到点了让某个自我自己上网想明白一个词
//
// 没有任何"人格维度"常量——人格是 lib/mind.mjs 从语料里算出来的东西。
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createEngine, BRANCHES } from './lib/engine.mjs'
import { stateDirCandidates } from './lib/sources.mjs'
import { makeIdeas } from './lib/meteors.mjs'

export const name = 'whale-brain'
export const inject = []

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const MOBILE_PORT = 7878

const ROUTE_STATE = '/whale-brain/state'
// 固定的公网入口（ngrok 免费静态域名）。留空则退回局域网地址。
const PUBLIC_BASE = 'https://pester-icky-dealer.ngrok-free.dev'

const ROUTE_LEARN = '/whale-brain/learn'
const ROUTE_AUTO = '/whale-brain/auto'
const ROUTE_HEALTH = '/whale-brain/health'
const ROUTE_OPEN = '/whale-brain/open'

/**
 * 手机能连的局域网地址。网卡优先级：WiFi > 192.168/10 私网 > 其它。
 * 一个返回列表——有线网卡和无线网卡同时在时，手机只有一个是通的，让用户挑。
 */
function lanAddresses() {
  const nets = os.networkInterfaces()
  const out = []
  for (const name of Object.keys(nets)) {
    const isWifi = /wlan|wi-?fi|无线|wireless/i.test(name)
    for (const info of nets[name] || []) {
      if (info.family !== 'IPv4' && info.family !== 4) continue
      if (info.internal) continue
      const ip = info.address
      if (ip.startsWith('169.254.')) continue
      const priv = ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3
      out.push({ ip, name, score: (isWifi ? 0 : 10) + priv })
    }
  }
  out.sort((a, b) => a.score - b.score)
  return out
}

function lanAddress() {
  const list = lanAddresses()
  return list.length ? list[0].ip : '127.0.0.1'
}

function resolveEnv(config) {
  const candidates = stateDirCandidates(config && config.stateDir)
  let stateDir = candidates[candidates.length - 1]
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isDirectory()) {
        stateDir = p
        break
      }
    } catch {
      /* 试下一个 */
    }
  }
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const dataDir = (config && config.dataDir) || path.join(dshHome, 'whale-brain')
  return { stateDir, dataDir }
}

/** 只服务本机同源页面：跨站标记或异源 Origin 一律拒。 */
function gate(req, res) {
  try {
    const headers = req.headers || {}
    const site = String(headers['sec-fetch-site'] || '').toLowerCase()
    if (site === 'cross-site') return false
    const origin = headers.origin
    if (typeof origin === 'string' && origin && origin !== 'null') {
      const host = String(headers.host || '')
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) return false
    }
  } catch {
    return false
  }
  return true
}

function json(res, code, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

// 观测台的两个后台服务（8787 数据桥 / 8790 页面）由 DSH 自己带起来。
//
// 试过外部看门狗（PowerShell + WMI、Node + WMI），都不可靠：
// PowerShell 版拉不起子进程（找不到 node），Node 版被 DSH 重启连带杀过。
// 换个思路：DSH 在跑，就让 DSH 负责——不需要开机点任何东西。
const LIFEOS_SERVICES = [
  { port: 8787, script: 'D:/DSH/default-workspace/plugins/digital-life-core/web-ui/server/bridge.mjs', label: '数据桥 8787' },
  { port: 8790, script: 'D:/DSH/default-workspace/plugins/dlc-panel/server.mjs', label: '观测台 8790' },
]

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    let settled = false
    const done = (ok) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
    socket.setTimeout(1200, () => done(false))
  })
}

function superviseLifeOs(ctx, log) {
  const check = async () => {
    for (const svc of LIFEOS_SERVICES) {
      if (await canConnect(svc.port)) continue
      try {
        const child = spawn(process.execPath, [svc.script], { detached: true, stdio: 'ignore', windowsHide: true })
        child.unref()
        log('拉起 ' + svc.label + ' (pid ' + child.pid + ')')
      } catch (error) {
        log('拉起 ' + svc.label + ' 失败: ' + ((error && error.message) || error))
      }
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
  try {
    ctx.effect(() => {
      check()
      const timer = setInterval(check, 60000)
      return () => clearInterval(timer)
    })
  } catch {
    /* effect 不可用就算了，不影响主功能 */
  }
}

export function apply(ctx, config) {
  const env = resolveEnv(config)
  const logRing = []
  const log = (msg) => {
    const line = `${new Date().toISOString().slice(11, 19)} ${msg}`
    logRing.push(line)
    if (logRing.length > 60) logRing.shift()
    try {
      console.log(`[whale-brain] ${msg}`)
    } catch {
      /* noop */
    }
  }

  superviseLifeOs(ctx, log)

  let engine
  try {
    engine = createEngine({ stateDir: env.stateDir, dataDir: env.dataDir, log })
    log(`engine ready · state=${env.stateDir} data=${env.dataDir}`)  } catch (error) {
    log(`engine init failed: ${error && error.message}`)
    return
  }

  // —— 灵感海 ——
  // 念头像流星一样不停划过，极少数（0.1%）被抓住：写进冷知识池（私聊主动开口会挑到它），
  // 同时落成一颗常驻的星，前端从 /meteors/state 读。
  const METEOR_FILE = path.join(env.dataDir, 'meteors.json')
  const readMeteors = () => {
    try {
      return JSON.parse(fs.readFileSync(METEOR_FILE, 'utf8'))
    } catch {
      return { promoted: [] }
    }
  }
  // 落星的后续动作：把她"想到的事"真的说出来，并记成执念
  const QQ_CONFIG = path.join(ROOT, '..', '..', 'config.json')
  const readQqConfig = () => {
    try {
      return JSON.parse(fs.readFileSync('D:/DSH/default-workspace/qq-bridge/config.json', 'utf8'))
    } catch {
      return null
    }
  }
  // 用她会说话的方式讲出来：短句、不排比、不带我想说这种书面腔
  // 口语来源：从本地番剧字幕里挑出来的说法（「我说啊」「那个」「话说回来」「对吧」「怎么办」
  // 这些都出自 _anime_lines/_src 下的台词，不是我自己编的书面腔）
  const OPENERS = ['诶　', '我说啊　', '那个　', '喂　', '话说　', '嗯…　', '']
  const MIDDLES = ['', '　就突然想到　', '　你知道吗　']
  const TAILS = ['　对吧', '　你说呢', '　有点想不通', '　好奇怪啊', '　怎么办', '　不想睡']
  // 就直接说出口的那句：不再拼起头/尾巴，那些拼接才是格式化的来源
  const spokenLine = (text) => {
    const t = String(text).replace(/[。！]$/, '').trim()
    return Math.random() < 0.15 ? '诶 ' + t : t
  }

  const pushGap = (text) => {
    try {
      const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
      const file = path.join(home, 'digital-life-core', 'state.json')
      const st = JSON.parse(fs.readFileSync(file, 'utf8'))
      const gaps = Array.isArray(st.gaps) ? st.gaps : []
      gaps.unshift({
        id: 'gap-idea-' + Date.now().toString(36),
        summary: text,
        tension: 72,
        createdAt: Date.now(),
        source: 'meteor-sea',
      })
      st.gaps = gaps.slice(0, 80)
      fs.writeFileSync(file, JSON.stringify(st, null, 2) + String.fromCharCode(10))
      log('执念池 +1：' + text)
    } catch (error) {
      log('执念池写入失败：' + ((error && error.message) || error))
    }
  }
  // 主动开口：桥接 reserved2 要求「控制台令牌（请求头）+ 会话 agent token（请求体）」双证
  const sayToOwner = (text) => {
    try {
      const cfg = readQqConfig()
      const userId = String((cfg && (cfg.ownerQQ || (cfg.allow && cfg.allow.private && cfg.allow.private[0]))) || '')
      if (!userId) return
      const base = 'D:/DSH/default-workspace/qq-bridge/state'
      const consoleToken = fs.readFileSync(path.join(base, 'console-token'), 'utf8').trim()
      const social = JSON.parse(fs.readFileSync(path.join(base, 'social-v2.json'), 'utf8'))
      const agentToken = (social.conversations && social.conversations['private:' + userId] && social.conversations['private:' + userId].agentToken) || ''
      if (!consoleToken || !agentToken) { log('主动开口跳过：缺少令牌'); return }
      const body = JSON.stringify({ token: agentToken, userId, message: text })
      const req = http.request(
        { host: '127.0.0.1', port: 3100, path: '/api/send/private', method: 'POST', timeout: 8000,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-console-token': consoleToken } },
        (up) => {
          let b2 = ''
          up.on('data', (c) => { b2 += c })
          up.on('end', () => log('主动开口结果：' + String(b2).replace(/\s+/g, ' ').slice(0, 140)))
        },
      )
      req.on('error', (e) => log('主动开口失败：' + (e && e.message)))
      req.write(body)
      req.end()
    } catch (error) {
      log('主动开口异常：' + ((error && error.message) || error))
    }
  }

  const promoteIdea = (idea) => {
    const text = String((idea && idea.text) || '').slice(0, 120)
    if (!text) return null
    const item = { t: text, at: Date.now() }
    const state = readMeteors()
    state.promoted = [...(state.promoted || []), item].slice(-80)
    try {
      fs.mkdirSync(env.dataDir, { recursive: true })
      fs.writeFileSync(METEOR_FILE, JSON.stringify(state, null, 2) + '\n')
    } catch {
      /* 写不了不影响展示 */
    }
    try {
      const cold = path.join(env.stateDir, 'cold-knowledge.json')
      const raw = JSON.parse(fs.readFileSync(cold, 'utf8'))
      const list = Array.isArray(raw) ? raw : []
      if (!list.includes(text)) list.push(text)
      while (list.length > 200) list.shift()
      fs.writeFileSync(cold, JSON.stringify(list))
      log(`灵感海抓住一个念头：${text}`)
      pushGap(text)
      sayToOwner(spokenLine(text))
    } catch {
      /* 冷知识池不在就算了 */
    }
    return item
  }

  // —— 数字生命的"时间兜底" ——
  // 回能和激素衰减本来是时间函数，但那段计时只在插件被加载时才跑。
  // 聊天没醒、工作区又不加载它，数字就永远停在那里。
  // 这里补一个兜底：只要 state.json 长时间没人写（说明真的没人驱动），就按时间补上恢复量。
  // 真正的插件一写文件，兜底立刻让位——不会两边打架。
  const dlStateCandidates = [
    process.env.DL_STATE,
    process.env.DSH_HOME && path.join(process.env.DSH_HOME, 'digital-life-core', 'state.json'),
    path.join(os.homedir(), '.dsh', 'digital-life-core', 'state.json'),
    'D:/DSH/.dsh/digital-life-core/state.json',
  ].filter(Boolean)
  const findDlState = () => {
    for (const f of dlStateCandidates) {
      try { if (fs.statSync(f).isFile()) return f } catch { /* 下一个 */ }
    }
    return dlStateCandidates[dlStateCandidates.length - 1]
  }
  // 兜底的"睡眠"判定：不看 updatedAt（那个每分钟都有东西在写，永远算不出空闲），
  // 而是看**能量本身有没有在动**。能量不动 = 没人驱动 = 当作她在睡，按分钟补。
  const TICK_FILE = path.join(env.dataDir, 'dl-ticker.json')
  // 兜底每次跑到哪一步、为什么没动作，都记在这里，供 /debug 读
  const tickTrace = { at: 0, step: 'never', detail: '', energy: null, cap: null, wrote: false, error: '' }
  const tickDigitalLife = () => {
    try {
      tickTrace.at = Date.now()
      tickTrace.step = 'start'
      fs.mkdirSync(path.dirname(TICK_FILE), { recursive: true })
      const dlState = findDlState()
      tickTrace.step = 'state@' + dlState
      const raw = JSON.parse(fs.readFileSync(dlState, 'utf8'))
      const now = Date.now()
      const cap = Number((raw.sleep && raw.sleep.naturalCap) || 180)
      const energy = Number(raw.energy || 0)

      let prev = null
      try {
        prev = JSON.parse(fs.readFileSync(TICK_FILE, 'utf8'))
      } catch {
        prev = null
      }
      const prevEnergy = prev ? Number(prev.energy) : null
      const prevAt = prev ? Number(prev.at) : now
      const moved = prevEnergy === null ? false : Math.abs(energy - prevEnergy) > 0.05
      tickTrace.energy = energy
      tickTrace.cap = cap
      tickTrace.step = moved ? 'moved' : 'idle'
      tickTrace.detail = `prev=${prevEnergy} mins=${((now - prevAt) / 60000).toFixed(2)}`

      // 能量在动 → 有人在跑真正的逻辑，记一笔就走
      if (moved) {
        fs.writeFileSync(TICK_FILE, JSON.stringify({ energy, at: now }))
        return
      }

      // 能量不动：当她在睡。按距上次检查的时间补，最多补 90 分钟，免得久关之后暴涨
      const mins = Math.min((now - prevAt) / 60000, 90)
      if (mins < 0.5) {
        // 首次没有基准：先把当前能量记下来，否则永远算不出间隔（会卡死在这里）
        fs.writeFileSync(TICK_FILE, JSON.stringify({ energy, at: now }))
        tickTrace.detail += ' 建立基准'
        return
      }
      const rate = 4 // 每分钟回 4 点
      const next = Math.min(cap, energy + rate * mins)
      if (next > energy + 0.05) {
        raw.energy = Number(next.toFixed(2))
        raw.updatedAt = now
        fs.writeFileSync(dlState, JSON.stringify(raw, null, 2) + String.fromCharCode(10))
        tickTrace.wrote = true
        tickTrace.energy = raw.energy
        log(`兜底睡眠：能量 ${energy.toFixed(1)} → ${raw.energy}（${mins.toFixed(1)} 分钟）`)
      }
      fs.writeFileSync(TICK_FILE, JSON.stringify({ energy: raw.energy, at: now }))
    } catch (err) {
      tickTrace.step = 'error'
      tickTrace.error = String((err && err.message) || err)
    }
  }


  // DSH 的 webServer 只绑 127.0.0.1，而且页面要主进程里的令牌，手机进不来。
  // 所以这里单独起一个小服务绑 0.0.0.0，只服务一个自包含的移动端页面 + 同一份快照。
  // 用一次性密钥保护：URL 里的 k 不对就 401。
  const mobile = { server: null, port: 0, url: '' }
  const mobileToken =
    (engine.store && engine.store.mobileToken) ||
    (engine.store.mobileToken = crypto.randomBytes(8).toString('hex'))
  try {
    engine.save()
  } catch (error) {
    log(`token 持久化失败：${(error && error.message) || error}`)
  }

  let mobileHtml = ''
  try {
    mobileHtml = fs.readFileSync(path.join(ROOT, 'mobile.html'), 'utf8')
  } catch (error) {
    log(`mobile.html 读不到：${(error && error.message) || error}`)
  }

  function startMobile(port, attempt) {
    if (!mobileHtml) return
    const server = http.createServer((req, res) => {
      let url
      try {
        url = new URL(req.url || '/', 'http://local')
      } catch {
        res.writeHead(400).end()
        return
      }
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, plugin: 'whale-brain', mobile: true }))
        return
      }
      if ((url.searchParams.get('k') || '') !== mobileToken) {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('需要访问密钥：用桌面面板里给出的那条链接')
        return
      }
      if (url.pathname === '/state') {
        try {
          const snap = snapshot()
          const etag = `"wbm-${snap.v}"`
          if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-store' })
            res.end()
            return
          }
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            ETag: etag,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          })
          res.end(JSON.stringify(snap))
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: String((error && error.message) || error) }))
        }
        return
      }
      // 手机端也要能看灵感海和生命体征，这两个数据口一并开到这台服务器上
      if (url.pathname === '/meteors/state') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        const st = readMeteors()
        res.end(JSON.stringify({ ok: true, promoted: (st.promoted || []).slice(-40) }))
        return
      }
      if (url.pathname === '/meteors/pool') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        const n = Math.max(4, Math.min(40, Number(url.searchParams.get('n')) || 16))
        res.end(JSON.stringify({ ok: true, ideas: makeIdeas(n) }))
        return
      }
      // 观测台的完整快照：直接代理 8787 的 /api/snapshot，手机端一次拿全
      if (url.pathname === '/life/full') {
        http.get({ host: '127.0.0.1', port: 8787, path: '/api/snapshot', timeout: 4000 }, (up) => {
          let body = ''
          up.on('data', (c) => { body += c })
          up.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(body || JSON.stringify({ ok: false }))
          })
        }).on('error', () => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: '观测台没起来' }))
        })
        return
      }
      if (url.pathname === '/life') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        try {
          const home2 = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
          const raw2 = JSON.parse(fs.readFileSync(path.join(home2, 'digital-life-core', 'state.json'), 'utf8'))
          const chem = raw2.chemicals || {}
          res.end(
            JSON.stringify({
              ok: true,
              energy: Number(raw2.energy || 0),
              maxEnergy: Number(raw2.maxEnergy || 0),
              restMode: !!raw2.restMode,
              chemicals: {
                dopamine: Number(chem.dopamine ?? raw2.dopamine ?? 0),
                cortisol: Number(chem.cortisol ?? raw2.cortisol ?? 0),
                serotonin: Number(chem.serotonin ?? raw2.serotonin ?? 0),
              },
            }),
          )
        } catch {
          res.end(JSON.stringify({ ok: false, error: '读不到 state' }))
        }
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      let html = mobileHtml
      try {
        html = fs.readFileSync(path.join(ROOT, 'mobile.html'), 'utf8')
      } catch {
        /* 读不到就用启动时缓存的 */
      }
      res.end(html.replace('__KEY__', mobileToken))
    })
    server.on('error', (error) => {
      if (error && error.code === 'EADDRINUSE' && attempt < 16) {
        startMobile(port + 1, attempt + 1)
        return
      }
      log(`mobile server failed: ${(error && error.message) || error}`)
    })
    server.listen(port, '0.0.0.0', () => {
      mobile.server = server
      mobile.port = port
      mobile.url = `http://${lanAddress()}:${port}/?k=${mobileToken}`
      mobile.all = lanAddresses().map((x) => `http://${x.ip}:${port}/?k=${mobileToken}`)
      log(`mobile page on 0.0.0.0:${port} -> ${mobile.url}`)
    })
  }

  startMobile(MOBILE_PORT, 0)

  let learning = false
  let lastError = ''
  // 桌面快捷方式打过来的"打开面板"信号：客户端每 2.5 秒问一次，
  // 这样即使拿不到键盘焦点，也能把面板切出来。
  let openSignal = 0

  function tick() {
    try {
      engine.rebuild(false)
    } catch (error) {
      lastError = String((error && error.message) || error)
      log(`rebuild failed: ${lastError}`)
    }
    try {
      const due = engine.dueBranches(Date.now())
      if (!due.length || learning) return
      const web = ctx.get('web')
      if (!web) return
      learning = true
      ;(async () => {
        for (const id of due) {
          try {
            const out = await engine.learnNow(id, web)
            log(`learn ${id}: ${out.msg || ''}`)
          } catch (error) {
            log(`learn ${id} failed: ${(error && error.message) || error}`)
          }
        }
      })().finally(() => {
        learning = false
      })
    } catch (error) {
      log(`tick failed: ${(error && error.message) || error}`)
    }
  }

  ctx.effect(() => () => {
    try {
      mobile.server?.close()
    } catch {
      /* ignore */
    }
  })

  ctx.effect(() => {
    const timer = setInterval(tick, 20000)
    const warm = setTimeout(tick, 1500)
    return () => {
      clearInterval(timer)
      clearTimeout(warm)
    }
  })

  // 时间兜底：每分钟看一眼，没人驱动就给数字生命补恢复量
  ctx.effect(() => {
    const warm = setTimeout(tickDigitalLife, 3000)
    const timer = setInterval(tickDigitalLife, 60000)
    return () => { clearTimeout(warm); clearInterval(timer) }
  })

  // 灵感海的骰子：每 90 秒掷一次，0.1% 命中就抓住一个念头。
  // 低频骰子而不是"每颗流星掷一次"——前端画多少颗是它自己决定的，
  // 服务端只要保证大概一天出一两次就够了。
  ctx.effect(() => {
    const timer = setInterval(() => {
      if (Math.random() >= 0.001) return
      try {
        promoteIdea(makeIdeas(1)[0])
      } catch {
        /* 忘了它 */
      }
    }, 90_000)
    return () => clearInterval(timer)
  })

  function snapshot() {
    const snap = engine.rebuild(false)
    const hull = snap.branches.private?.hull || snap.branches.group?.hull || []
    const rings = snap.branches.private?.rings || snap.branches.group?.rings || []
    const branches = {}
    for (const key of Object.keys(snap.branches)) {
      const b = snap.branches[key]
      const { hull: _h, rings: _r, ...rest } = b
      branches[key] = rest
    }
    return {
      v: snap.v,
      at: snap.at,
      ms: snap.ms,
      hull,
      rings,
      branches,
      learn: snap.learn,
      meta: {
        // 手机地址优先给固定公网地址：局域网那条只在同一个 WiFi 下有效，
        // 出门/切流量就打不开了。公网那条走 ngrok 隧道，非局域网也能用。
        // 想临时用局域网，把 PUBLIC_BASE 清掉即可（下面 mobileLan 仍然会返回局域网地址）。
        mobile: PUBLIC_BASE
          ? `${PUBLIC_BASE}/?k=${mobileToken}`
          : mobile.port
            ? lanAddresses().map((x) => `http://${x.ip}:${mobile.port}/?k=${mobileToken}`)[0] || ''
            : '',
        mobileLan: mobile.port ? lanAddresses().map((x) => `http://${x.ip}:${mobile.port}/?k=${mobileToken}`) : [],
        mobileAll: mobile.port ? lanAddresses().map((x) => `http://${x.ip}:${mobile.port}/?k=${mobileToken}`) : [],
        mobilePort: mobile.port,
        stateDir: env.stateDir,
        dataDir: env.dataDir,
        order: BRANCHES.map((b) => b.id),
        lastError,
        log: logRing.slice(-12),
      },
    }
  }

  function attach(scoped) {
    const server = scoped.webServer
    if (!server || typeof server.register !== 'function') return

    // 灵感海：前端拿"已经落成星"的念头；/promote 是手动点一颗（调试/演示用）。
    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: '/meteors/state',
        handler(req, res) {
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          const st = readMeteors()
          res.end(JSON.stringify({ ok: true, promoted: (st.promoted || []).slice(-60), hitRate: 0.001 }))
        },
      }),
    )

    // 流星上要写字，所以前端需要一批当时生成的念头（不是落星）。
    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: '/meteors/pool',
        handler(req, res) {
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          const url = new URL(req.url || '/meteors/pool', 'http://local')
          const n = Math.max(4, Math.min(40, Number(url.searchParams.get('n')) || 16))
          // 每天现生成一批，当天反复用；排掉最近说过的，避免同一句反复飘。
          const state = readMeteors()
          const today = new Date().toISOString().slice(0, 10)
          const used = Array.isArray(state.used) ? state.used.slice(-400) : []
          if (!state.daily || state.daily.date !== today || !Array.isArray(state.daily.list) || state.daily.list.length < n) {
            state.daily = { date: today, list: makeIdeas(90, used).map((x) => x.text) }
            log(`灵感海今天生成了 ${state.daily.list.length} 个念头`)
          }
          const picked = state.daily.list.slice(0, n)
          state.daily.list = state.daily.list.slice(n)
          state.used = [...used, ...picked].slice(-400)
          try {
            fs.mkdirSync(env.dataDir, { recursive: true })
            fs.writeFileSync(METEOR_FILE, JSON.stringify(state, null, 2) + '\n')
          } catch {
            /* 存不下就只活在内存里 */
          }
          res.end(JSON.stringify({ ok: true, ideas: picked.map((text) => ({ text })), day: today }))
        },
      }),
    )
    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: '/meteors/promote',
        handler(req, res) {
          res.setHeader('content-type', 'application/json; charset=utf-8')
          const item = promoteIdea(makeIdeas(1)[0])
          res.end(JSON.stringify({ ok: !!item, item }))
        },
      }),
    )

    // 诊断口：兜底回能到底跑到哪一步、手机页有没有插进去，一次看全
    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: '/whale-brain/debug',
        handler(req, res) {
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          const dlState = findDlState()
          let stateOk = false
          let energy = null
          try {
            const raw = JSON.parse(fs.readFileSync(dlState, 'utf8'))
            stateOk = true
            energy = raw.energy
          } catch (error) {
            stateOk = String((error && error.message) || error)
          }
          let tickFile = null
          try {
            tickFile = JSON.parse(fs.readFileSync(TICK_FILE, 'utf8'))
          } catch {
            tickFile = null
          }
          let mobileInfo = null
          try {
            const html = fs.readFileSync(path.join(ROOT, 'mobile.html'), 'utf8')
            mobileInfo = {
              bytes: html.length,
              hasMeteorView: html.includes('id="mcv"'),
              hasLifeView: html.includes('id="lvE"'),
              hasButtons: html.includes('data-v="meteor"'),
            }
          } catch (error) {
            mobileInfo = String((error && error.message) || error)
          }
          res.end(
            JSON.stringify({
              ok: true,
              now: Date.now(),
              dlStatePath: dlState,
              dlStateOk: stateOk,
              energy,
              tickFile,
              tickTrace,
              mobileInfo,
              dataDir: env.dataDir,
              stateDir: env.stateDir,
            }),
          )
        },
      }),
    )

    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: ROUTE_STATE,
        handler(req, res) {
          if (!gate(req, res)) return json(res, 403, { error: 'forbidden' })
          try {
            const payload = snapshot()
            const etag = `"wb-${payload.v}"`
            if (req.headers['if-none-match'] === etag) {
              res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-store' })
              res.end()
              return
            }
            res.setHeader('ETag', etag)
            json(res, 200, payload)
          } catch (error) {
            json(res, 500, { error: String((error && error.message) || error) })
          }
        },
      }),
    )

    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: ROUTE_LEARN,
        handler(req, res) {
          if (!gate(req, res)) return json(res, 403, { error: 'forbidden' })
          const url = new URL(req.url || ROUTE_LEARN, 'http://local')
          const which = url.searchParams.get('branch') || 'both'
          const web = ctx.get('web')
          if (!web) return json(res, 200, { ok: false, msg: '宿主没有联网服务' })
          const ids = which === 'both' ? BRANCHES.map((b) => b.id) : [which]
          ;(async () => {
            const results = []
            for (const id of ids) {
              try {
                const out = await engine.learnNow(id, web)
                results.push({ branch: id, ...out })
                log(`learn(${id}): ${out.msg || ''}`)
              } catch (error) {
                results.push({ branch: id, ok: false, msg: String((error && error.message) || error) })
              }
            }
            json(res, 200, { ok: results.some((r) => r.ok), results })
          })()
        },
      }),
    )

    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: ROUTE_AUTO,
        handler(req, res) {
          if (!gate(req, res)) return json(res, 403, { error: 'forbidden' })
          const url = new URL(req.url || ROUTE_AUTO, 'http://local')
          const raw = url.searchParams.get('on')
          const on = raw === null ? !engine.store.autoLearn : raw !== '0' && raw !== 'false'
          const value = engine.setAuto(on)
          json(res, 200, { ok: true, autoLearn: value })
        },
      }),
    )

    // 前端端口每次启动都可能变（62870 → 64492），所以把当前 origin 落盘，
    // 桌面快捷方式读这个文件，不要再把端口写死在脚本里。
    scoped.effect(() => {
      try {
        const origin = server.getOrigin()
        const file = path.join(env.dataDir, 'endpoint.json')
        fs.mkdirSync(env.dataDir, { recursive: true })
        fs.writeFileSync(
          file,
          JSON.stringify({ origin, at: Date.now(), pid: process.pid, plugin: 'whale-brain' }, null, 1),
          'utf8',
        )
        log(`endpoint ${origin} -> ${file}`)
      } catch (error) {
        log(`endpoint write failed: ${(error && error.message) || error}`)
      }
      return () => {}
    })

    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: ROUTE_OPEN,
        handler(req, res) {
          if (!gate(req, res)) return json(res, 403, { error: 'forbidden' })
          const url = new URL(req.url || ROUTE_OPEN, 'http://local')
          if (String(req.method || 'GET').toUpperCase() === 'POST') {
            openSignal += 1
            return json(res, 200, { ok: true, signal: openSignal })
          }
          const since = Number(url.searchParams.get('since') || '0') || 0
          return json(res, 200, { signal: openSignal, open: openSignal > since })
        },
      }),
    )

    scoped.effect(() =>
      server.register({
        kind: 'exact',
        path: ROUTE_HEALTH,
        handler(req, res) {
          if (!gate(req, res)) return json(res, 403, { error: 'forbidden' })
          json(res, 200, {
            ok: true,
            stateDir: env.stateDir,
            dataDir: env.dataDir,
            autoLearn: engine.store.autoLearn,
            learned: engine.store.learned.length,
            log: logRing.slice(-20),
          })
        },
      }),
    )
  }

  try {
    ctx.inject(['webServer'], (scoped) => {
      attach(scoped)
    })
  } catch (error) {
    log(`webServer inject failed: ${(error && error.message) || error}`)
  }

  // 首帧预热，让面板一打开就有东西
  try {
    engine.rebuild(true)
  } catch (error) {
    log(`warm rebuild failed: ${(error && error.message) || error}`)
  }
}
