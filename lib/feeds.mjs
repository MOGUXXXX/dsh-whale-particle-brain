// 广撒网：从公开接口抓"外面正在发生什么"，喂给这个脑子当经验。
//
// 三条线：
//   meme    —— B站热榜标题 + 贴吧热议，网络流行语的源头。标题本身就是梗的浓缩。
//   anime   —— 一言的「动画」分类，日漫台词与语气。
//   thought —— 一言的「文学 / 哲学 / 诗词」分类，用来长思想深度。
//
// 只用公开、无需登录的接口；抖音要签名，抓不了，就不抓，不假装抓了。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'
const TIMEOUT = 8000

async function getJSON(url, headers = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*', ...headers },
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** B站热榜：标题通常是"一个梗 + 一个槽点"的压缩体，适合当语料。 */
export async function biliHot(limit = 8) {
  const j = await getJSON('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all')
  const list = (j && j.data && j.data.list) || []
  return list
    .slice(0, limit)
    .map((v) => ({
      text: String(v.title || '').trim(),
      from: 'B站热榜',
      url: v.bvid ? `https://www.bilibili.com/video/${v.bvid}` : v.short_link_v2 || '',
    }))
    .filter((x) => x.text.length >= 4)
}

/** 贴吧热议：更糙、更接近群聊语感。 */
export async function tiebaHot(limit = 8) {
  const j = await getJSON('https://tieba.baidu.com/hottopic/browse/topicList')
  const list = (j && j.data && j.data.bang_topic && j.data.bang_topic.topic_list) || []
  return list
    .slice(0, limit)
    .map((t) => ({
      text: String(t.topic_name || '').trim(),
      from: '贴吧热议',
      url: t.topic_url || '',
    }))
    .filter((x) => x.text.length >= 2)
}

// 一言分类：a=动画 b=漫画 c=游戏 d=文学 i=诗词 k=哲学
const HITO_CATS = { anime: ['a'], thought: ['k', 'd', 'i'] }

async function oneQuote(cat) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const j = await getJSON(`https://v1.hitokoto.cn/?c=${encodeURIComponent(cat)}`)
      const text = String((j && j.hitokoto) || '').trim()
      if (text.length >= 6) {
        return { text, from: (j && j.from) || '', url: '', who: (j && j.from_who) || '' }
      }
    } catch {
      // 这一类偶尔空返回，换一次再试
    }
  }
  return null
}

/**
 * B站番剧：排行拿片名/评分，详情拿类型标签和剧情简介。
 * 这样"看日漫"学到的是「这是什么番、讲什么、什么类型」，而不是只记住几个片名。
 * 详情接口偶尔 412，失败就退回排行里的 desc（"更新至第 N 话"），不编造。
 */
export async function biliAnime(limit = 6) {
  // 日榜/三日榜/周榜换着看：同一张榜三天不变，不换的话每次学到的是同一批
  const day = [1, 3, 7][Math.floor(Math.random() * 3)]
  const j = await getJSON('https://api.bilibili.com/pgc/season/rank/web/list?season_type=1&day=' + day, {
    Referer: 'https://www.bilibili.com',
  })
  const list = ((j && j.data && j.data.list) || []).slice(0, limit * 2)
  const out = []
  const seenBase = new Set()
  for (const it of list) {
    if (out.length >= limit) break
    const title = String(it.title || '').trim()
    if (!title) continue
    // 同一部番的"中配版"只留一条
    const base = title.replace(/[（(].*?[）)]/g, '').replace(/中文配音|中配|国语/g, '').trim()
    if (seenBase.has(base)) continue
    // 评分在排行里已经是 "9.4分" 这种字符串
    const score = String(it.rating || '').trim()
    let extra = ''
    let area = ''
    try {
      const d = await getJSON(`https://api.bilibili.com/pgc/view/web/season?season_id=${it.season_id}`, {
        Referer: 'https://www.bilibili.com',
      })
      const r = (d && d.result) || {}
      area = ((r.areas || [])[0] && r.areas[0].name) || ''
      const styles = (r.styles || []).slice(0, 2).join('/')
      const ev = String(r.evaluate || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 56)
      extra = [styles, ev].filter(Boolean).join(' · ')
    } catch {
      extra = String(it.desc || '').replace(/<[^>]+>/g, '').slice(0, 40)
    }
    // 只要日本动画：B站番剧区里混着欧美动画，那些不算"看日漫"
    if (area && area !== '日本') continue
    seenBase.add(base)
    out.push({
      text: ('《' + title + '》' + score + (extra ? ' ' + extra : '')).trim(),
      from: 'B站番剧',
      url: it.url || '',
    })
  }
  return out
}

/** 一言：动画=日漫语气，文学/哲学/诗词=思想深度。 */
export async function hitokoto(kind, n = 3) {
  const cats = HITO_CATS[kind] || ['d']
  const out = []
  for (let i = 0; i < n; i += 1) {
    const cat = cats[i % cats.length]
    const q = await oneQuote(cat)
    if (q) out.push({ ...q, from: q.from ? `《${q.from}》` : '一言' })
  }
  return out
}

/**
 * 抓一批"外面正在发生的事"。
 * @param {'meme'|'anime'|'thought'} kind
 * @returns {Promise<{kind:string, items:Array<{text:string,from:string,url:string}>, errors:string[]}>}
 */
export async function harvest(kind) {
  const errors = []
  let items = []
  if (kind === 'meme') {
    const [bili, tieba] = await Promise.allSettled([biliHot(6), tiebaHot(6)])
    if (bili.status === 'fulfilled') items.push(...bili.value)
    else errors.push(`B站：${bili.reason?.message || bili.reason}`)
    if (tieba.status === 'fulfilled') items.push(...tieba.value)
    else errors.push(`贴吧：${tieba.reason?.message || tieba.reason}`)
  } else if (kind === 'anime') {
    // 主体是 B站的番：知道现在播什么、什么类型、讲什么
    const [bili, lines] = await Promise.allSettled([biliAnime(5), hitokoto('anime', 2)])
    if (bili.status === 'fulfilled') items.push(...bili.value)
    else errors.push(`番剧：${bili.reason?.message || bili.reason}`)
    // 台词是学语气的，少量即可
    if (lines.status === 'fulfilled') items.push(...lines.value)
    else errors.push(`台词：${lines.reason?.message || lines.reason}`)
  } else {
    try {
      items = await hitokoto(kind, kind === 'thought' ? 4 : 3)
    } catch (e) {
      errors.push(`一言：${e?.message || e}`)
    }
  }
  // 同一条内容别重复喂
  const seen = new Set()
  items = items.filter((x) => {
    if (!x.text || seen.has(x.text)) return false
    seen.add(x.text)
    return true
  })
  return { kind, items, errors }
}
