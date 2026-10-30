// 小鲸鱼·粒子大脑 —— 浏览器半区。
//
// 两个自我并排：私聊的我和群聊的我，各自一张会呼吸的概念图。
// 靠近中心的是刚长出来、还在被反复想起的概念；越往外越旧，也越模糊。
// 金色是"我的"（内心独白、它自己记下的事），青色是"外面的世界"（群友说的话）。
window.__ModuleLoader__.load({
  id: 'whale-brain',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'whale-brain'
    const API = '/whale-brain'

    const TEXT = {
      zh: {
        nav: '小鲸鱼·粒子大脑',
        title: '小鲸鱼 · 两颗脑袋',
        subtitle: '私聊里的我和群里的我，各自从经历里长出来',
        private: '私聊的我',
        group: '群聊的我',
        privateSub: '只对主人',
        groupSub: '群里那副样子',
        neurons: '概念',
        synapses: '突触',
        forgotten: '已模糊',
        clarity: '平均清晰度',
        self: '自我',
        newest: '刚长出来',
        picked: '选中的概念',
        age: '记忆年龄',
        recall: '清晰度',
        act: '激活',
        hits: '被想起',
        days: '天',
        hours: '小时',
        justNow: '刚刚',
        thinking: '想一个',
        thinkingBusy: '在想…',
        autoLearn: '自己上网学',
        learnOn: '开着',
        learnOff: '关着',
        lastLearn: '上次想的',
        empty: '这个自我还没长出东西——它还没跟人说过话',
        loading: '正在把记忆摊开…',
        offline: '连不上宿主进程',
        offlineHint: '面板还在，但取不到脑子里的数据。检查插件是否被停用。',
        wheel: '拖拽旋转 · 滚轮缩放 · 点击粒子看它是什么',
        units: '经历',
        dictionary: '认得的词',
        noPicked: '点一颗粒子',
        forgetLegend: '记忆清晰度',
        selfLegend: '彩色亮点 = 此刻最响的念头 · 越靠外越模糊',
        hotkey: 'Ctrl+Shift+B 开关',
      },
      en: {
        nav: 'Whale Brain',
        title: 'Little Whale · Two Heads',
        subtitle: 'The me in DMs and the me in the group, each grown from experience',
        private: 'Me in DMs',
        group: 'Me in the group',
        privateSub: 'only for the owner',
        groupSub: 'how I am in the group',
        neurons: 'concepts',
        synapses: 'synapses',
        forgotten: 'faded',
        clarity: 'mean clarity',
        self: 'self',
        newest: 'newly grown',
        picked: 'selected concept',
        age: 'age',
        recall: 'clarity',
        act: 'activation',
        hits: 'recalled',
        days: 'd',
        hours: 'h',
        justNow: 'just now',
        thinking: 'Think',
        thinkingBusy: 'thinking…',
        autoLearn: 'learn online',
        learnOn: 'on',
        learnOff: 'off',
        lastLearn: 'last thought',
        empty: 'Nothing has grown here yet — it has not talked to anyone',
        loading: 'unfolding memories…',
        offline: 'Cannot reach the host',
        offlineHint: 'The panel is here but no data arrives. Check whether the plugin is enabled.',
        wheel: 'drag to rotate · wheel to zoom · click a particle',
        units: 'experiences',
        dictionary: 'known words',
        noPicked: 'pick a particle',
        forgetLegend: 'memory clarity',
        selfLegend: 'bright hubs = loudest thoughts · outer = fading',
        hotkey: 'Ctrl+Shift+B toggles',
      },
    }

    const PALETTE = {
      cyan: '95,214,255',
      gold: '255,205,110',
      white: '235,245,255',
      edge: '110,180,230',
    }

    // 圆点贴图：实心 + 一圈很窄的柔边，比 fillRect 的方块干净，比每帧 arc 便宜
    const dotCache = new Map()
    function dotSprite(rgb) {
      let cv = dotCache.get(rgb)
      if (cv) return cv
      const S = 64
      cv = document.createElement('canvas')
      cv.width = S
      cv.height = S
      const g = cv.getContext('2d')
      const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
      grd.addColorStop(0, `rgba(${rgb},1)`)
      grd.addColorStop(0.5, `rgba(${rgb},1)`)
      grd.addColorStop(0.84, `rgba(${rgb},0.66)`)
      grd.addColorStop(0.93, `rgba(${rgb},0.18)`)
      grd.addColorStop(1, `rgba(${rgb},0)`)
      g.fillStyle = grd
      g.beginPath()
      g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
      g.fill()
      dotCache.set(rgb, cv)
      return cv
    }

    // 柔光贴图：给整簇/事件铺一层弥散光，和锐利的 dotSprite 分工
    const glowCache = new Map()
    function glowSprite(rgb) {
      let cv = glowCache.get(rgb)
      if (cv) return cv
      const S = 64
      cv = document.createElement('canvas')
      cv.width = S
      cv.height = S
      const g = cv.getContext('2d')
      const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
      grd.addColorStop(0, `rgba(${rgb},1)`)
      grd.addColorStop(0.22, `rgba(${rgb},0.72)`)
      grd.addColorStop(0.5, `rgba(${rgb},0.2)`)
      grd.addColorStop(1, `rgba(${rgb},0)`)
      g.fillStyle = grd
      g.beginPath()
      g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
      g.fill()
      glowCache.set(rgb, cv)
      return cv
    }

    function makeSprite(rgb) {
      const size = 64
      const cv = document.createElement('canvas')
      cv.width = size
      cv.height = size
      const g = cv.getContext('2d')
      const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      grd.addColorStop(0, `rgba(${rgb},1)`)
      grd.addColorStop(0.22, `rgba(${rgb},0.72)`)
      grd.addColorStop(0.5, `rgba(${rgb},0.2)`)
      grd.addColorStop(1, `rgba(${rgb},0)`)
      g.fillStyle = grd
      g.beginPath()
      g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      g.fill()
      return cv
    }

    // ---------- 数据抓取 ----------
    function useSnapshot() {
      const [snap, setSnap] = useState(null)
      const [error, setError] = useState(null)
      const etag = useRef('')
      const load = useCallback(async () => {
        try {
          const res = await fetch(`${API}/state`, {
            headers: etag.current ? { 'If-None-Match': etag.current } : {},
            cache: 'no-store',
          })
          if (res.status === 304) return
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          etag.current = res.headers.get('ETag') || ''
          const data = await res.json()
          setSnap(data)
          setError(null)
        } catch (err) {
          setError(String((err && err.message) || err))
        }
      }, [])
      useEffect(() => {
        load()
        const timer = setInterval(load, 6000)
        return () => clearInterval(timer)
      }, [load])
      return { snap, error, reload: load }
    }

    // ---------- 几何 ----------
    // 观感参考：纯黑底 + 密集小锐点 + 极细连丝 + 少数枢纽各自发光。
    const DOT_RGB = '208,228,248'
    function hashStr(str) {
      let h = 2166136261 >>> 0
      for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 16777619) >>> 0
      }
      return h >>> 0
    }
    function seededRng(seed) {
      let a = seed >>> 0
      return function next() {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }
    // 每个"方向"（共现长出来的簇）一个色相。黄金角散开，相邻簇也不会撞色。
    // 五个方向色：蓝 / 黄 / 紫 / 绿 / 红
    const DIR_COLORS = ['82,140,255', '255,201,74', '164,107,255', '74,222,128', '255,92,108']
    const HUE_STEP = 137.508
    function hslToRgb(h, s, l) {
      const c = (1 - Math.abs(2 * l - 1)) * s
      const hp = h / 60
      const x = c * (1 - Math.abs((hp % 2) - 1))
      let r = 0
      let g = 0
      let b = 0
      if (hp < 1) { r = c; g = x; b = 0 }
      else if (hp < 2) { r = x; g = c; b = 0 }
      else if (hp < 3) { r = 0; g = c; b = x }
      else if (hp < 4) { r = 0; g = x; b = c }
      else if (hp < 5) { r = x; g = 0; b = c }
      else { r = c; g = 0; b = x }
      const m = l - c / 2
      return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
    }

    const DUST = (() => {
      const rand = seededRng(20261028)
      const out = []
      for (let i = 0; i < 220; i += 1) {
        out.push({ x: rand(), y: rand(), s: 0.4 + rand() * 1.2, a: 0.03 + rand() * 0.1, p: rand() * 6.283, w: 0.25 + rand() * 0.8 })
      }
      return out
    })()

    function prepare(branch, hull, rings) {
      if (!branch || !branch.nodes || !branch.nodes.length) {
        return { nodes: [], edges: [], adj: [], rings: [], hull: [] }
      }
      const scoreOf = (n) => n.c * (0.45 + 0.55 * n.r) * (0.6 + 0.8 * (n.h || 0))
      const ranked = branch.nodes
        .map((n, i) => [i, scoreOf(n)])
        .sort((a, b) => b[1] - a[1])
      // 枢纽 = 此刻最响的一小撮；其余都是背景里的细点
      const hubCount = Math.min(10, Math.max(3, Math.round(branch.nodes.length * 0.028)))
      const hubs = new Set(ranked.slice(0, hubCount).map(([i]) => i))

      // 按脑区大小排名分色：最大的蓝、第二黄、第三紫、第四绿、第五红，再循环
      const gsize = new Map()
      for (const nd of branch.nodes) {
        const gid = nd.g | 0
        gsize.set(gid, (gsize.get(gid) || 0) + 1)
      }
      const grank = [...gsize.keys()].sort((a, b) => gsize.get(b) - gsize.get(a))
      const gcolor = new Map()
      grank.forEach((gid, i) => gcolor.set(gid, DIR_COLORS[i % DIR_COLORS.length]))
      const toneOf = (gid) => gcolor.get(gid) || DIR_COLORS[0]

      const nodes = branch.nodes.map((n, i) => {
        const hub = hubs.has(i)
        const weight = Math.min(1, Math.log1p(n.c) / 3)
        return {
          ...n,
          hub,
          score: scoreOf(n),
          // 方向色：同一个共现簇 = 同一个方向 = 同一种颜色的光
          tone: toneOf(n.g | 0),
          soft: toneOf(n.g | 0)
            .split(',')
            .map((v) => Math.round(Number(v) + (255 - Number(v)) * 0.32))
            .join(','),
          heat: n.h || 0,
          dot: (1.5 + 1.7 * weight) * (0.9 + 0.5 * (n.h || 0)),
          glow: hub ? (32 + 36 * weight) * (0.85 + 0.5 * (n.h || 0)) : 0,
          alpha: 0.12 + 0.88 * Math.pow(n.r, 0.9),
          // 遗忘不是"变暗"，是失焦：越靠外抖得越厉害、边缘越毛
          haze: Math.max(0, Math.min(1, 1 - Math.pow(n.r, 0.75))),
          // 一个概念不是一个点，是一小簇——像胞体带几根突起。
          // 记得越清楚的簇越紧，快忘的散成一团。
          sat: (() => {
            const heat = n.h || 0
            const haze = Math.max(0, Math.min(1, 1 - Math.pow(n.r, 0.75)))
            const rand = seededRng(hashStr(n.t))
            const count = 4 + Math.round(heat * 3 + (1 - haze) * 2)
            const spread = 1.15 + haze * 3.4
            const out = []
            for (let k = 0; k < count; k += 1) {
              const a = rand() * Math.PI * 2
              const rr = Math.sqrt(rand()) * spread
              out.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.45 + rand() * 0.55])
            }
            return out
          })(),
        }
      })
      // 事件点：比概念点略大一点，暖色=记住的事，冷色=自己学的
      for (const e of branch.events || []) {
        nodes.push({
          t: e.t, full: e.full, x: e.x, y: e.y, z: e.z, r: e.r, a: e.a, hits: 0,
          ev: true,
          tone: e.k === 'w' ? '168,212,255' : '242,206,152',
          soft: e.k === 'w' ? '198,226,255' : '250,228,196',
          heat: 0.5,
          haze: 1 - e.r,
          hub: false,
          alpha: 0.35 + 0.65 * e.r,
          dot: 2.7,
          glow: 0,
          sat: [],
        })
      }

      const edges = (branch.edges || []).filter(([a, b]) => nodes[a] && nodes[b])
      const adj = nodes.map(() => [])
      let maxW = 1
      for (const [a, b, w] of edges) {
        if (w > maxW) maxW = w
        adj[a].push(b)
        adj[b].push(a)
      }
      const meanHull = (hull && hull.length ? hull.reduce((a, p) => a + p[3], 0) / hull.length : 0.75) || 0.75
      return { nodes, edges, adj, maxW, meanHull, hubs, rings: [], hull: [] }
    }

    function rotatePoint(x, y, z, yaw, pitch) {
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      const x1 = x * cy - z * sy
      const z1 = x * sy + z * cy
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const y1 = y * cp - z1 * sp
      const z2 = y * sp + z1 * cp
      return [x1, y1, z2]
    }

    // ---------- 一个大脑 ----------
    function BrainCanvas({ geom, picked, onPick, label }) {
      const canvasRef = useRef(null)
      const wrapRef = useRef(null)
      const view = useRef({ yaw: 0.6, pitch: -0.2, zoom: 1, hover: null, mx: 0, my: 0 })
      const geomRef = useRef(geom)
      const pickedRef = useRef(picked)
      const focusRef = useRef({ id: -1, at: 0, next: 0 })
      const pickRef = useRef(onPick)
      pickRef.current = onPick
      const projectRef = useRef(null)

      geomRef.current = geom
      pickedRef.current = picked

      useEffect(() => {
        const canvas = canvasRef.current
        const wrap = wrapRef.current
        if (!canvas || !wrap) return undefined
        const ctx = canvas.getContext('2d')
        const spriteCache = new Map()
        const spriteFor = (tone) => {
          let sp = spriteCache.get(tone)
          if (!sp) {
            sp = makeSprite(tone)
            spriteCache.set(tone, sp)
          }
          return sp
        }
        let dpr = Math.min(2, window.devicePixelRatio || 1)
        let width = 0
        let height = 0

        let nebula = null
        const buildNebula = (w, h, ratio) => {
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(w * ratio))
          c.height = Math.max(1, Math.round(h * ratio))
          const g2 = c.getContext('2d')
          g2.scale(ratio, ratio)
          g2.fillStyle = '#000'
          g2.fillRect(0, 0, w, h)
          const sky = g2.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.max(w, h) * 0.8)
          sky.addColorStop(0, 'rgba(18,32,56,0.55)')
          sky.addColorStop(0.4, 'rgba(9,18,33,0.3)')
          sky.addColorStop(1, 'rgba(0,0,0,0)')
          g2.fillStyle = sky
          g2.fillRect(0, 0, w, h)
          const blobs = [
            { x: 0.16, y: 0.2, r: 0.62, c: '92,104,226', a: 0.085 },
            { x: 0.86, y: 0.3, r: 0.5, c: '44,152,186', a: 0.07 },
            { x: 0.66, y: 0.8, r: 0.66, c: '146,72,182', a: 0.075 },
            { x: 0.28, y: 0.74, r: 0.46, c: '44,92,168', a: 0.06 },
            { x: 0.5, y: 0.5, r: 0.34, c: '60,120,190', a: 0.05 },
          ]
          for (const bl of blobs) {
            const rad = Math.max(w, h) * bl.r
            const bg2 = g2.createRadialGradient(bl.x * w, bl.y * h, 0, bl.x * w, bl.y * h, rad)
            bg2.addColorStop(0, `rgba(${bl.c},${bl.a})`)
            bg2.addColorStop(0.45, `rgba(${bl.c},${(bl.a * 0.42).toFixed(3)})`)
            bg2.addColorStop(1, `rgba(${bl.c},0)`)
            g2.fillStyle = bg2
            g2.fillRect(0, 0, w, h)
          }
          return c
        }

        const resize = () => {
          const rect = wrap.getBoundingClientRect()
          width = Math.max(120, Math.round(rect.width))
          height = Math.max(120, Math.round(rect.height))
          dpr = Math.min(2, window.devicePixelRatio || 1)
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
          ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
          nebula = buildNebula(width, height, canvas.width / width)
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(wrap)

        let raf = 0
        let last = performance.now()
        const start = last

        const frame = (now) => {
          const dt = Math.min(64, now - last)
          last = now
          const g = geomRef.current
          const v = view.current
          const t = (now - start) / 1000

          v.yaw += dt * 0.00016
          const pitch = v.pitch + Math.sin(t * 0.23) * 0.05
          const cx = width / 2
          const cy = height * 0.47
          // 放大 = 相机沿 z 往前走，半径固定；否则"推近 + 撑图"叠加永远进不去
          const dist = Math.max(0.22, 3.4 - Math.max(0, v.zoom - 1) * 0.45)
          const R = Math.min(width, height) * 0.62

          // 用设备像素全清，避免非整数 DPR 下边缘留 1px 残影
          ctx.save()
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.restore()

          // ① 深空底
          if (nebula) ctx.drawImage(nebula, 0, 0, width, height)
          else {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, width + 1, height + 1)
          }

          // ② 浮尘
          for (let d = 0; d < DUST.length; d += 1) {
            const du = DUST[d]
            const tw = 0.45 + 0.55 * Math.sin(t * du.w + du.p)
            ctx.globalAlpha = du.a * tw
            ctx.fillStyle = 'rgba(186,214,255,1)'
            ctx.fillRect(du.x * width, du.y * height, du.s, du.s)
          }
          ctx.globalAlpha = 1

          // ③ 暗角
          const vig = ctx.createRadialGradient(width / 2, height * 0.46, Math.min(width, height) * 0.24, width / 2, height * 0.46, Math.max(width, height) * 0.72)
          vig.addColorStop(0, 'rgba(0,0,0,0)')
          vig.addColorStop(0.55, 'rgba(0,0,0,0.22)')
          vig.addColorStop(1, 'rgba(0,0,0,0.72)')
          ctx.fillStyle = vig
          ctx.fillRect(0, 0, width, height)

          const project = (x, y, z) => {
            const [px, py, pz] = rotatePoint(x, y, z, v.yaw, pitch)
            const s = dist / (dist - pz)
            return [cx + px * R * s, cy + py * R * s, s, pz]
          }
          projectRef.current = project

          // 中心柔光：半径锁死，不会跑出屏幕（同心环和扩散脉冲都会在画面里
          // 变成一条横贯的弧线，用户看到的就是那条"莫名其妙的线"）
          const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.42)
          coreGlow.addColorStop(0, 'rgba(118,176,245,0.07)')
          coreGlow.addColorStop(0.55, 'rgba(96,146,210,0.03)')
          coreGlow.addColorStop(1, 'rgba(80,120,180,0)')
          ctx.fillStyle = coreGlow
          ctx.beginPath()
          ctx.arc(cx, cy, R * 0.42, 0, Math.PI * 2)
          ctx.fill()

          // 脑壳与等值环都不要了：参考图是一团没有边界的东西，
          // "越老越往外"靠点的疏密和亮度表达，不靠刻度线。
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1

          // 突触
          const focus = focusRef.current
          if (now > focus.next) {
            focus.next = now + 1500 + Math.random() * 900
            const pool = g.nodes
              .map((n, i) => [i, n.c])
              .sort((p, q) => q[1] - p[1])
              .slice(0, 28)
            focus.id = pool.length ? pool[Math.floor(Math.random() * pool.length)][0] : -1
            focus.at = now
          }
          const focusAge = now - focus.at
          const focusEnv = focus.id >= 0
            ? Math.max(0, 1 - Math.pow(Math.max(0, focusAge - 260) / 1500, 1.4))
            : 0
          const focused = new Set()
          if (focus.id >= 0) {
            focused.add(focus.id)
            for (const nb of g.adj[focus.id] || []) focused.add(nb)
          }

          // 每帧只投影一次，点和丝共用——两个脑子同时在画，这里省下来的都是帧率
          const count = g.nodes.length
          const px = new Float32Array(count)
          const py = new Float32Array(count)
          const pscale = new Float32Array(count)
          const pdepth = new Float32Array(count)
          for (let i = 0; i < count; i += 1) {
            const n = g.nodes[i]
            const [sx, sy, s, pz] = project(n.x, n.y, n.z)
            px[i] = sx
            py[i] = sy
            pscale[i] = s
            pdepth[i] = (pz + 1.1) / 2.2
          }
          // 让云的重心落在画面中心，不然会歪到一角
          // 质心居中：跳过被相机丢掉的点（NaN），否则整帧变 NaN
          let mcount = 0
          let mx = 0
          let my = 0
          for (let i = 0; i < count; i += 1) {
            if (!Number.isFinite(px[i]) || !Number.isFinite(py[i])) continue
            mx += px[i]
            my += py[i]
            mcount += 1
          }
          if (mcount) {
            mx /= mcount
            my /= mcount
            const ox = cx - mx
            const oy = cy - my
            for (let i = 0; i < count; i += 1) {
              if (!Number.isFinite(px[i]) || !Number.isFinite(py[i])) continue
              px[i] += ox
              py[i] += oy
            }
          }
          const order = new Array(count)
          for (let i = 0; i < count; i += 1) order[i] = i
          order.sort((p, q) => pdepth[p] - pdepth[q])

          ctx.globalCompositeOperation = 'source-over'
          ctx.lineWidth = 0.6
          for (let e = 0; e < g.edges.length; e += 1) {
            const [a, b, w] = g.edges[e]
            // NaN/Infinity 坐标会让 canvas 画出一条横穿屏幕的线
            if (!Number.isFinite(px[a]) || !Number.isFinite(py[a]) || !Number.isFinite(px[b]) || !Number.isFinite(py[b])) continue
            const depth = (pdepth[a] + pdepth[b]) / 2
            // 细到几乎看不见的丝：参考图里线只是纹理，不能压过点
            let alpha = Math.pow(w / g.maxW, 0.7) * 0.17 * (0.3 + 0.7 * depth)
            if (focused.has(a) && focused.has(b)) alpha += 0.3 * focusEnv
            if (alpha < 0.008) continue
            const na = g.nodes[a]
            const nb = g.nodes[b]
            const accent = na.hub && na.alpha > nb.alpha ? na : nb.hub ? nb : null
            ctx.strokeStyle = accent
              ? `rgba(${accent.tone},${(alpha * 1.6).toFixed(3)})`
              : `rgba(${na.soft},${alpha.toFixed(3)})`
            ctx.beginPath()
            ctx.moveTo(px[a], py[a])
            ctx.lineTo(px[b], py[b])
            ctx.stroke()
          }

          // 神经元：先铺光晕（加分混合），再落锐点（正常混合）。
          // 反过来做的话，几百个小点会被自己的辉光糊成一团雾。
          ctx.globalCompositeOperation = 'lighter'
          for (let k = 0; k < count; k += 1) {
            const i = order[k]
            const n = g.nodes[i]
            if (!n.hub) continue
            const sprite = spriteFor(n.tone)
            if (!sprite) continue
            const depth = pdepth[i]
            const breathe = 0.88 + 0.12 * Math.sin(t * 1.6 + i * 1.7)
            const pulse = focused.has(i) ? 1 + 0.5 * focusEnv : 1
            const box = n.glow * pscale[i] * breathe * pulse
            const core = Math.min(1, Math.max(0.5, (0.3 + 0.45 * n.alpha) * (0.4 + 0.6 * depth)) * (0.75 + 0.4 * n.heat))
            const wide = box * 2.2
            ctx.globalAlpha = core * 0.26
            ctx.drawImage(sprite, px[i] - wide / 2, py[i] - wide / 2, wide, wide)
            ctx.globalAlpha = core
            ctx.drawImage(sprite, px[i] - box / 2, py[i] - box / 2, box, box)
          }

          ctx.globalCompositeOperation = 'source-over'
          for (let k = 0; k < count; k += 1) {
            const i = order[k]
            const n = g.nodes[i]
            const depth = pdepth[i]
            const haze = n.haze
            // 抖动 = 记忆不稳：越糊的点飘得越明显
            const jx = Math.sin(t * 0.8 + i * 2.1) * haze * 3.6
            const jy = Math.cos(t * 1.05 + i * 1.3) * haze * 3.6
            const x = px[i] + jx
            const y = py[i] + jy
            let alpha = n.alpha * (0.6 + 0.4 * depth) * (0.9 + 0.35 * n.heat)
            if (n.hub) alpha = Math.min(1, alpha + 0.45)
            if (focused.has(i) && now - focus.at < 2600) alpha = Math.min(1, alpha + 0.4 * focusEnv)
            if (i === pickedRef.current) alpha = 1
            if (alpha < 0.03) continue

            const size = Math.min(30, Math.max(1, (n.hub ? 2.9 : n.dot) * pscale[i] * (0.7 + 0.55 * depth)))

            if (n.ev) {
              const es = Math.max(2.2, size * 1.35)
              ctx.globalAlpha = Math.min(0.42, alpha * 0.3)
              ctx.drawImage(glowSprite(n.soft), x - es * 2.6, y - es * 2.6, es * 5.2, es * 5.2)
              ctx.globalAlpha = Math.min(1, alpha)
              ctx.fillStyle = `rgb(${n.tone})`
              ctx.beginPath()
              ctx.arc(x, y, es * 0.5, 0, Math.PI * 2)
              ctx.fill()
              continue
            }
            if (n.hub) {
              ctx.globalAlpha = alpha
              ctx.fillStyle = `rgb(${n.tone})`
              ctx.beginPath()
              ctx.arc(x, y, size * 0.58, 0, Math.PI * 2)
              ctx.fill()
              ctx.globalAlpha = Math.min(1, alpha * 0.95)
              ctx.fillStyle = 'rgba(255,255,255,0.92)'
              ctx.beginPath()
              ctx.arc(x, y, size * 0.24, 0, Math.PI * 2)
              ctx.fill()
              continue
            }

            if (haze < 0.42) {
              // 记得清楚：一簇锐利的小点，带着它那个方向的颜色，外面裹一层薄光
              const dot = dotSprite(n.soft)
              // 整簇的柔光用同一张圆贴图铺，不能用 fillRect
              if (n.heat > 0.4) {
                const haloBox = size * 7
                ctx.globalAlpha = alpha * 0.1
                ctx.drawImage(dot, x - haloBox / 2, y - haloBox / 2, haloBox, haloBox)
              }
              for (let q = 0; q < n.sat.length; q += 1) {
                const [ox, oy, aw] = n.sat[q]
                ctx.globalAlpha = alpha * 0.72 * aw
                const dx = x + ox * pscale[i]
                const dy = y + oy * pscale[i]
                const dd = size * 1.5
                ctx.drawImage(dot, dx - dd / 2, dy - dd / 2, dd, dd)
              }
              ctx.globalAlpha = alpha
              const d0 = size * 2
              ctx.drawImage(dot, x - d0 / 2, y - d0 / 2, d0, d0)
            } else {
              // 记不清了：散成一团雾，只剩一个更淡的核
              ctx.fillStyle = 'rgba(128,160,198,1)'
              ctx.globalAlpha = alpha * 0.085
              ctx.beginPath()
              ctx.arc(x, y, size * 4.6, 0, Math.PI * 2)
              ctx.fill()
              ctx.globalAlpha = alpha * 0.16
              ctx.beginPath()
              ctx.arc(x, y, size * 1.7, 0, Math.PI * 2)
              ctx.fill()
              ctx.globalAlpha = alpha * 0.3
              const dd = size * 1.1
              ctx.drawImage(dotSprite(DOT_RGB), x - dd / 2, y - dd / 2, dd, dd)
            }
          }

          // 名字：放大到一定程度就把所有点的名字都放出来，做简单避让
          ctx.globalCompositeOperation = 'source-over'
          const detail = v.zoom > 1.75
          const labelSize = v.zoom > 2.2 ? 11 : 10
          ctx.font = `italic ${labelSize}px ui-sans-serif, system-ui, "PingFang SC", sans-serif`
          const placed = []
          const cand = []
          for (let ci = 0; ci < count; ci += 1) {
            const nd = g.nodes[ci]
            if (nd.alpha < 0.16) continue
            if (!detail && !nd.hub && ci !== pickedRef.current && v.hover !== ci) continue
            cand.push(ci)
          }
          cand.sort(
            (a2, b2) =>
              g.nodes[b2].alpha * (0.6 + g.nodes[b2].heat) - g.nodes[a2].alpha * (0.6 + g.nodes[a2].heat),
          )
          for (const i of cand) {
            const n = g.nodes[i]
            const tx = px[i] + 5
            const ty = py[i] + 3
            const labelText = n.ev ? n.t.slice(0, 7) : n.t
            const tw = labelText.length * labelSize * 1.05 + 6
            if (tx < 4 || tx + tw > width - 4 || ty < 40 || ty > height - 34) continue
            let clash = false
            for (const r0 of placed) {
              if (tx < r0[0] + r0[2] && tx + tw > r0[0] && ty - labelSize < r0[1] && ty > r0[1] - r0[3]) {
                clash = true
                break
              }
            }
            if (clash) continue
            if (placed.length > 70) break
            placed.push([tx, ty, tw, labelSize + 2])
            const alpha = detail
              ? Math.min(0.8, 0.28 + n.alpha * 0.45)
              : Math.min(0.92, (0.28 + 0.42 * n.r) * (0.4 + 0.6 * pdepth[i]) + (n.hub ? 0.16 : 0))
            ctx.fillStyle = `rgba(${n.soft},${alpha.toFixed(3)})`
            ctx.fillText(labelText, tx, ty)
          }

          // 焦点不再画环——留白比圈更能说明"这一下亮起来的是它"。

          // 悬停
          const hover = v.hover
          if (hover !== null && g.nodes[hover]) {
            const n = g.nodes[hover]
            const [sx, sy] = project(n.x, n.y, n.z)
            ctx.beginPath()
            ctx.arc(sx, sy, 9, 0, Math.PI * 2)
            ctx.strokeStyle = 'rgba(255,255,255,0.55)'
            ctx.lineWidth = 1
            ctx.stroke()
            const text = n.t
            const sub = `${n.a < 0.04 ? '刚刚' : n.a < 1 ? `${(n.a * 24).toFixed(0)} 小时前` : `${n.a.toFixed(1)} 天前`} · 清晰 ${(n.r * 100).toFixed(0)}%`
            ctx.font = '12px ui-sans-serif, system-ui, "PingFang SC", sans-serif'
            const w = Math.max(ctx.measureText(text).width, ctx.measureText(sub).width) + 16
            const bx = Math.min(width - w - 6, Math.max(6, sx + 14))
            const by = Math.min(height - 44, Math.max(6, sy - 8))
            ctx.fillStyle = 'rgba(8,14,24,0.92)'
            ctx.strokeStyle = 'rgba(120,170,220,0.35)'
            ctx.lineWidth = 1
            ctx.beginPath()
            if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, w, 38, 6)
            else ctx.rect(bx, by, w, 38)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = 'rgba(240,248,255,0.95)'
            ctx.fillText(text, bx + 8, by + 16)
            ctx.fillStyle = 'rgba(160,190,220,0.85)'
            ctx.font = '11px ui-sans-serif, system-ui, "PingFang SC", sans-serif'
            ctx.fillText(sub, bx + 8, by + 31)
          }

          ctx.globalAlpha = 1
          raf = requestAnimationFrame(frame)
        }

        raf = requestAnimationFrame(frame)

        const pickAt = (clientX, clientY) => {
          const g = geomRef.current
          const rect = canvas.getBoundingClientRect()
          const x = clientX - rect.left
          const y = clientY - rect.top
          const project = projectRef.current
          if (!project) return null
          let best = null
          let bestD = 18
          for (let i = 0; i < g.nodes.length; i += 1) {
            const n = g.nodes[i]
            const [sx, sy] = project(n.x, n.y, n.z)
            const d = Math.hypot(sx - x, sy - y)
            if (d < bestD) {
              bestD = d
              best = i
            }
          }
          return best
        }

        let dragging = false
        let moved = 0
        let lastX = 0
        let lastY = 0

        const onDown = (ev) => {
          dragging = true
          moved = 0
          lastX = ev.clientX
          lastY = ev.clientY
          canvas.setPointerCapture?.(ev.pointerId)
        }
        const onMove = (ev) => {
          const v = view.current
          if (dragging) {
            const dx = ev.clientX - lastX
            const dy = ev.clientY - lastY
            lastX = ev.clientX
            lastY = ev.clientY
            moved += Math.abs(dx) + Math.abs(dy)
            v.yaw += dx * 0.008
            v.pitch = Math.max(-1.1, Math.min(1.1, v.pitch + dy * 0.006))
          }
          v.hover = pickAt(ev.clientX, ev.clientY)
          canvas.style.cursor = v.hover === null ? 'grab' : 'pointer'
        }
        const onUp = (ev) => {
          if (dragging && moved < 5) {
            const idx = pickAt(ev.clientX, ev.clientY)
            if (idx !== null && pickRef.current) pickRef.current(idx)
          }
          dragging = false
        }
        const onLeave = () => {
          dragging = false
          view.current.hover = null
        }
        const onWheel = (ev) => {
          ev.preventDefault()
          const v = view.current
          v.zoom = Math.max(0.45, Math.min(6, v.zoom * (ev.deltaY > 0 ? 0.92 : 1.08)))
        }

        canvas.addEventListener('pointerdown', onDown)
        canvas.addEventListener('pointermove', onMove)
        canvas.addEventListener('pointerup', onUp)
        canvas.addEventListener('pointerleave', onLeave)
        canvas.addEventListener('wheel', onWheel, { passive: false })

        return () => {
          cancelAnimationFrame(raf)
          ro.disconnect()
          canvas.removeEventListener('pointerdown', onDown)
          canvas.removeEventListener('pointermove', onMove)
          canvas.removeEventListener('pointerup', onUp)
          canvas.removeEventListener('pointerleave', onLeave)
          canvas.removeEventListener('wheel', onWheel)
        }
      }, [])

      return h(
        'div',
        { className: 'wb-canvas-wrap', ref: wrapRef },
        h('canvas', { ref: canvasRef, 'aria-label': label }),
      )
    }

    // ---------- 侧栏 ----------
    function Stat({ label, value, hint }) {
      return h(
        'div',
        { className: 'wb-stat' },
        h('span', { className: 'wb-stat-v' }, value),
        h('span', { className: 'wb-stat-l' }, label),
        hint ? h('span', { className: 'wb-stat-h' }, hint) : null,
      )
    }

    function BrainPanel({ t, onMount }) {
      const { snap, error, reload } = useSnapshot()
      useEffect(() => {
        if (typeof onMount === 'function') onMount(true)
        return () => {
          if (typeof onMount === 'function') onMount(false)
        }
      }, [onMount])
      const [active, setActive] = useState('private')
      const [picked, setPicked] = useState(null)
      const [busy, setBusy] = useState(false)
      const [learnMsg, setLearnMsg] = useState('')

      const branches = snap?.branches || {}
      const order = snap?.meta?.order || ['private', 'group']
      const activeBranch = branches[active] || branches[order[0]] || null

      const geoms = useMemo(() => {
        const out = {}
        for (const key of Object.keys(branches)) out[key] = prepare(branches[key], snap && snap.hull, snap && snap.rings)
        return out
      }, [branches, snap])

      const pickedNode = useMemo(() => {
        if (!activeBranch || picked === null) return null
        return activeBranch.nodes?.[picked] || null
      }, [activeBranch, picked])

      const learnNow = useCallback(
        async (branchId) => {
          setBusy(true)
          setLearnMsg('')
          try {
            const res = await fetch(`${API}/learn?branch=${branchId}`, { method: 'POST' })
            const data = await res.json()
            const first = data?.results?.[0]
            setLearnMsg(first?.msg || (data?.ok ? '学到了一点' : '这次没找到新东西'))
            setTimeout(reload, 600)
          } catch (err) {
            setLearnMsg(String((err && err.message) || err))
          } finally {
            setBusy(false)
          }
        },
        [reload],
      )

      const toggleAuto = useCallback(async () => {
        try {
          await fetch(`${API}/auto?on=${snap?.learn?.enabled ? 0 : 1}`, { method: 'POST' })
          setTimeout(reload, 200)
        } catch {
          /* ignore */
        }
      }, [snap, reload])

      if (error && !snap) {
        return h(
          'div',
          { className: 'wb wb-center' },
          h('div', { className: 'wb-offline' }, t('offline')),
          h('div', { className: 'wb-offline-hint' }, t('offlineHint')),
          h('div', { className: 'wb-offline-err' }, error),
        )
      }
      if (!snap) {
        return h('div', { className: 'wb wb-center' }, h('div', { className: 'wb-loading' }, t('loading')))
      }

      const autoOn = !!snap.learn?.enabled

      return h(
        'div',
        { className: 'wb' },
        h(
          'header',
          { className: 'wb-top' },
          h(
            'div',
            null,
            h('h1', { className: 'wb-title' }, t('title')),
            h('p', { className: 'wb-sub' }, t('subtitle')),
          ),
          h(
            'div',
            { className: 'wb-top-actions' },
            h(
              'button',
              {
                className: `wb-toggle ${autoOn ? 'is-on' : ''}`,
                onClick: toggleAuto,
                type: 'button',
              },
              h('span', { className: 'wb-dot' }),
              `${t('autoLearn')} · ${autoOn ? t('learnOn') : t('learnOff')}`,
            ),
          ),
        ),
        h(
          'div',
          { className: 'wb-main' },
          h(
            'div',
            { className: 'wb-brains' },
            ...order.map((key) => {
              const branch = branches[key]
              const geom = geoms[key] || { nodes: [], edges: [], adj: [], rings: [], hull: [] }
              const isActive = key === active
              return h(
                'section',
                {
                  key,
                  className: `wb-brain ${isActive ? 'is-active' : ''}`,
                  onPointerDown: () => {
                    setActive(key)
                    setPicked(null)
                  },
                },
                h(
                  'div',
                  { className: 'wb-brain-head' },
                  h(
                    'div',
                    { className: 'wb-brain-name' },
                    h('span', { className: 'wb-brain-dot' }),
                    branch?.label || t(key),
                    h('small', null, branch?.sub || ''),
                  ),
                  branch && branch.nodes.length
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'wb-mini',
                          disabled: busy,
                          onClick: (ev) => {
                            ev.stopPropagation()
                            setActive(key)
                            learnNow(key)
                          },
                        },
                        busy ? t('thinkingBusy') : t('thinking'),
                      )
                    : null,
                ),
                h(
                  'div',
                  { className: 'wb-stage' },
                  branch && branch.nodes.length
                    ? h(BrainCanvas, {
                        geom,
                        picked: isActive ? picked : null,
                        onPick: (i) => {
                          setActive(key)
                          setPicked(i)
                        },
                        label: branch.label,
                      })
                    : h('div', { className: 'wb-empty' }, t('empty')),
                  h(
                    'div',
                    { className: 'wb-legend' },
                    h('span', null, t('selfLegend')),
                    h('span', { className: 'wb-kbd' }, t('hotkey')),
                  ),
                  branch && branch.nodes.length
                    ? h(
                        'div',
                        { className: 'wb-metrics' },
                        h('b', null, branch.stats.n),
                        ' ',
                        t('neurons'),
                        h('i', null, '·'),
                        h('b', null, branch.stats.e),
                        ' ',
                        t('synapses'),
                        h('i', null, '·'),
                        h('b', null, branch.stats.forgotten),
                        ' ',
                        t('forgotten'),
                      )
                    : null,
                ),
              )
            }),
          ),
          h(
            'aside',
            { className: 'wb-side' },
            activeBranch
              ? h(
                  'div',
                  { className: 'wb-side-inner' },
                  h(
                    'div',
                    { className: 'wb-stats' },
                    h(Stat, { label: t('neurons'), value: activeBranch.stats.n }),
                    h(Stat, { label: t('synapses'), value: activeBranch.stats.e }),
                    h(Stat, { label: t('clarity'), value: `${Math.round(activeBranch.stats.meanRecall * 100)}%` }),
                    h(Stat, { label: t('units'), value: activeBranch.stats.units }),
                  ),
                  h(
                    'div',
                    { className: 'wb-block' },
                    h('h3', null, t('picked')),
                    pickedNode
                      ? h(
                          'div',
                          { className: 'wb-picked' },
                          h('div', { className: 'wb-picked-t' }, pickedNode.t),
                          h(
                            'div',
                            { className: 'wb-picked-kv' },
                            h('span', null, t('age')),
                            h('b', null, pickedNode.a < 0.04 ? t('justNow') : pickedNode.a < 1 ? `${(pickedNode.a * 24).toFixed(0)} ${t('hours')}` : `${pickedNode.a.toFixed(1)} ${t('days')}`),
                          ),
                          h(
                            'div',
                            { className: 'wb-picked-kv' },
                            h('span', null, t('recall')),
                            h('b', null, `${Math.round(pickedNode.r * 100)}%`),
                          ),
                          h(
                            'div',
                            { className: 'wb-picked-kv' },
                            h('span', null, t('act')),
                            h('b', null, pickedNode.c.toFixed(1)),
                          ),
                          h(
                            'div',
                            { className: 'wb-picked-kv' },
                            h('span', null, t('hits')),
                            h('b', null, `${pickedNode.n}`),
                          ),
                        )
                      : h('div', { className: 'wb-dim' }, t('noPicked')),
                  ),
                  h(
                    'div',
                    { className: 'wb-block' },
                    h('h3', null, t('self')),
                    h(
                      'div',
                      { className: 'wb-chips' },
                      ...(activeBranch.self || []).slice(0, 12).map((s, i) =>
                        h('span', { key: `${s.t}-${i}`, className: 'wb-chip' }, s.t),
                      ),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'wb-block' },
                    h('h3', null, t('newest')),
                    h(
                      'div',
                      { className: 'wb-feed' },
                      ...(activeBranch.feed || []).map((f, i) =>
                        h(
                          'div',
                          { key: `${f.t}-${i}`, className: 'wb-feed-row' },
                          h('span', { className: 'wb-feed-t' }, f.t),
                          h('span', { className: 'wb-feed-a' }, f.a < 0.04 ? t('justNow') : f.a < 1 ? `${(f.a * 24).toFixed(0)} ${t('hours')}` : `${f.a.toFixed(1)} ${t('days')}`),
                        ),
                      ),
                    ),
                  ),
                  snap.meta && snap.meta.mobile
                    ? h(
                        'div',
                        { className: 'wb-block' },
                        h('h3', null, '手机访问'),
                        h('div', { className: 'wb-mobile' }, snap.meta.mobile),
                        h('div', { className: 'wb-dim' }, '手机连同一个 WiFi，扫开这条链接'),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'wb-block' },
                    h('h3', null, t('lastLearn')),
                    h(
                      'div',
                      { className: 'wb-learn' },
                      (activeBranch.stats && snap.learn?.branches?.[activeBranch.id]?.last)
                        ? h(
                            'div',
                            null,
                            h('b', null, snap.learn.branches[activeBranch.id].last.topic || '—'),
                            h('span', null, snap.learn.branches[activeBranch.id].last.msg || ''),
                          )
                        : h('div', { className: 'wb-dim' }, '还没自己去学过'),
                      learnMsg ? h('div', { className: 'wb-learn-msg' }, learnMsg) : null,
                    ),
                  ),
                )
              : null,
          ),
        ),
      )
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { err: null }
      }
      static getDerivedStateFromError(error) {
        return { err: String((error && error.message) || error) }
      }
      render() {
        if (this.state.err) {
          return h(
            'div',
            { className: 'wb wb-center' },
            h('div', { className: 'wb-offline' }, '面板渲染出错'),
            h('div', { className: 'wb-offline-hint' }, '宿主数据还在，刷新页面再看一眼。'),
            h('div', { className: 'wb-offline-err' }, this.state.err),
          )
        }
        return this.props.children
      }
    }

    // ---------- 样式 ----------
    const CSS = `
.wb{display:flex;flex-direction:column;height:100%;min-height:520px;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif}
.wb-center{align-items:center;justify-content:center;gap:8px;text-align:center;padding:40px}
.wb-offline{font-size:15px;font-weight:600}
.wb-offline-hint{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:420px}
.wb-offline-err{font-size:11px;color:var(--dsw-alias-state-warn-primary);font-family:ui-monospace,monospace}
.wb-loading{font-size:13px;color:var(--dsw-alias-label-secondary)}
.wb-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:18px 22px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.wb-title{margin:0;font-size:17px;font-weight:650;letter-spacing:.2px}
.wb-sub{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.wb-top-actions{display:flex;gap:8px}
.wb-toggle{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
.wb-toggle:hover{background:var(--dsw-alias-bg-layer-2)}
.wb-toggle.is-on{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}
.wb-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.wb-toggle.is-on .wb-dot{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 8px var(--dsw-alias-state-success-primary)}
.wb-main{display:flex;flex:1;min-height:0}
.wb-brains{display:flex;flex:1;min-width:0;gap:1px;background:var(--dsw-alias-border-l1)}
.wb-brain{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;background:#03060b;position:relative;transition:box-shadow .25s}
.wb-brain.is-active{box-shadow:inset 0 0 0 1px rgba(110,180,230,.35)}
.wb-brain-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px 9px;position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none}
.wb-brain-name{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:rgba(226,240,255,.92);text-shadow:0 1px 6px rgba(0,0,0,.8)}
.wb-brain-name small{font-weight:400;font-size:11px;color:rgba(150,185,220,.62)}
.wb-brain-dot{width:6px;height:6px;border-radius:50%;background:#6fd2ff;box-shadow:0 0 10px #6fd2ff}
.wb-brain.is-active .wb-brain-dot{background:#ffcf6b;box-shadow:0 0 12px #ffcf6b}
.wb-mini{pointer-events:auto;height:24px;padding:0 9px;border-radius:6px;border:1px solid rgba(120,170,220,.3);background:rgba(10,20,34,.7);color:rgba(200,222,244,.9);font-size:11px;cursor:pointer;backdrop-filter:blur(4px)}
.wb-mini:hover{border-color:rgba(160,210,255,.6);color:#fff}
.wb-mini:disabled{opacity:.5;cursor:default}
.wb-stage{position:relative;flex:1;min-height:320px}
.wb-canvas-wrap{position:absolute;inset:0;min-height:320px}
.wb-canvas-wrap canvas{display:block;touch-action:none}
.wb-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center;color:rgba(150,180,210,.5);font-size:12px}
.wb-legend{position:absolute;left:14px;bottom:12px;display:flex;gap:10px;align-items:center;font-size:10.5px;color:rgba(140,175,210,.5);pointer-events:none}
.wb-kbd{padding:1px 6px;border-radius:4px;border:1px solid rgba(120,170,220,.25);color:rgba(160,195,228,.62);font-family:ui-monospace,monospace;font-size:10px}
.wb-metrics{position:absolute;right:14px;bottom:12px;font-size:10.5px;color:rgba(150,185,220,.6);pointer-events:none}
.wb-metrics b{color:rgba(230,242,255,.9);font-weight:600}
.wb-metrics i{margin:0 5px;font-style:normal;color:rgba(120,155,190,.4)}
.wb-side{width:268px;flex:0 0 268px;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow-y:auto}
.wb-side-inner{padding:14px}
.wb-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.wb-stat{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.wb-stat-v{font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}
.wb-stat-l{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.wb-block{margin-bottom:15px}
.wb-block h3{margin:0 0 7px;font-size:11px;font-weight:600;letter-spacing:.4px;color:var(--dsw-alias-label-tertiary);text-transform:uppercase}
.wb-dim{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.wb-picked{padding:10px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.wb-picked-t{font-size:15px;font-weight:650;margin-bottom:7px}
.wb-picked-kv{display:flex;justify-content:space-between;font-size:11.5px;padding:2px 0;color:var(--dsw-alias-label-secondary)}
.wb-picked-kv b{font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.wb-chips{display:flex;flex-wrap:wrap;gap:5px}
.wb-chip{padding:3px 8px;border-radius:20px;font-size:11px;background:rgba(255,205,110,.1);color:#ffcf6b;border:1px solid rgba(255,205,110,.25)}
.wb-feed{display:flex;flex-direction:column;gap:3px}
.wb-feed-row{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:3px 0;border-bottom:1px dashed var(--dsw-alias-border-l1)}
.wb-feed-row:last-child{border-bottom:0}
.wb-feed-t{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-feed-a{color:var(--dsw-alias-label-tertiary);flex:0 0 auto;font-variant-numeric:tabular-nums}
.wb-learn{font-size:11.5px;display:flex;flex-direction:column;gap:3px}
.wb-learn b{font-weight:600}
.wb-learn span{color:var(--dsw-alias-label-secondary);margin-left:6px}
.wb-learn-msg{color:var(--dsw-alias-brand-primary);font-size:11px}
.wb-mobile{font-size:10.5px;line-height:1.5;word-break:break-all;user-select:all;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:7px 8px;margin-bottom:4px}
@media (max-width:900px){.wb-main{flex-direction:column}.wb-brains{flex-direction:column}.wb-side{width:auto;flex:0 0 auto;border-left:0;border-top:1px solid var(--dsw-alias-border-l1);max-height:38%}}
`

    function StyleTag() {
      return h('style', null, CSS)
    }

    const NAV_ICON_MAIN = 'M10 18c-3.3 0-6-2.4-6-5.4 0-2.6 1.9-4.7 4.5-5.2C9.3 4.8 11.7 3 14.5 3c3.1 0 5.6 2.3 5.9 5.2C22.6 8.7 24 10.5 24 12.6c0 2.9-2.7 5.2-6 5.2'
    const NAV_ICON_TAIL = 'M18.5 17.6c.9 1.3 2.2 2.1 3.7 2.4'

    function NavIcon({ size = 16 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 32 32',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: NAV_ICON_MAIN,
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M16 7v11M11 11.5v6M21 11.5v6',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          opacity: 0.75,
        }),
        h('path', {
          d: NAV_ICON_TAIL,
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      )
    }

    function Hero() {
      return h(
        'div',
        { className: 'wb wb-center' },
        h(NavIcon, { size: 42 }),
        h('div', { className: 'wb-loading' }, '小鲸鱼·粒子大脑'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const PANEL_ID = 'whale-brain'
        let layout = null
        let panelOpen = false
        const setPanelOpen = (v) => {
          panelOpen = v
        }

        let t = (key) => TEXT.zh[key] ?? key
        try {
          const loc = ctx.get('locale')
          if (loc && typeof loc.register === 'function' && typeof loc.bind === 'function') {
            const own = typeof ctx.effect === 'function' ? ctx.effect.bind(ctx) : (fn) => fn()
            own(() => loc.register(NS, 'zh', TEXT.zh))
            own(() => loc.register(NS, 'en', TEXT.en))
            const bound = loc.bind(NS)
            t = (key) => {
              const value = bound(key)
              return value === key ? TEXT.zh[key] ?? key : value
            }
          }
        } catch {
          /* 没有 locale 服务就用中文直出 */
        }

        // —— 快捷打开 ——
        // ① 全局快捷键 Ctrl+Shift+B：不在输入框里时开关这颗脑子
        // ② URL 带 #whale-brain：双击脚本直达
        const togglePanel = () => {
          if (!layout) return
          try {
            layout.selectPanel(panelOpen ? null : PANEL_ID)
          } catch {
            /* layout 没准备好就算了 */
          }
        }

        const openFromHash = () => {
          if (!layout) return
          if (window.location.hash.replace('#', '') !== PANEL_ID) return
          try {
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
          } catch {
            /* 某些壳不允许改历史，忽略 */
          }
          try {
            layout.selectPanel(PANEL_ID)
          } catch {
            /* 同上 */
          }
        }

        try {
          layout = ctx.get('layout') || null
        } catch {
          layout = null
        }
        if (!layout) {
          try {
            ctx.inject(['layout'], (scoped) => {
              layout = scoped.layout
              setTimeout(openFromHash, 400)
            })
          } catch {
            /* 没有 layout 服务时只有图标入口 */
          }
        }

        const ownEffect = typeof ctx.effect === 'function' ? (fn) => ctx.effect(fn) : (fn) => fn()
        // 兜底：effect 服务行为不合预期时也绝不让 apply 抛出去——抛了就连侧栏图标一起没了。
        const safeEffect = (fn) => {
          try {
            return ownEffect(fn)
          } catch {
            try {
              return fn()
            } catch {
              return undefined
            }
          }
        }
        safeEffect(() => {
          const onKey = (ev) => {
            if (!ev.ctrlKey || !ev.shiftKey || ev.altKey || ev.metaKey) return
            if (String(ev.key).toLowerCase() !== 'b') return
            const el = ev.target
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
            ev.preventDefault()
            ev.stopPropagation()
            togglePanel()
          }
          const onHash = () => openFromHash()
          window.addEventListener('keydown', onKey, true)
          window.addEventListener('hashchange', onHash)
          // layout 服务可能比我们晚就绪，多试几次，进了面板就停
          const kicks = [400, 1200, 2600, 5000].map((ms) => setTimeout(openFromHash, ms))
          return () => {
            for (const k of kicks) clearTimeout(k)
            window.removeEventListener('keydown', onKey, true)
            window.removeEventListener('hashchange', onHash)
          }
        })

        // 桌面快捷方式通过宿主的 /whale-brain/open 打信号过来：每 2.5 秒问一次。
        // 不依赖键盘焦点，窗口被别的程序挡着也能切。
        let lastOpen = -1
        safeEffect(() => {
          const tickOpen = async () => {
            try {
              const res = await fetch(`${API}/open?since=${lastOpen < 0 ? 0 : lastOpen}`, { cache: 'no-store' })
              const data = await res.json()
              if (lastOpen < 0) {
                lastOpen = data.signal || 0
                return
              }
              if ((data.signal || 0) > lastOpen) {
                lastOpen = data.signal
                if (layout) layout.selectPanel(PANEL_ID)
              }
            } catch {
              /* 宿主没起来就算了，下一轮再问 */
            }
          }
          const timer = setInterval(tickOpen, 2500)
          return () => clearInterval(timer)
        })

        ctx.slots.inject('main', () =>
            ctx.slots.register({ name: 'main', key: 'whale-brain' }, () =>
              h(React.Fragment, null, h(StyleTag), h(Boundary, null, h(BrainPanel, { t, onMount: setPanelOpen }))),
          ),
        )

        ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: 'whale-brain',
                order: 2,
                label: () => t('nav'),
              },
            (owner) => h(NavIcon, { size: (owner && owner.size) || 16 }),
          ),
        )
      },
    }
  },
})
