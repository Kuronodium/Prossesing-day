// 3重振り子の時空図:振り子は手前の平面で揺れ、各点が残す光の軌跡が奥(過去)へ流れていく
//   中心(支点)はピンク、接続部は青、先端は黄色のライト
// ドラッグで中心をずらせる(離すと、ばねで元の位置に戻る)。カメラは自動で視点を移る
// R キーでやり直し、V キーで次の視点へ

const N = 3;                // 振り子の段数
const G = 9.81;             // 重力
const SPEED = 1.6;          // 時間の進む速さ(1 で現実と同じ)
const SUBSTEPS = 10;        // 1フレームの計算を何回に分けるか(多いほど正確)
const DT = SPEED / 60 / SUBSTEPS;
const HISTORY = 900;        // 何フレーム分の過去を残すか(60で1秒)
const DEPTH = 30;           // 時間の奥行きの長さ(腕の長さの何倍か)
const EXPAND = 5;           // 一番古い過去を、どれだけ広げるか(0 で広げない。5 なら 6 倍)
const EXPAND_CURVE = 1;     // 広がり方(1 でまっすぐな円錐、大きいほど奥で急に開く)
// 始まり方:振り子全体が1本の棒のように回って円を描き、数秒でカオスへ崩れていく
const CIRCLE_MIN = 3;       // 円を描き続ける時間の下限(秒)
const CIRCLE_MAX = 6;       // 上限(秒)。この範囲に収まる初期値を、表示する前に裏で試して探す
const BREAK_ANGLE = 0.8;    // 腕どうしの角度がこれだけずれたら「円が崩れた」とみなす(ラジアン)

// 中心(支点)を動かすばね。強さが大きいほど速く戻り、減衰が大きいほど弾まずに止まる
const SPRING = 60;          // 離したときに、元の位置へ戻すばねの強さ
const SPRING_DAMP = 6;      // そのばねの減衰
const DRAG_SPRING = 150;    // ドラッグ中に、指へ引き寄せるばねの強さ
const DRAG_DAMP = 25;       // そのばねの減衰
const MAX_SHIFT = 1;        // 中心をずらせる最大距離(腕の長さの何倍か)
const MAX_ACCEL = 30;       // 中心の加速度の上限(重力 9.81 の約3倍)。指をどれだけ速く動かしても、これ以上の力は伝わらない
const SETTLE = 0.02;        // 揺さぶって増えたエネルギーを、1フレームで何割抜くか

// カメラの視点。yaw = 左右の回り込み、pitch = 見下ろす角度、dist = 距離(腕の長さの何倍か)
// focus = 時間の軸のどこを見るか(0 = 現在、1 = 一番古い過去)
// どの視点も「現在が手前、過去が奥」という向きは崩さない
const VIEWS = [
  { name: '斜め右', yaw: 0.5, pitch: 0.22, dist: 17, focus: 0.22 },
  { name: '正面', yaw: 0.05, pitch: 0.08, dist: 10, focus: 0.15 },
  { name: '斜め左', yaw: -0.5, pitch: 0.18, dist: 17, focus: 0.22 },
  { name: '斜め上', yaw: 0.25, pitch: 0.5, dist: 16, focus: 0.25 },
];
const VIEW_SECONDS = 10;    // 1つの視点にとどまる時間
const CAM_SPRING = 1.4;     // カメラを次の視点へ引き寄せるばねの強さ(大きいほど早く着く)
const CAM_DAMP = 1.9;       // そのばねの減衰(小さいほど、行き過ぎてから戻る)
const WANDER = 1;           // カメラがさまよう大きさ(0 で決めポイントに止まる)
const ATTENTION = 0.25;     // 見る点が、振り子の先端へ引っぱられる割合

// 鍵盤:支点のまわりに置いた小さな輪。関節か先端が輪に入った瞬間、その音が鳴る
// r = 支点からの距離(腕の長さの何倍か)、n = その輪に並べる数、start = 1つ目を置く向き(0 = 真下、PI = 真上)
// 1つの輪に等間隔で並べる。音の高さは画面上の高さで決まる(上にあるほど高い音)
// 距離 2 は、最初の円(腕が伸びきって回る間)に2つ目の関節がちょうど通る距離。円の間は規則正しく、崩れるとランダムに鳴る
const KEY_RINGS = [{ r: 2.45, n: 8, start: Math.PI }];
const KEY_NOTES = 8;        // 音の段の数(sound.js の SCALE の長さと合わせる)
const KEY_SIZE = 0.2;       // 鍵盤の輪の半径(腕の長さの何倍か)
const KEY_REST = 0.25;      // 同じ鍵盤を続けて鳴らすまでの、最短の間隔(秒)
const KEY_MAX_RATE = 3;     // 全体で1秒に鳴らす最大の数

const BG = [8, 9, 15];
// 軌跡の色:中心、接続部1、接続部2、先端 の順
const TRAIL_COLORS = ['#ff5c8a', '#3d7bff', '#3d7bff', '#ffc94d'];
const BODY = [150, 155, 166]; // 振り子本体の色(マットな灰色)

let pend;       // 振り子
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

function setup() {
  pixelDensity(min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight, WEBGL);
  restart();
}

function restart() {
  L = min(width, height) * 0.1;
  zStep = (L * DEPTH) / HISTORY;
  frameIndex = 0;
  const start = findCircleStart();
  pend = { th: start.th, w: start.w, trail: [] };
  pend.baseEnergy = energy(pend); // 最初のエネルギー。揺さぶって増えても、ここへ戻っていく
  pivot = { x: 0, y: 0, vx: 0, vy: 0 };
  drag = null;
  makeKeys();
}

function draw() {
  background(BG);
  updateCamera();

  const target = dragTarget();
  for (let s = 0; s < SUBSTEPS; s++) {
    const a = movePivot(target);
    rk4(pend, a.x, a.y);
  }
  settle(pend);
  const prevPts = pend.trail[pend.trail.length - 1];
  const nowPts = points(pend.th);
  pend.trail.push(nowPts);
  if (prevPts) checkKeys(prevPts, nowPts);
  if (pend.trail.length > HISTORY) pend.trail.shift();
  frameIndex++;

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
  drawBulb();
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

// ---- 始まり方を探す ----

// 円を描く時間が CIRCLE_MIN 〜 CIRCLE_MAX 秒になる初期値を、試しに動かして探す
function findCircleStart() {
  let best = null;
  for (let tries = 0; tries < 40; tries++) {
    // 3本の腕をほぼ同じ角度・同じ速さで回し、ほんの少しだけずらす
    const a = random(TWO_PI);
    const spin = random([-1, 1]) * random(3.5, 6);
    const nudge = pow(10, random(-3, -0.7)); // ずれの大きさ(0.001 〜 0.2):小さいほど長く円が続く
    const cand = {
      th: [a, a + random(-1, 1) * nudge, a + random(-1, 1) * nudge],
      w: [spin, spin, spin],
    };
    const secs = circleSeconds(cand);
    const miss = secs < CIRCLE_MIN ? CIRCLE_MIN - secs : secs > CIRCLE_MAX ? secs - CIRCLE_MAX : 0;
    if (!best || miss < best.miss) best = { th: cand.th.slice(), w: cand.w.slice(), miss, secs };
    if (miss === 0) break;
  }
  return best;
}

// 腕どうしの角度が BREAK_ANGLE 以上ずれるまでの時間(画面上の秒)
function circleSeconds(start) {
  const q = { th: start.th.slice(), w: start.w.slice() };
  const dt = 0.01;
  const limit = (CIRCLE_MAX + 2) * SPEED;
  for (let t = 0; t < limit; t += dt) {
    rk4(q, 0, 0, dt);
    for (let i = 1; i < N; i++) {
      const d = q.th[i] - q.th[i - 1];
      if (abs(atan2(sin(d), cos(d))) > BREAK_ANGLE) return t / SPEED;
    }
  }
  return limit / SPEED;
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
// 目標 = 決めポイントの視点 + 不規則な漂い + 振り子の先端への注目
// さらに最後に、手持ちの細かい揺れを直接足す(ばねを通すと均されて消えてしまうため)

const CAM_KEYS = ['yaw', 'pitch', 'dist', 'focus', 'lookX', 'lookY', 'roll'];

// カメラが行きたい場所
function camGoal(t) {
  const v = VIEWS[viewIndex];
  // n(速さ, 番号):-1 〜 1 の、なめらかで不規則な値
  const n = (speed, k) => (noise(t * speed, k * 17.3) - 0.5) * 2;
  const tip = points(pend.th)[N];
  const pivotY = -L * 0.5 + pivot.y * L;
  return {
    yaw: v.yaw + WANDER * 0.22 * n(0.07, 1),
    pitch: v.pitch + WANDER * 0.09 * n(0.06, 3),
    dist: v.dist * (1 + WANDER * 0.14 * n(0.05, 5)) * (drag ? 0.85 : 1), // 干渉している間は少し寄る
    focus: v.focus + WANDER * 0.05 * n(0.04, 6),
    lookX: tip.x * ATTENTION,
    lookY: (tip.y - pivotY) * ATTENTION,
    roll: WANDER * 0.03 * n(0.09, 7), // ごくわずかな傾き
  };
}

// 手持ちの細かい揺れ(呼吸のような、ゆっくりした小さな揺れ)
function handheld(t) {
  const n = (speed, k) => (noise(t * speed, k * 31.7) - 0.5) * 2;
  return {
    yaw: WANDER * 0.035 * n(0.45, 1),
    pitch: WANDER * 0.02 * n(0.5, 2),
    dist: 1 + WANDER * 0.025 * n(0.35, 3),
    roll: WANDER * 0.01 * n(0.6, 4),
  };
}

function updateCamera() {
  const t = millis() / 1000;
  if (t - viewStart > VIEW_SECONDS) nextView();
  const goal = camGoal(t);
  if (!cam) {
    cam = { vel: {} };
    for (const k of CAM_KEYS) {
      cam[k] = goal[k];
      cam.vel[k] = 0;
    }
  }
  // ばねで目標へ引き寄せる(1フレーム = 1/60 秒)
  const dt = 1 / 60;
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
  const tx = cam.lookX;
  const ty = -L * 0.5 + cam.lookY;
  const tz = -cam.focus * L * DEPTH;
  camera(
    tx + d * sin(yaw) * cos(pitch),
    ty - d * sin(pitch),
    tz + d * cos(yaw) * cos(pitch),
    tx, ty, tz,
    sin(roll), cos(roll), 0
  );
  perspective(PI / 3, width / height, L * 0.5, L * 200);
}

function nextView() {
  viewIndex = (viewIndex + 1) % VIEWS.length;
  viewStart = millis() / 1000;
}

// ---- 描画 ----

// 過去を広げる倍率。age は 0(現在)〜 1(一番古い過去)。現在を頂点にした円錐のように広がる
function spread(age) {
  return 1 + EXPAND * pow(age, EXPAND_CURVE);
}

// i 番目の点(0 = 中心、N = 先端)の光の軌跡。新しいほど手前で明るく、古いほど奥で広がって薄く消えていく
function drawTrail(i) {
  noFill();
  const c = color(TRAIL_COLORS[i]);
  const trail = pend.trail;
  const n = trail.length;
  // 太く薄い線(にじみ)と、細く明るい線(芯)を重ねて、光っているように見せる
  for (const [weight, strength] of [[5, 0.18], [1.5, 1]]) {
    strokeWeight(weight);
    beginShape();
    for (let k = 0; k < n; k++) {
      const fade = pow(k / n, 1.6); // 古いほど 0 に近づく
      c.setAlpha(255 * fade * strength);
      stroke(c);
      const pt = trail[k][i];
      const sc = spread((n - 1 - k) / HISTORY);
      const cy = -L * 0.5; // 広げる中心(支点の元の位置)
      vertex(pt.x * sc, cy + (pt.y - cy) * sc, -(n - 1 - k) * zStep);
    }
    endShape();
  }
}

// 振り子本体:マットな灰色の、平らな線と円
function drawPendulum() {
  const pts = points(pend.th);
  stroke(...BODY);
  strokeWeight(L * 0.07);
  for (let i = 0; i < N; i++) line(pts[i].x, pts[i].y, 0, pts[i + 1].x, pts[i + 1].y, 0);
  noStroke();
  fill(...BODY);
  for (let i = 0; i < N; i++) circle(pts[i].x, pts[i].y, L * 0.18);
}

// 先端の電球:自分で光る球と、まわりのぼんやりした光
function drawBulb() {
  const tip = points(pend.th)[N];
  noStroke();
  push();
  translate(tip.x, tip.y, 0);
  fill(255);
  sphere(L * 0.06, 12, 8);
  blendMode(ADD);
  const c = color(TRAIL_COLORS[N]);
  for (const [r, a] of [[0.12, 120], [0.22, 45], [0.38, 18]]) {
    c.setAlpha(a);
    fill(c);
    sphere(L * r, 14, 10);
  }
  blendMode(BLEND);
  pop();
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

function makeKeys() {
  keys = [];
  for (const ring of KEY_RINGS) {
    for (let k = 0; k < ring.n; k++) {
      const a = ring.start + (TWO_PI * k) / ring.n;
      keys.push({
        x: ring.r * L * sin(a),
        y: -L * 0.5 + ring.r * L * cos(a),
        glow: 0,
        col: color(255),
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

// 前のフレームから今のフレームまでに、関節や先端が鍵盤の輪に入ったかを調べる
function checkKeys(prev, now) {
  const t = millis() / 1000;
  const r = KEY_SIZE * L;
  recentHits = recentHits.filter((h) => t - h < 1);
  for (let b = 1; b <= N; b++) {
    const a = prev[b];
    const c = now[b];
    for (const key of keys) {
      const wasOutside = dist(a.x, a.y, key.x, key.y) > r;
      if (!wasOutside || segmentDist(a, c, key) > r) continue; // 通り道が輪にかかったときだけ
      if (t - key.last < KEY_REST || recentHits.length >= KEY_MAX_RATE) continue;
      key.last = t;
      recentHits.push(t);
      const speed = dist(a.x, a.y, c.x, c.y) / L * 60; // ヒットしたときの速さ(腕の長さ / 秒)
      key.glow = 1;
      key.col = color(TRAIL_COLORS[b]);
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

// 鍵盤:ふだんは薄い輪、ヒットすると光ってゆっくり消える
function drawKeys() {
  const r = KEY_SIZE * L;
  for (const key of keys) {
    push();
    translate(key.x, key.y, 0);
    noFill();
    strokeWeight(1);
    stroke(150, 160, 190, 60);
    ellipse(0, 0, r * 2, r * 2, 32);
    if (key.glow > 0.01) {
      const c = key.col;
      noStroke();
      for (const [size, a] of [[1, 160], [1.8, 50], [3, 18]]) {
        c.setAlpha(a * key.glow);
        fill(c);
        ellipse(0, 0, r * size, r * size, 32);
      }
      key.glow *= 0.95;
    }
    pop();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  restart();
}

function keyPressed() {
  if (key === 'r' || key === 'R') restart();
  if (key === 'v' || key === 'V') nextView();
}
