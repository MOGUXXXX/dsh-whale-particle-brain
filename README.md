# dsh-whale · Particle Brain

> A DSH plugin that grows an AI's chat history into **two living particle brains** — one self for private chats, another for group chats.
> Concepts are not a hardcoded persona; they are discovered from raw conversation. The older a memory gets, the further out it drifts, and the fainter it becomes.
> When idle, it goes online on its own: looks up a word it keeps thinking about, or checks what anime is airing today.


## Meteor Sea — ideas that fall like shooting stars

Above the brain there is a second view: a night sky where **thoughts cross as shooting stars**, right to left, each one carrying its own line of text.

- The sky is a procedurally painted galaxy (nebula washes, a tilted milky band, thousands of stars, limb-darkened core) with a slowly turning sphere of colour-cycling particles at the centre.
- Ideas are **composed, not authored**: scene × action × mood × question templates, seeded per call and de-duplicated against the last few hundred, so the same sentence does not keep coming back. A new batch is generated each day.
- Hover (desktop) or tap (mobile) a meteor and it eases to a stop, then shows the whole thought. A click adds a short flash so the tap has a feel.
- Every 90 seconds a die is rolled. On a hit (0.1%) that thought **becomes a star**: it stays in the sky, twinkles, and is written into the entity's 执念 (open-loop) pool and the chat topic queue — so it comes up later in conversation on its own.

## Mobile — the same three views, on a phone

 `mobile.html` is a self-contained page served by the plugin over LAN/ngrok: **brain / meteor sea / vitals**.
The vitals view proxies the Life-OS snapshot and renders everything the desktop panel shows — energy, the full chemical list, neural pulse history, open loops, organs, last dream, temperament — and scrolls.


## Compatibility, permissions and boundaries

| | |
|---|---|
| Node | `^22.19.0 || >=24.0.0` |
| DSH | `>=0.2.0-rc.2` |
| Runtime deps | none beyond the Node standard library; optional bridge modules are imported lazily and skipped when absent |

**What it touches**

- **Files** — reads the QQ bridge state directory (chat logs, shared memory, slang, cold knowledge) and writes its own caches there; never writes outside `~/.dsh` and that bridge directory.
- **Network** — outbound requests to public feeds (Bilibili, Tieba, Hitokoto) and to a search backend when the model asks itself about a word. All calls are best-effort: on failure the plugin logs and continues, nothing blocks the brain.
- **Local processes** — may start the two local Life-OS helpers (data bridge on 8787, page on 8790) and restart them if they die. It does not spawn user-provided commands.
- **Credentials** — reads the local bridge console token from the bridge state directory at runtime so a promoted thought can be delivered as a QQ message. The token is never copied into this package or written into logs.
- **Dynamic loading** — the browser half is loaded through the DSH client module loader (`window.__ModuleLoader__`); the host half imports optional bridge modules with dynamic `import()` and degrades if they are missing.

**Failure bounds** — every subsystem (feeds, learning, meteor promotion, mobile server, Life-OS supervision) is wrapped so a failure logs and returns; no code path throws into the session. The brain keeps rendering from its last good snapshot.

---

## What it actually does

Most "AI personas" are a table: likes this, hates that, speaks in this tone, written into the system prompt.
This plugin does the opposite — **it gives the model experience, not conclusions**:

1. It reads chat logs, notes, and a slang dictionary, then cuts sentences into fragments.
2. Using n-gram frequency, left/right neighbor entropy, and internal cohesion, it **discovers which fragments are concepts — unsupervised**.
   Nobody tells it "you care about loneliness"; the word 孤独 qualifies on its own.
3. Concepts connect through co-occurrence (Hebbian), then label propagation forms clusters — and that is where "directions" come from.
4. Every concept gets a retention score from the Ebbinghaus curve, and **retention decides how far out it drifts**.

That is why the two selves grow differently: the private one yields 「主动 / 撒娇 / 夏天」, the group one yields 「诗人 / 抽象 / 闭嘴 / wdf」. Same whale, two relationships, two selves.

## The forgetting curve is the core

This is not a hand-tuned decay. It is actually Ebbinghaus:

```
R(t) = e^(−t / S)                       retention
S    = S0 · (1 + k·A)                   memory strength, A = current activation
r    = rMin + (rMax − rMin) · (1 − R)   radius = degree of forgetting
```

- A fresh memory has R≈1 and sits at the core.
- A fully forgotten one has R≈0 and drifts to the rim, ready to dissolve.
- **Memories that keep getting recalled grow S and decay slower**, so even old ones stay inside — that is spaced repetition.

On top of that, three mechanisms that make it more human:

| Mechanism | How it is computed | Effect |
|---|---|---|
| Emotional arousal | Emotion words, exclamation marks, repeated characters in the **sentences the concept came from** | Arousing memories consolidate harder |
| Interference | Jaccard similarity of neighbor sets, only suppressed by stronger peers | Near-duplicate memories crowd each other out |
| Reconsolidation | Every recall rewinds the age clock (capped at half) | Recall is re-encoding |

## It decides what to learn

No fixed topic list. It picks its next move from "interest × mood":

- **Memes** — Bilibili trending + Tieba hot topics
- **Anime** — Bilibili bangumi ranking (Japan only) plus genres and synopsis
- **Thought** — philosophy / literature / classical poetry
- **Curiosity** — chew on whichever word is loudest in its head right now

Every action feeds back into its interest weights: gains raise them, three fruitless tries in a row push that direction into a cooldown.
Mood (warm / lonely / curious / tired) is driven by private chats, group chats, and long silences, and it also shapes what the whale feels like doing — when tired, it would rather watch anime.

## Two ways to look at it

- **Harness panel** — both brains side by side; drag to rotate, scroll to push in, click a concept for details.
- **Mobile page** (`mobile.html`) — fully self-contained; pinch to zoom, drag to rotate, tap a concept for a card, with the whale's current mood in the header.

Colors are five direction hues (blue / yellow / purple / green / red), assigned by cluster size rank — largest cluster blue, second yellow, and so on. This guarantees all five appear while big clusters keep a stable color.

## Install

```bash
dsh plugin add <path-to-this-repo-or-package>
```

Restart DSH afterwards (the client half is bundled at startup); a new icon appears in the sidebar.

### Configuration

The plugin needs to know **where your chat logs are** and **where to keep its memory**:

```yaml
- id: dsh-whale-brain
  name: dsh-whale-brain
  config:
    stateDir: ~/.dsh/qq-bridge-state   # reads qq-activity.log / shared-memory.json / slang.json
    dataDir: ~/.dsh/whale-brain        # writes mind.json / mood.json
```

If `stateDir` is omitted, a few common locations are tried in order. Data sources:

| File | Provides |
|---|---|
| `qq-activity.log` | The chat stream (private and group separated) |
| `shared-memory.json` | Things it was told to remember → event dots |
| `slang.json` | Confirmed slang entries |

**It runs without these files**, but the brain will be tiny — with no experience, nothing grows.

## Known limits

- **Built for a QQ bot host**: it reads qq-bridge state. Porting to another data source means editing one function in `lib/sources.mjs`.
- **Exponential, not power-law**: after 31 days retention hits zero; humans still keep ~20%. Once the corpus is older than a month, this needs to become a power law.
- **Anime stops at "knows what is airing"**: synopses come through, but tone of speech only gets a small supplement from Hitokoto's anime category.
- **No Douyin**: its hot-list API requires request signing, which was not reverse-engineered.

## Layout

```
index.js          Host half: routes, mobile server, engine entry
lib/
  mind.mjs        Brain build: Ebbinghaus, arousal, interference, reconsolidation, communities
  lexicon.mjs     Unsupervised concept discovery (n-gram + entropy + cohesion)
  learn.mjs       Curiosity: pick a word, search, inject
  feeds.mjs       Wide net: Bilibili / Tieba / Hitokoto
  self.mjs        Interest and mood: state, decisions, life log
  sources.mjs     Experience stream collection and cleaning
  engine.mjs      Dual-branch engine and rebuilds
client/client.js  Harness panel (React + Canvas)
mobile.html       Standalone mobile page
```

## License

MIT
