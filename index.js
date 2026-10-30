// 小鲸鱼·粒子大脑 —— 宿主半区。
//
// 只做三件事：
//   ① 后台把 qq-bridge 的经验流重建成两个自我（私聊 / 群聊）的意识图
//   ② 给浏览器半区一个只读快照 + 两个开关（现在学 / 自己学）
//   ③ 到点了让某个自我自己上网想明白一个词
//
// 没有任何"人格维度"常量——人格是 lib/mind.mjs 从语料里算出来的东西。
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createEngine, BRANCHES } from './lib/engine.mjs'
import { stateDirCandidates } from './lib/sources.mjs'

export const name = 'whale-brain'
export const inject = []

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const MOBILE_PORT = 7878

const ROUTE_STATE = '/whale-brain/state'
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

  let engine
  try {
    engine = createEngine({ stateDir: env.stateDir, dataDir: env.dataDir, log })
    log(`engine ready · state=${env.stateDir} data=${env.dataDir}`)
  } catch (error) {
    log(`engine init failed: ${error && error.message}`)
    return
  }

  // —— 手机访问 ——
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
        // 现算：换网了（拔网线/连上 WiFi）下次轮询就是新地址，不用重启
        mobile: mobile.port ? lanAddresses().map((x) => `http://${x.ip}:${mobile.port}/?k=${mobileToken}`)[0] || '' : '',
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
