// 3重振り子の音:振り子の関節や先端が「鍵盤」(sketch.js の keys)に入った瞬間だけ、ベルを1音鳴らす
//   ・鍵盤ごとに音が決まっている。画面の上にあるほど高い(五音音階なので、どれが重なっても濁らない)
//   ・振り子が速いほど鍵盤を通る回数が増えるので、カオスが激しいほど音が増える
//   ・音はエコーと残響で、ゆっくり消えていく(画面の、薄れていく光の軌跡と同じ)
//   ・鍵盤が左にあれば左から、右にあれば右から聞こえる
// ブラウザは、画面を一度タップ(クリック)するまで音を出せない。toggleSound() で鳴らす/止める。S キーでも切り替え

// 五音音階(ソ・ラ・ド・レ・ミ)。高い音を控えめにするため、ド(523Hz)までにしている
// 鍵盤の高さに合わせて、低い方から割り当てる(sketch.js の KEY_NOTES と長さを合わせる)
const SCALE = [196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25];
const NOTE_SECONDS = 5;     // 1音が消えるまでの時間
const NOTE_LEVEL = 0.09;    // 1音の音量(当たった強さに関係なく一定)
const MASTER = 0.55;        // 全体の音量
const ECHO_SECONDS = 0.7;   // エコーの間隔
const ECHO_FEEDBACK = 0.5;  // エコーが次に残る割合(大きいほど長く続く)
const REVERB_SECONDS = 8;   // 残響の長さ

let audio = null; // 音の仕組み一式。まだ作っていなければ null

// 鳴らす/止める。鳴っていれば true を返す
function toggleSound() {
  if (!audio) {
    unlockIOS();
    audio = buildAudio();
    audio.ctx.resume(); // ブラウザによっては、作っただけでは一時停止のままになる
    bell(SCALE[4], NOTE_LEVEL, 0); // 鳴り始めの合図
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

// sketch.js から、鍵盤にヒットするたびに呼ばれる
window.onKeyHit = (key) => {
  if (!soundIsOn()) return;
  const pan = Math.max(-1, Math.min(1, key.x / (L * 3)));
  bell(SCALE[Math.min(key.note, SCALE.length - 1)], NOTE_LEVEL, pan);
};

// ベルの音:基音に、少しずれた高い倍音を重ねる。高い倍音ほど早く消える
function bell(freq, loud, pan) {
  const { ctx, bus } = audio;
  const t = ctx.currentTime + 0.01;
  const out = ctx.createStereoPanner();
  out.pan.value = pan;
  out.connect(bus);
  for (const [ratio, level, decay] of [[1, 1, 1], [2.0, 0.15, 0.4], [3.01, 0.04, 0.2]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const g = ctx.createGain();
    const end = t + NOTE_SECONDS * decay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(loud * level, t + 0.012); // やわらかい立ち上がり
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(end + 0.05);
  }
}

// iPhone のマナーモードでも音が出るようにする
function unlockIOS() {
  // 新しい iOS:音の種類を「再生」にすると、マナーモードでも鳴る
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch (e) {}
  // 古い iOS:無音の <audio> を流しておくと、同じ効果がある
  try {
    const silent = new Audio('data:audio/wav;base64,' + silentWav());
    silent.loop = true;
    silent.play().catch(() => {});
  } catch (e) {}
}

// 0.1 秒の無音(WAV 形式)を作る
function silentWav() {
  const n = 800;
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const str = (o, s) => [...s].forEach((ch, i) => (bytes[o + i] = ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  bytes.fill(128, 44);
  return btoa(String.fromCharCode(...bytes));
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

  // 響き:そのまま(dry)+ エコー + 残響 を混ぜる。アンビエントにするため、響きを深めにしている
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  bus.connect(dry).connect(limiter);

  const echo = ctx.createDelay(2);
  echo.delayTime.value = ECHO_SECONDS;
  const echoBack = ctx.createGain();
  echoBack.gain.value = ECHO_FEEDBACK;
  const echoTone = ctx.createBiquadFilter(); // 繰り返すたびに、少しずつこもっていく
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 2200;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.45;
  bus.connect(echo);
  echo.connect(echoTone).connect(echoBack).connect(echo);
  echoTone.connect(echoOut).connect(limiter);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverb(ctx, REVERB_SECONDS);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 1.1;
  bus.connect(reverb).connect(reverbOut).connect(limiter);
  echoOut.connect(reverb);

  return { ctx, bus };
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

window.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') toggleSound();
});
