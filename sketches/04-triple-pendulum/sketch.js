// 3重振り子の時空図:振り子は手前の平面で揺れ、各点が残す光の軌跡が奥(過去)へ流れていく
//   すべて光の線でできている。腕と鍵盤は白、先端は黄色のライト、2つ目の関節は青、1つ目の関節は明るい紫、中心(支点)は赤
// ドラッグで中心をずらせる(離すと、ばねで元の位置に戻る)。カメラは自動で視点を移る
// R キーでやり直し、V キーで次の視点へ

const N = 3;                // 振り子の段数
const G = 9.81;             // 重力
const SPEED = 0.56;         // 時間の進む速さ(1 で現実と同じ)。画面の ×1 はこの速さ
const SUBSTEPS = 10;        // 1フレームの計算を何回に分けるか(多いほど正確)
const DT = SPEED / 60 / SUBSTEPS;
const HISTORY = 1200;       // 何フレーム分の過去を残すか(60で1秒、1200 で 20 秒)。奥行きの長さは DEPTH のまま、長く残すほど奥へ流れる速さが遅くなり、線が密になる
const DEPTH = 18;           // 時間の奥行きの長さ(腕の長さの何倍か)。短いほど、軌跡が手前に詰まって見える
const TRAIL_FLOOR = 0.25;   // 古い軌跡も、この明るさまでは残す(最後の 1 割で消える)
const FADE_SPEED = 3.5;     // 最初にどれだけ急に暗くなるか(大きいほど、手前の光がすぐ落ち着く。小さいほど中間が明るい)
const RECENT = 1 / 3;       // 新しい方からこの割合(約 7 秒分)にだけ、にじみを付けて描く
const SIMPLIFY = 0.002;     // 軌跡のうち、前後の点を結んだ線からのずれがこれより小さい点は描かない(腕の長さに対する割合)
                            // 奥では最大 7.5 倍に広がるので、広がった後でも 1 ピクセル未満のずれに収まる小ささにしている
                            // 振り子の動きはなめらかなので、ほぼ一直線上の点を省いても見た目は変わらず、描く点がぐっと減る
const SIMPLIFY_RUN = 16;    // 続けて省く点の最大数
const EXPAND = 6.5;         // 一番古い過去を、どれだけ広げるか(0 で広げない。6.5 なら 7.5 倍)
const EXPAND_CURVE = 1;     // 広がり方(1 でまっすぐな円錐、大きいほど奥で急に開く)
// 始まり方:毎回同じ。真上から、3本の腕をほんの少しずつずらし、そろって回し始める
// 振り子全体が1本の棒のように回って円を描き、約 1.2 秒で崩れてカオスになる
// (真上から放すと、円が続く時間はずらし幅ではなく回す速さでほぼ決まる:1.8〜2.0 で約 1.2 秒、2.2 で約 1.6 秒、2.5 で約 2.3 秒)
const START_SPIN = 1.9;     // 最初に回す速さ(ラジアン / 秒)。1.9 で約 1.2 秒
const START_NUDGE = 0;      // 腕どうしのずらし幅(ラジアン)。0 = 完全に真上。ずらさなくても、重力と遠心力の差で自然に崩れる
const START_DIR = -1;       // 回す向き(-1 = 時計回り、1 = 反時計回り)。ずらし方も一緒に反転して、鏡に映した同じ動きにする

// 中心(支点)を動かすばね。強さが大きいほど速く戻り、減衰が大きいほど弾まずに止まる
const SPRING = 60;          // 離したときに、元の位置へ戻すばねの強さ
const SPRING_DAMP = 6;      // そのばねの減衰
const DRAG_SPRING = 150;    // ドラッグ中に、指へ引き寄せるばねの強さ
const DRAG_DAMP = 25;       // そのばねの減衰
const MAX_SHIFT = 1;        // 中心をずらせる最大距離(腕の長さの何倍か)
const MAX_ACCEL = 30;       // 中心の加速度の上限(重力 9.81 の約3倍)。指をどれだけ速く動かしても、これ以上の力は伝わらない
const SETTLE = 0.02;        // 揺さぶって増えたエネルギーを、1フレームで何割抜くか

// カメラの視点。yaw = 左右の回り込み、pitch = 見下ろす角度、dist = 距離(腕の長さの何倍か)
// どの視点も「現在が手前、過去が奥」という向きは崩さない
// slide = 見る点を、時間の軸に沿ってスライドさせる範囲(0 = 現在、1 = 一番古い過去)。その視点にいる間、ゆっくり動く
// slide がない視点は、常に原点を見て円弧状に回る。並び順は、カメラが同じ向きにぐるっと回り続ける順にしている
const VIEWS = [
  { name: '正面', yaw: 0.05, pitch: 0.08, dist: 10 }, // 最初はいつも正面から
  { name: '斜め右', yaw: 0.5, pitch: 0.22, dist: 15 },
  { name: '横から', yaw: Math.PI / 2, pitch: 0.05, dist: 20, slide: [0.08, 0.4] }, // 横向きの三角形が、横にスライドする
  { name: '上から', yaw: Math.PI, pitch: 1.35, dist: 24, slide: [0.08, 0.4] },     // A のような三角形が、縦にスライドする
  { name: '斜め左', yaw: -0.5, pitch: 0.18, dist: 15 },
  { name: '斜め上', yaw: 0.25, pitch: 0.5, dist: 14 },
];
const LIFT = 0.07;          // 絵全体を持ち上げる量(画面の高さに対する割合)
const VIEW_SECONDS = 10;    // 1つの視点にとどまる時間
const CAM_SPRING = 1.4;     // カメラを次の視点へ引き寄せるばねの強さ(大きいほど早く着く)
const CAM_DAMP = 1.9;       // そのばねの減衰(小さいほど、行き過ぎてから戻る)
const WANDER = 1;           // カメラがさまよう大きさ(0 で決めポイントに止まる)
const CAM_SETTLE = 4;       // 始まりは静止した正面から、この秒数かけて手持ちの動きになっていく

// 鍵盤:支点のまわりに、時計の目盛りのように並べた放射状の短い線。関節か先端が線を横切った瞬間、その音が鳴る
// r = 線の外側の端の、支点からの距離(腕の長さの何倍か)、n = 並べる数、start = 1本目の向き(0 = 真下、PI = 真上)
// 音の高さは画面上の高さで決まる(上にあるほど高い音)
const KEY_RINGS = [{ r: 2.08, n: 12, start: Math.PI }]; // 時計の文字盤のように 12 本
const KEY_LENGTH = 0.18;    // 線の長さ(腕の長さの何倍か)。内側の端は 1.9。カオスの状態で、平均 1 秒に 0.7 回ほど鳴る
                            // 2つ目の関節は距離 2 までしか届かないので、内側の端が 2 より内に入るかどうかで、鳴る頻度が大きく変わる
const KEY_NOTES = 8;        // 音の段の数(sound.js の SCALE の長さと合わせる)
const KEY_REST = 0.25;      // 同じ鍵盤を続けて鳴らすまでの、最短の間隔(秒)
const KEY_MAX_RATE = 3;     // 全体で1秒に鳴らす最大の数

const BG = [3, 3, 7];
// 軌跡の色:中心、接続部1、接続部2、先端 の順
const TRAIL_COLORS = ['#f0505e', '#b48cff', '#4a8cff', '#ffc94d'];
const TRAIL_BRIGHTNESS = [0.6, 0.65, 0.85, 1]; // 軌跡の明るさ。内側ほど控えめにして、注目を先端に集める

let pend;       // 振り子
let running = true; // false の間は時間を止めて、振り子をその場で描くだけにする(入り口の画面用)
let timeScale = 1;   // 振り子の時間の進む速さ(画面のボタンで 0.5 / 1 / 2 倍に切り替える)
let stepClock = 0;   // まだ進めていない時間(秒)。1/60 秒たまるごとに、振り子を1歩進める
let keys = [];  // 鍵盤
let recentHits = []; // 最近鳴った時刻(1秒に鳴らす数を抑えるため)
let pivot;      // 中心のずれ(腕の長さを 1 とした位置と速度)
let drag;       // ドラッグ中なら、始めた時の指と中心の位置。していなければ null
let L;          // 腕1本の長さ(画面上のピクセル)
let zStep;      // 1フレームで、どれだけ奥へ流れるか
let frameIndex; // 始まってからのフレーム数
let viewIndex = 0;   // いまの視点
let viewStart = 0;   // いまの視点に移った時刻(秒)
let cam = null;      // いまのカメラの状態と速さ(重さのあるカメラとして動かす)
let camStart = 0;    // カメラが動き始めた時刻(秒)
let camRight, camUp; // 画面の右と上が、空間でどちらを向いているか(光の板をカメラに向けるため)
let glowTex = [];    // 点の光の画像(色ごと)

function setup() {
  pixelDensity(min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight, WEBGL);
  glowTex = TRAIL_COLORS.map(makeGlow);
  restart();
}

function restart() {
  L = min(width, height) * 0.1;
  zStep = (L * DEPTH) / HISTORY;
  frameIndex = 0;
  const th = [PI, PI + START_DIR * START_NUDGE, PI - START_DIR * START_NUDGE];
  const spin = START_DIR * START_SPIN;
  pend = { th, w: [spin, spin, spin], trail: [] };
  simplify = [...Array(N + 1)].map(() => ({ last: null, skipped: [] }));
  if (!fadeTable) makeTables();
  pend.baseEnergy = energy(pend); // 最初のエネルギー。揺さぶって増えても、ここへ戻っていく
  pivot = { x: 0, y: 0, vx: 0, vy: 0 };
  drag = null;
  recentHits = [];
  stepClock = 0;
  viewIndex = 0; // やり直したら、また正面から、静止したカメラで始める
  viewStart = millis() / 1000;
  camStart = viewStart;
  cam = null;
  makeKeys();
}

function draw() {
  // 実際に経過した時間で進める(画面の更新が 60 回/秒でも 144 回/秒でも、同じ速さで動くように)
  const elapsed = min(deltaTime, 100) / 1000;
  drawScene(elapsed);
}

function drawScene(elapsed) {
  background(BG);
  updateCamera(elapsed);

  if (running) {
    stepClock += elapsed * timeScale;
    for (let i = 0; i < 8 && stepClock >= 1 / 60; i++) {
      step();
      stepClock -= 1 / 60;
    }
  }

  // 光の部分:重なるほど明るくなる「加算合成」で、前後関係は気にせず描く
  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST);
  blendMode(ADD);
  drawTimeFrames();
  for (let i = 0; i <= N; i++) drawTrail(i);
  drawKeys();
  blendMode(BLEND);
  gl.enable(gl.DEPTH_TEST);

  drawPendulum();
}

// 時間を1フレーム進める:振り子を動かし、軌跡を残し、鍵盤に当たったかを調べる
function step() {
  const target = dragTarget();
  for (let s = 0; s < SUBSTEPS; s++) {
    const a = movePivot(target);
    rk4(pend, a.x, a.y);
  }
  settle(pend);
  const prevPts = pend.trail[pend.trail.length - 1];
  const nowPts = points(pend.th);
  pend.trail.push(nowPts);
  markKeep(prevPts, nowPts);
  if (prevPts) checkKeys(prevPts, nowPts);
  if (pend.trail.length > HISTORY) pend.trail.shift();
  frameIndex++;
}

// ---- 物理:3重振り子の運動方程式(腕の長さ1、おもりの重さ1)----

// 角度 th と角速度 w から、角加速度を求める(M・a = f という3元連立方程式を解く)
// ax, ay は中心の加速度。中心が動くと、おもりには逆向きの力(慣性力)がかかる
function accel(th, w, ax, ay) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const f = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const below = N - max(i, j); // i と j の両方より下にあるおもりの数
      M[i][j] = below * cos(th[i] - th[j]);
      f[i] -= below * sin(th[i] - th[j]) * w[j] * w[j];
    }
    f[i] -= (N - i) * G * sin(th[i]);
    f[i] -= (N - i) * (ax * cos(th[i]) - ay * sin(th[i]));
  }
  return solve3(M, f);
}

// 3元連立方程式をクラメルの公式で解く
function solve3(M, f) {
  const det = (a) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(M);
  return [0, 1, 2].map((c) => det(M.map((row, r) => row.map((v, k) => (k === c ? f[r] : v)))) / d);
}

// ルンゲ=クッタ法(RK4)で、時間を dt だけ進める
function rk4(p, ax = 0, ay = 0, dt = DT) {
  const DT = dt;
  const add = (a, b, s) => a.map((v, i) => v + b[i] * s);
  const acc = (th, w) => accel(th, w, ax, ay);
  const k1w = acc(p.th, p.w), k1t = p.w;
  const k2w = acc(add(p.th, k1t, DT / 2), add(p.w, k1w, DT / 2)), k2t = add(p.w, k1w, DT / 2);
  const k3w = acc(add(p.th, k2t, DT / 2), add(p.w, k2w, DT / 2)), k3t = add(p.w, k2w, DT / 2);
  const k4w = acc(add(p.th, k3t, DT), add(p.w, k3w, DT)), k4t = add(p.w, k3w, DT);
  for (let i = 0; i < N; i++) {
    p.th[i] += (DT / 6) * (k1t[i] + 2 * k2t[i] + 2 * k3t[i] + k4t[i]);
    p.w[i] += (DT / 6) * (k1w[i] + 2 * k2w[i] + 2 * k3w[i] + k4w[i]);
  }
}

// 振り子のエネルギー(動きの勢い + 高さ)
function energy(p) {
  return kinetic(p) - potentialHeight(p) * G;
}

function kinetic(p) {
  let vx = 0, vy = 0, k = 0;
  for (let i = 0; i < N; i++) {
    vx += cos(p.th[i]) * p.w[i];
    vy -= sin(p.th[i]) * p.w[i];
    k += 0.5 * (vx * vx + vy * vy);
  }
  return k;
}

function potentialHeight(p) {
  let y = 0, h = 0;
  for (let i = 0; i < N; i++) {
    y += cos(p.th[i]);
    h += y;
  }
  return h;
}

// 揺さぶって最初より増えたエネルギーを、少しずつ抜く(何もしなければ、何も変わらない)
function settle(p) {
  const extra = energy(p) - p.baseEnergy;
  const k = kinetic(p);
  if (extra <= 0 || k <= 0) return;
  const scale = sqrt(max(0, k - extra * SETTLE) / k);
  for (let i = 0; i < N; i++) p.w[i] *= scale;
}

// ---- 中心(支点)の操作 ----

// 指(マウス)が押されていれば、中心を引き寄せる先を返す。離していれば元の位置 (0, 0)
function dragTarget() {
  const pressed = touches.length > 0 || mouseIsPressed;
  if (!pressed) {
    drag = null;
    return { x: 0, y: 0 };
  }
  const fx = touches.length > 0 ? touches[0].x : mouseX;
  const fy = touches.length > 0 ? touches[0].y : mouseY;
  if (!drag) drag = { fx, fy, px: pivot.x, py: pivot.y };
  let x = drag.px + (fx - drag.fx) / L;
  let y = drag.py + (fy - drag.fy) / L;
  const d = Math.hypot(x, y);
  if (d > MAX_SHIFT) {
    x *= MAX_SHIFT / d;
    y *= MAX_SHIFT / d;
  }
  return { x, y };
}

// 中心を、ばねで target へ引き寄せて DT だけ動かす。そのときの加速度を返す
function movePivot(target) {
  const k = drag ? DRAG_SPRING : SPRING;
  const c = drag ? DRAG_DAMP : SPRING_DAMP;
  let ax = k * (target.x - pivot.x) - c * pivot.vx;
  let ay = k * (target.y - pivot.y) - c * pivot.vy;
  const a = Math.hypot(ax, ay);
  if (a > MAX_ACCEL) {
    ax *= MAX_ACCEL / a;
    ay *= MAX_ACCEL / a;
  }
  pivot.vx += ax * DT;
  pivot.vy += ay * DT;
  pivot.x += pivot.vx * DT;
  pivot.y += pivot.vy * DT;
  return { x: ax, y: ay };
}

// 角度から、中心(支点)と3つのおもりの画面上の位置を求める
function points(th) {
  let x = pivot.x * L;
  let y = -L * 0.5 + pivot.y * L; // 支点は少し上
  const pts = [{ x, y }];
  for (let i = 0; i < N; i++) {
    x += L * sin(th[i]);
    y += L * cos(th[i]);
    pts.push({ x, y });
  }
  return pts;
}

// ---- カメラ ----
// カメラは「重さのある手持ちカメラ」として動かす。行きたい場所(目標)へ、ばねで引き寄せられる
// 目標 = 決めポイントの視点 + 不規則な漂い。さらに最後に、手持ちの細かい揺れを直接足す(ばねを通すと均されて消えてしまうため)
// slide のない視点では、カメラは常に振り子の原点(支点の元の位置)を見る。回り込みも揺れも寄り引きも
// 原点を中心にした動きなので、原点は画面上の決まった1点から動かない。slide のある視点では、見る点ごと平行に動く

const CAM_KEYS = ['yaw', 'pitch', 'dist', 'roll', 'slide'];

// カメラが行きたい場所
// いまの揺れの大きさ。始まった直後は 0(静止)で、CAM_SETTLE 秒かけて WANDER まで大きくなる
function wanderAt(t) {
  const k = constrain((t - camStart) / CAM_SETTLE, 0, 1);
  return WANDER * k * k * (3 - 2 * k);
}

function camGoal(t) {
  const v = VIEWS[viewIndex];
  const w = wanderAt(t);
  // n(速さ, 番号):-1 〜 1 の、なめらかで不規則な値
  const n = (speed, k) => (noise(t * speed, k * 17.3) - 0.5) * 2;
  return {
    yaw: v.yaw + w * 0.22 * n(0.07, 1),
    pitch: v.pitch + w * 0.09 * n(0.06, 3),
    dist: v.dist * (1 + w * 0.14 * n(0.05, 5)) * (drag ? 0.85 : 1), // 干渉している間は少し寄る
    roll: w * 0.03 * n(0.09, 7), // ごくわずかな傾き
    slide: v.slide ? lerp(v.slide[0], v.slide[1], smoothstep01((t - viewStart) / VIEW_SECONDS)) : 0,
  };
}

function smoothstep01(x) {
  const k = constrain(x, 0, 1);
  return k * k * (3 - 2 * k);
}

// 手持ちの細かい揺れ(呼吸のような、ゆっくりした小さな揺れ)
function handheld(t) {
  const n = (speed, k) => (noise(t * speed, k * 31.7) - 0.5) * 2;
  const w = wanderAt(t);
  return {
    yaw: w * 0.035 * n(0.45, 1),
    pitch: w * 0.02 * n(0.5, 2),
    dist: 1 + w * 0.025 * n(0.35, 3),
    roll: w * 0.01 * n(0.6, 4),
  };
}

function updateCamera(elapsed = 1 / 60) {
  const t = millis() / 1000;
  if (t - viewStart > VIEW_SECONDS) nextView();
  const goal = camGoal(t);
  if (cam) goal.yaw += TWO_PI * round((cam.yaw - goal.yaw) / TWO_PI); // 一周ぶんずれていたら、近い向きから回る
  if (!cam) {
    cam = { vel: {} };
    for (const k of CAM_KEYS) {
      cam[k] = goal[k];
      cam.vel[k] = 0;
    }
  }
  // ばねで目標へ引き寄せる(実際に経過した時間だけ進める)
  const dt = elapsed;
  for (const k of CAM_KEYS) {
    const a = CAM_SPRING * (goal[k] - cam[k]) - CAM_DAMP * cam.vel[k];
    cam.vel[k] += a * dt;
    cam[k] += cam.vel[k] * dt;
  }

  const h = handheld(t);
  const yaw = cam.yaw + h.yaw;
  const pitch = cam.pitch + h.pitch;
  const roll = cam.roll + h.roll;
  // 縦長の画面では、遠くから見ないとはみ出すので距離を伸ばす
  const fit = max(1, 0.85 / (width / height));
  const d = cam.dist * h.dist * L * fit;
  const tx = 0;
  const ty = -L * 0.5; // 振り子の原点
  const tz = -cam.slide * L * DEPTH;
  const ex = d * sin(yaw) * cos(pitch);
  const ey = -d * sin(pitch);
  const ez = d * cos(yaw) * cos(pitch);
  // カメラの上方向:見下ろす角度に合わせて計算する(真上から見ても破綻しない)。そこに傾き(roll)を加える
  const up = createVector(sin(yaw) * sin(pitch), cos(pitch), cos(yaw) * sin(pitch));
  const forward = createVector(-ex, -ey, -ez).normalize();
  const side = p5.Vector.cross(forward, up).normalize();
  up.mult(cos(roll)).add(side.mult(sin(roll)));
  camera(tx + ex, ty + ey, tz + ez, tx, ty, tz, up.x, up.y, up.z);
  camUp = up;
  camRight = p5.Vector.cross(forward, up).normalize();
  // 絵全体を少し上に持ち上げる(カメラの向きは変えず、映す範囲だけを下にずらす。原点は画面上の決まった1点から動かない)
  const near = L * 0.5;
  const top = near * tan(PI / 6);
  const right = top * (width / height);
  // 裏の画像(ブルーム用)に描くときは上下が画面と逆になるので、ずらす向きも逆にする
  const shift = top * 2 * LIFT;
  frustum(-right, right, -top - shift, top - shift, near, L * 200);
}

function nextView() {
  viewIndex = (viewIndex + 1) % VIEWS.length;
  viewStart = millis() / 1000;
}

// ---- 描画 ----

// 軌跡の点を省くかどうかを決める。新しい点が来たときに、1つ前の点が
// 「最後に残した点」と「新しい点」を結んだ線の近くにあれば省く(それまでに省いた点も、すべてその線の近くにある場合だけ)
// 奥行きと広がりは点の順番に比例しているので、省いた点の位置は前後の点を結ぶ線の上にぴったり乗る
let simplify;
function markKeep(prev, now) {
  now.keep = new Array(N + 1).fill(true);
  if (!prev) return;
  const tol = SIMPLIFY * L;
  for (let i = 0; i <= N; i++) {
    const s = simplify[i];
    if (!s.last) {
      s.last = prev;
      continue;
    }
    const a = s.last[i];
    const b = now[i];
    const near = (p) => segmentDist(a, b, p) < tol;
    if (s.skipped.length < SIMPLIFY_RUN && near(prev[i]) && s.skipped.every(near)) {
      prev.keep[i] = false;
      s.skipped.push(prev[i]);
    } else {
      s.last = prev;
      s.skipped = [];
    }
  }
}

// 明るさと広がりは、何フレーム前の点かだけで決まるので、表にしておく(1点ごとに指数関数を計算しないため)
let fadeTable = null;
let spreadTable = null;
let bokehTable = null; // 芯の線の、古さごとの光の量(太さ × 濃さ)
let haloTable = null;  // にじみの線の濃さ。にじみを付ける範囲の終わりに向けて、なめらかに 0 にする
function makeTables() {
  fadeTable = [];
  spreadTable = [];
  bokehTable = [];
  haloTable = [];
  for (let a = 0; a <= HISTORY; a++) {
    fadeTable[a] = fadeAt(a / HISTORY);
    spreadTable[a] = spread(a / HISTORY);
    bokehTable[a] = 1.5 * Math.pow(1 + ((BOKEH - 1) * a) / HISTORY, 1 - BOKEH_DIM);
    const h = constrain((a / HISTORY - RECENT * 0.4) / (RECENT * 0.6), 0, 1);
    haloTable[a] = 1 - h * h * (3 - 2 * h);
  }
}

// 過去の明るさ。age は 0(現在)〜 1(一番古い過去)
// 新しい方で最初にぐっと下がり、そのあと、なだらかに TRAIL_FLOOR へ近づく。一番古い 1 割だけ、最後に消えていく
function fadeAt(age) {
  const ease = (exp(-FADE_SPEED * age) - exp(-FADE_SPEED)) / (1 - exp(-FADE_SPEED));
  return (TRAIL_FLOOR + (1 - TRAIL_FLOOR) * ease) * min(1, (1 - age) / 0.1);
}

// 過去を広げる倍率。age は 0(現在)〜 1(一番古い過去)。現在を頂点にした円錐のように広がる
function spread(age) {
  return 1 + EXPAND * pow(age, EXPAND_CURVE);
}

// i 番目の点(0 = 中心、N = 先端)の光の軌跡。新しいほど手前で明るく、古いほど奥で広がって薄く消えていく
// ボケ:古い(奥の)軌跡ほど、線を太く薄くして、ピントが外れたように見せる
// ぼけた線は「太くて薄い線」とほぼ同じに見えるので、画面全体をぼかすより、ずっと軽い
const BOKEH = 3;         // いちばん古い線が、新しい線の何倍の太さになるか(1 = ボケなし)
const BOKEH_BANDS = 16;  // 太さを変える段階の数(多いほど、太さの変わり目が目立たない)
const BOKEH_DIM = 0.6;   // 太くしたぶん暗くする強さ(1 = 太さに反比例して、光の総量をそのままにする)

function drawTrail(i) {
  noFill();
  const n = pend.trail.length;
  // ここより古い部分には、にじみを付けない(軽くするため)
  const recent = max(0, n - 1 - floor(HISTORY * RECENT));
  // 太く薄い線(にじみ)と、細く明るい線(芯)を重ねて、光っているように見せる
  drawRun(i, recent, n, 5, 0.18, haloTable);
  // 芯の線は、古さで区切って、古いほど太く描く
  // 太さは区切りごとにしか変えられないので、明るさは点ごとに「その区切りの太さで割る」。
  // 見た目の明るさ(太さ × 濃さ)が古さに沿ってなめらかに変わり、区切りで急に薄くならない
  for (let b = 0; b < BOKEH_BANDS; b++) {
    const to = n - floor((HISTORY * b) / BOKEH_BANDS);
    const from = max(0, n - 1 - floor((HISTORY * (b + 1)) / BOKEH_BANDS));
    if (to - from < 2) break;
    const weight = 1.5 * (1 + (BOKEH - 1) * ((b + 0.5) / BOKEH_BANDS));
    drawRun(i, from, to, weight, 1 / weight, bokehTable);
  }
}

// 軌跡のうち from から to の手前までを、1本の線で描く
function drawRun(i, from, to, weight, layer, light = null) {
  const c = color(TRAIL_COLORS[i]);
  const trail = pend.trail;
  const n = trail.length;
  const cy = -L * 0.5; // 広げる中心(支点の元の位置)
  const strength = layer * TRAIL_BRIGHTNESS[i];
  strokeWeight(weight);
  stroke(c);
  // 点ごとの色(0〜1 の4つの数)。p5.js は点を足すときにこの数を読むだけなので、
  // 点ごとに stroke() を呼んで色のオブジェクトを作る代わりに、数を直接書き換える(ずっと軽い)
  const r = _renderer;
  const fast = Array.isArray(r.curStrokeColor);
  const rgba = [red(c) / 255, green(c) / 255, blue(c) / 255, 1];
  beginShape();
  for (let k = from; k < to; k++) {
    // ほぼ一直線上の点は省く(最初と最後の点は必ず描く)
    if (k !== from && k !== to - 1 && trail[k].keep && !trail[k].keep[i]) continue;
    const ageIndex = n - 1 - k;
    const alpha = fadeTable[ageIndex] * strength * (light ? light[ageIndex] : 1);
    if (fast) {
      rgba[3] = alpha;
      r.curStrokeColor = rgba;
    } else {
      c.setAlpha(255 * alpha);
      stroke(c);
    }
    const pt = trail[k][i];
    const sc = spreadTable[ageIndex];
    vertex(pt.x * sc, cy + (pt.y - cy) * sc, -ageIndex * zStep);
  }
  endShape();
}

// 振り子本体:白く光る腕と、それぞれの色で光る点(先端が一番明るく、内側ほど控えめ)
function drawPendulum() {
  const pts = points(pend.th);
  blendMode(ADD);
  // 腕:細い芯の線のまわりに、うっすらにじみを付ける
  for (const [weight, a] of [[1.5, 220], [5, 45], [11, 14]]) {
    stroke(255, 255, 255, a);
    strokeWeight(weight);
    for (let i = 0; i < N; i++) line(pts[i].x, pts[i].y, 0, pts[i + 1].x, pts[i + 1].y, 0);
  }
  // 点:中心 → 1つ目の関節 → 2つ目の関節 → 先端 の順に、大きく明るくなる
  // 光は、中心からなめらかに減っていくグラデーションの画像を、いつもカメラの方を向く板に貼って描く
  const size = [0.65, 0.7, 0.75, 1];
  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST); // 光どうしが、互いに隠し合わないように
  noStroke();
  textureMode(NORMAL);
  for (let i = 0; i <= N; i++) {
    push();
    translate(pts[i].x, pts[i].y, 0);
    fill(255, 255, 255, 255 * size[i]);
    sphere(L * 0.05 * size[i], 12, 8);
    const r = L * GLOW_RADIUS * size[i];
    const ax = p5.Vector.mult(camRight, r);
    const ay = p5.Vector.mult(camUp, r);
    tint(255 * size[i]);
    texture(glowTex[i]);
    beginShape(TRIANGLE_STRIP);
    vertex(-ax.x - ay.x, -ax.y - ay.y, -ax.z - ay.z, 0, 0);
    vertex(ax.x - ay.x, ax.y - ay.y, ax.z - ay.z, 1, 0);
    vertex(-ax.x + ay.x, -ax.y + ay.y, -ax.z + ay.z, 0, 1);
    vertex(ax.x + ay.x, ax.y + ay.y, ax.z + ay.z, 1, 1);
    endShape();
    pop();
  }
  noTint();
  gl.enable(gl.DEPTH_TEST);
  blendMode(BLEND);
}

// 点の光の画像:中心から指数関数的に暗くなり、外側の縁でちょうど 0 になる
// (黒い部分は、光を足す描き方では何も足さないので、背景になじむ)
const GLOW_RADIUS = 0.5;  // 光の広がり(腕の長さに対する割合)
const GLOW_PEAK = 0.78;   // 中心付近の明るさ
const GLOW_FALLOFF = 0.1; // 明るさが 1/e になる距離(腕の長さに対する割合)
function makeGlow(hex) {
  const n = 128;
  const g = createGraphics(n, n);
  g.pixelDensity(1);
  g.loadPixels();
  const c = color(hex);
  const rgb = [red(c), green(c), blue(c)];
  const peak = GLOW_PEAK * Math.exp(0.07 / GLOW_FALLOFF);
  const edge = peak * Math.exp(-GLOW_RADIUS / GLOW_FALLOFF);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2) * GLOW_RADIUS;
      const v = Math.max(0, Math.min(GLOW_PEAK, peak * Math.exp(-d / GLOW_FALLOFF)) - edge);
      const k = 4 * (y * n + x);
      // ごく小さなざらつきを混ぜて、暗いところに色の段差(縞)が出ないようにする
      for (let j = 0; j < 3; j++) g.pixels[k + j] = Math.min(255, Math.max(0, rgb[j] * v + Math.random() - 0.5));
      g.pixels[k + 3] = 255;
    }
  }
  g.updatePixels();
  return g;
}

// 1秒ごとの輪:時間の目盛りとして、奥へ流れていく
function drawTimeFrames() {
  noFill();
  strokeWeight(1);
  const r = L * 3.2;
  for (let f = frameIndex - (frameIndex % 60); f > frameIndex - HISTORY; f -= 60) {
    const z = -(frameIndex - f) * zStep;
    stroke(150, 160, 190, map(z, 0, -HISTORY * zStep, 90, 0));
    push();
    translate(0, -L * 0.5, z);
    const sc = spread((frameIndex - f) / HISTORY);
    ellipse(0, 0, r * 2 * sc, r * 2 * sc, 64); // 64 角形で、大きく広げても丸く見えるようにする
    pop();
  }
}

// ---- 鍵盤 ----

function makeKeys(length = KEY_LENGTH) {
  keys = [];
  const at = (r, a) => ({ x: r * L * sin(a), y: -L * 0.5 + r * L * cos(a) });
  for (const ring of KEY_RINGS) {
    for (let k = 0; k < ring.n; k++) {
      const a = ring.start + (TWO_PI * k) / ring.n;
      const outer = at(ring.r, a);
      const inner = at(ring.r - length, a);
      keys.push({
        p1: outer,
        p2: inner,
        x: (outer.x + inner.x) / 2, // 線の真ん中(音の左右と、高さの段に使う)
        y: (outer.y + inner.y) / 2,
        glow: 0,
        last: -1,
      });
    }
  }
  // 音の高さ:鍵盤を高さの段に分け、下の段から順に低い音 → 高い音を割り当てる(同じ高さなら同じ音)
  const level = (key) => round(key.y / L, 1); // 腕の長さの 0.1 倍きざみで、同じ高さとみなす
  const levels = [...new Set(keys.map(level))].sort((a, b) => b - a); // 下(y が大きい)から順
  for (const key of keys) {
    const rank = levels.indexOf(level(key));
    key.note = round((rank * (KEY_NOTES - 1)) / max(1, levels.length - 1));
  }
}

// 前のフレームから今のフレームまでに、関節や先端が鍵盤の線を横切ったかを調べる
function checkKeys(prev, now) {
  const t = millis() / 1000;
  recentHits = recentHits.filter((h) => t - h < 1);
  for (let b = 1; b <= N; b++) {
    const a = prev[b];
    const c = now[b];
    for (const key of keys) {
      if (!segmentsCross(a, c, key.p1, key.p2)) continue; // 通り道が線を横切ったときだけ
      if (t - key.last < KEY_REST || recentHits.length >= KEY_MAX_RATE) continue;
      key.last = t;
      recentHits.push(t);
      const speed = dist(a.x, a.y, c.x, c.y) / L * 60; // ヒットしたときの速さ(腕の長さ / 秒)
      key.glow = 1;
      if (typeof window.onKeyHit === 'function') window.onKeyHit(key, b, speed);
    }
  }
}

// 線分 a-c と点 p の最短距離
function segmentDist(a, c, p) {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? constrain(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1) : 0;
  return dist(a.x + dx * u, a.y + dy * u, p.x, p.y);
}

// 線分 a-b と線分 c-d が交わるか
function segmentsCross(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// 鍵盤:ふだんからはっきりした白い線。鳴ると太くなって光り、ゆっくり元に戻る
function drawKeys() {
  noFill();
  const fadeStep = pow(0.95, min(deltaTime, 100) / (1000 / 60)); // 画面の更新の速さによらず、同じ速さで光が消える
  for (const key of keys) {
    // ふだんから、はっきりした白い線
    strokeWeight(1.5);
    stroke(255, 255, 255, 190);
    line(key.p1.x, key.p1.y, 0, key.p2.x, key.p2.y, 0);
    if (key.glow > 0.01) {
      // 鳴ったときは、線が太くなって光る
      const g = key.glow;
      for (const [weight, a] of [[1.5 + 3 * g, 255], [8 + 6 * g, 80], [18 + 10 * g, 28]]) {
        stroke(255, 255, 255, a * g);
        strokeWeight(weight);
        line(key.p1.x, key.p1.y, 0, key.p2.x, key.p2.y, 0);
      }
      key.glow *= fadeStep;
    }
  }
}

// 画面の大きさが変わっても(アプリの切り替えやアドレスバーの出入りなど)、やり直さずに続ける
// 振り子や軌跡の位置は腕の長さ L に比例しているので、新しい L に合わせて伸び縮みさせる
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  const k = (min(width, height) * 0.1) / L;
  L *= k;
  zStep = (L * DEPTH) / HISTORY;
  for (const pts of pend.trail) {
    for (const pt of pts) {
      pt.x *= k;
      pt.y *= k;
    }
  }
  const glow = keys.map((key) => [key.glow, key.last]);
  makeKeys();
  keys.forEach((key, i) => ([key.glow, key.last] = glow[i]));
}

function keyPressed() {
  if (key === 'r' || key === 'R') restart();
  if (key === 'v' || key === 'V') nextView();
}
