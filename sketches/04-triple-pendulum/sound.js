// 3重振り子の音:sketch.js の振り子(pend)を読んで、音を鳴らす
//   ・腕1本につき1つの音が、常に鳴り続ける。根元は低く、先端は高く
//   ・腕が速くなるほど、五音音階を1段ずつ上がる(どの音が重なっても濁らない)。速いほど少し大きく明るくもなる
//   ・ふくらんだ音は、エコーと残響で尾を引いて消えていく(画面の、薄れていく光の軌跡と同じ)
//   ・音は、その腕の先の点が左にあれば左から、右にあれば右から聞こえる
// ブラウザは、画面を一度タップ(クリック)するまで音を出せない。toggleSound() で鳴らす/止める。S キーでも切り替え

// 五音音階(ラ・ド・レ・ミ・ソ)。スマホのスピーカーは低い音をほとんど鳴らせないので、220Hz 以上にしている
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.26, 783.99, 880, 1046.5];
const START_STEP = [0, 2, 4]; // 止まっているときの段:根元 → 先端
const STEPS = 5;              // 一番速いとき、何段上がるか
const FAST = 9;            // この角速度(ラジアン/秒)で、音が一番大きくなる
const VOICE_MAX = 0.12;    // 1つの音の最大音量(一番速いとき)
const VOICE_MIN = 0.05;    // 1つの音の最小音量(止まっているとき)
const MASTER = 0.7;        // 全体の音量
const ECHO_SECONDS = 0.55; // エコーの間隔
const ECHO_FEEDBACK = 0.42;// エコーが次に残る割合(大きいほど長く続く)
const REVERB_SECONDS = 4;  // 残響の長さ

let audio = null; // 音の仕組み一式。まだ作っていなければ null

// 鳴らす/止める。鳴っていれば true を返す
function toggleSound() {
  if (!audio) {
    unlockIOS();
    audio = buildAudio();
    audio.ctx.resume(); // ブラウザによっては、作っただけでは一時停止のままになる
    chime();
    updateSound();
    return true;
  }
  const on = audio.ctx.state !== 'running';
  if (on) audio.ctx.resume();
  else audio.ctx.suspend();
  return on;
}

function soundIsOn() {
  return !!audio && audio.ctx.state === 'running';
}

// iPhone のマナーモードでも音が出るようにする
function unlockIOS() {
  // 新しい iOS:音の種類を「再生」にすると、マナーモードでも鳴る
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch (e) {}
  // 古い iOS:無音の <audio> を流しておくと、同じ効果がある
  try {
    const silent = new Audio('data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==');
    silent.loop = true;
    silent.play().catch(() => {});
  } catch (e) {}
}

// 鳴り始めの合図:小さなベルを1回(音が出る状態か、すぐわかるように)
function chime() {
  const { ctx, bus } = audio;
  const t = ctx.currentTime + 0.05;
  for (const [f, v] of [[987.77, 0.12], [1975.5, 0.04]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + 2.6);
  }
}

function buildAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // 出口:音量の上限(リミッター)をかけて、うるさくなりすぎないようにする
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.3;
  const master = ctx.createGain();
  master.gain.value = MASTER;
  limiter.connect(master).connect(ctx.destination);

  // 響き:そのまま(dry)+ エコー + 残響 を混ぜる
  const bus = ctx.createGain();
  bus.connect(limiter);

  const echo = ctx.createDelay(2);
  echo.delayTime.value = ECHO_SECONDS;
  const echoBack = ctx.createGain();
  echoBack.gain.value = ECHO_FEEDBACK;
  const echoTone = ctx.createBiquadFilter(); // 繰り返すたびに、少しずつこもっていく
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 1800;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.5;
  bus.connect(echo);
  echo.connect(echoTone).connect(echoBack).connect(echo);
  echoTone.connect(echoOut).connect(limiter);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverb(ctx, REVERB_SECONDS);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.6;
  bus.connect(reverb).connect(reverbOut).connect(limiter);
  echoOut.connect(reverb);

  // 腕ごとの音:少しずらした2つの波を重ねて、やわらかく揺らぐ音にする
  const voices = START_STEP.map((_, i) => {
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 900;
    tone.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const oscs = [];
    for (const [type, detune] of [['triangle', -4], ['triangle', 4]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = SCALE[START_STEP[i]];
      osc.detune.value = detune;
      osc.connect(tone);
      osc.start();
      oscs.push(osc);
    }
    tone.connect(gain).connect(pan).connect(bus);
    return { tone, gain, pan, oscs, step: START_STEP[i] };
  });

  return { ctx, bus, voices };
}

// 残響の「響き方」を、だんだん小さくなる雑音で作る
function makeReverb(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

// 毎フレーム、振り子の状態を音に写す
function updateSound() {
  requestAnimationFrame(updateSound);
  if (!audio || audio.ctx.state !== 'running' || typeof pend === 'undefined' || !pend) return;
  const now = audio.ctx.currentTime;
  const pts = points(pend.th);
  const reach = L * N;
  audio.voices.forEach((v, i) => {
    const s = Math.min(1, Math.abs(pend.w[i]) / FAST); // 腕の速さ(0 〜 1)
    // 速さに合わせて音階の段を決める。境目でパタパタしないよう、0.7 段以上ずれたときだけ移る
    const want = START_STEP[i] + s * STEPS;
    if (Math.abs(want - v.step) > 0.7) {
      v.step = Math.round(want);
      for (const osc of v.oscs) osc.frequency.setTargetAtTime(SCALE[v.step], now, 0.03);
    }
    const loud = VOICE_MIN + (VOICE_MAX - VOICE_MIN) * s;
    v.gain.gain.setTargetAtTime(loud, now, 0.25); // 0.25 秒かけて、ふわっと変わる
    v.tone.frequency.setTargetAtTime(900 + 3000 * s, now, 0.12); // 速いほど明るい音
    const x = (pts[i + 1].x - pts[0].x) / reach; // 腕の先の点の、左右の位置(-1 〜 1)
    v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, x)), now, 0.08);
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') toggleSound();
});
