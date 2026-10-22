// 3重振り子の音:sketch.js の振り子(pend)を読んで、音を鳴らす
//   ・腕1本につき1つの音。根元は低く、先端は高く(濁らない和音)
//   ・腕が速く振れると、その音がふくらんで明るくなる。ゆっくりなら、ほとんど聞こえない
//   ・ふくらんだ音は、エコーと残響で尾を引いて消えていく(画面の、薄れていく光の軌跡と同じ)
//   ・音は、その腕の先の点が左にあれば左から、右にあれば右から聞こえる
// ブラウザは、画面を一度タップ(クリック)するまで音を出せない。toggleSound() で鳴らす/止める。S キーでも切り替え

const VOICE_FREQS = [110, 164.81, 246.94]; // ラ(A2)、ミ(E3)、シ(B3):根元 → 先端
const FAST = 9;            // この角速度(ラジアン/秒)で、音が一番大きくなる
const VOICE_MAX = 0.16;    // 1つの音の最大音量
const VOICE_MIN = 0.004;   // 一番静かなときの音量(ほぼ聞こえない)
const MASTER = 0.7;        // 全体の音量
const ECHO_SECONDS = 0.55; // エコーの間隔
const ECHO_FEEDBACK = 0.42;// エコーが次に残る割合(大きいほど長く続く)
const REVERB_SECONDS = 4;  // 残響の長さ

let audio = null; // 音の仕組み一式。まだ作っていなければ null

function toggleSound() {
  if (!audio) {
    audio = buildAudio();
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

function buildAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // 出口:音量の上限(リミッター)をかけて、うるさくなりすぎないようにする
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.3;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.setTargetAtTime(MASTER, ctx.currentTime, 0.8); // ふわっと鳴り始める
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
  const voices = VOICE_FREQS.map((f) => {
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 400;
    tone.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    for (const [type, detune] of [['sine', -4], ['triangle', 4]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(tone);
      osc.start();
    }
    tone.connect(gain).connect(pan).connect(bus);
    return { tone, gain, pan };
  });

  return { ctx, voices };
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
    const loud = VOICE_MIN + (VOICE_MAX - VOICE_MIN) * s * s; // 速いときだけ、ぐっとふくらむ
    v.gain.gain.setTargetAtTime(loud, now, 0.12);
    v.tone.frequency.setTargetAtTime(300 + 2600 * s, now, 0.12); // 速いほど明るい音
    const x = (pts[i + 1].x - pts[0].x) / reach; // 腕の先の点の、左右の位置(-1 〜 1)
    v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, x)), now, 0.08);
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') toggleSound();
});
