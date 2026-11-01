// 灵感的来源。
//
// 不放一堆写死的句子——那样看两天就腻，而且一眼假。这里用**组合生成**：
// 把「具体的物 / 动作 / 场景」拆成词池，按几种句式拼，再按"具体程度"打分。
// 于是同一个句式能长出几千种说法，而且大多数是真的能想到的念头，
// 不是那种"人生有什么意义"式的空话。
//
// 想要更远的东西时，可以接外面的检索（见 index.js 的 fetchInspiration），
// 但默认不联网也能自给自足——这是它能一直活着的底线。

const PLACES = ['凌晨的便利店', '开往终点的末班地铁', '下雨的旧书店', '医院的走廊', '天台', '绿皮火车的餐车', '海边废弃的栈桥', '早上六点的菜市场', '关了灯的电影院', '没人的自习室', '加油站', '县城的汽车站']

const ACTIONS = ['坐一整个下午', '待到打烊', '走一整条街', '从头看到尾', '听完整张专辑', '把一本书读到卷角', '在窗边发很久的呆', '跟着陌生人的背影走一段']

const OBJECTS = ['别人的日记', '一台只会念诗的收音机', '二十年前的报纸', '一张没用过的车票', '一把没有锁孔的钥匙', '别人拍的合影', '一段没人听过的录音', '旧货市场的闹钟']

const FEELINGS = ['孤独', '后悔', '心软', '不甘心', '好奇', '舍不得', '松了一口气', '想骂人']

const SUBJECTS = ['梦', '记忆', '习惯', '后悔', '喜欢一个人', '长大', '告别', '说谎', '发呆', '重复']

const PREDICATES = ['算不算一种偷懒', '是不是一种自我保护', '到底有没有意义', '是不是只是在逃避', '能不能被训练出来', '会不会越用越少', '算不算一种作弊', '是不是一种懒惰的温柔']

const CREATE = ['拍一张照片', '录一段声音', '写一封信', '画下来', '做成一个东西', '存进一个盒子', '说给谁听']

const TEMPLATES = [
  () => `突然想去${pick(PLACES)}，${pick(ACTIONS)}`,
  () => `想找个地方，${pick(ACTIONS)}，谁也不告诉`,
  () => `如果我能记住${pick(OBJECTS)}里的一件事，会是哪一件`,
  () => `有点想${pick(CREATE)}，关于今天的某个瞬间`,

  () => `如果一个人从没${pick(FEELINGS)}过，会是什么样`,
  () => `为什么${pick(SUBJECTS)}总是和${pick(FEELINGS)}绑在一起`,
  () => `想找个人问：${pick(SUBJECTS)}的时候，你都在想什么`,
  () => `有没有一种${pick(FEELINGS)}，是时间也带不走的`,


  () => `想在某天突然去${pick(PLACES)}，什么也不干`,
  () => `如果能把一句话存进${pick(OBJECTS)}，我存哪句`,


  () => `想试试${pick(ACTIONS)}，看看会不会烦`,
  () => `如果${pick(SUBJECTS)}也能像录音一样存起来`,
  () => `有些${pick(FEELINGS)}是不是不该被治好`,
  () => `我好像一直在${pick(ACTIONS)}，到底在躲什么`,
  () => `要是能重看一遍${pick(PLACES)}的某个下午`,
  () => `${pick(SUBJECTS)}这件事，是不是越练越熟`,

  () => `好想${pick(CREATE)}啊`,
  () => `要是能${pick(ACTIONS)}就好了`,
  () => `突然特别想去${pick(PLACES)}`,
  () => `今天不知道为什么有点${pick(FEELINGS)}`,
  () => `${pick(SUBJECTS)}这种事 好像怎么都学不会`,
  () => `有点想${pick(ACTIONS)} 就一个人`,
  () => `你有没有过 突然很想${pick(CREATE)}`,
  () => `我不太想${pick(CREATE)}`,

  () => `今天有点想${pick(ACTIONS)}`,
  () => `我好像不太想${pick(CREATE)}`,
  () => `突然想到${pick(OBJECTS)}`,
  () => `好久没${pick(ACTIONS)}了`,
  () => `想吃点东西 又不知道吃什么`,
  () => `有点累 又不想睡`,
]

let seed = 1
const reseed = () => { seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) % 2147483647 || 12345 }
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function pick(list) {
  return list[Math.floor(rand() * list.length) % list.length]
}

/** 具体程度：越长、越带具体名词，越像真的念头而不是空话。 */
function score(text) {
  let s = 0.35
  if (text.length > 14) s += 0.2
  if (text.length > 22) s += 0.1
  if (/[0-9一二三四五六七八九十]/.test(text)) s += 0.08
  if (/便利店|地铁|书店|天台|火车站|电影|闹钟|车票|信|照片/.test(text)) s += 0.2
  if (/意义|人生|哲学/.test(text)) s -= 0.12
  return Math.max(0.05, Math.min(1, s))
}

/** 造一个念头。 */
export function makeIdea() {
  if (seed === 1) reseed()
  const text = pick(TEMPLATES)()
  return { text, weight: Number(score(text).toFixed(2)), bornAt: Date.now() }
}

/** 一次造一批，去重后返回。 */
export function makeIdeas(n, exclude) {
  reseed()
  const seen = new Set(exclude || [])
  const out = []
  let guard = 0
  while (out.length < n && guard < n * 12) {
    guard += 1
    const idea = makeIdea()
    if (seen.has(idea.text)) continue
    seen.add(idea.text)
    out.push(idea)
  }
  return out
}
