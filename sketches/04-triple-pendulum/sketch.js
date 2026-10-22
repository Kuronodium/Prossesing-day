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
const START_SPIN = 4;       // 最初の勢いの最大値(1秒あたりの回転角、ラジアン)

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
const VIEWS = [
  { name: '斜め', yaw: 0.5, pitch: 0.22, dist: 17, focus: 0.22 },
  { name: '正面', yaw: 0.05, pitch: 0.08, dist: 10, focus: 0.15 },
  { name: '真横', yaw: Math.PI / 2, pitch: 0.12, dist: 17, focus: 0.42 },
  { name: '上', yaw: 0.35, pitch: 1.15, dist: 22, focus: 0.45 },
  { name: '過去から', yaw: Math.PI - 0.45, pitch: 0.25, dist: 16, focus: 0.55 },
];
const VIEW_SECONDS = 10;    // 1つの視点にとどまる時間
const MOVE_SECONDS = 3;     // 次の視点へ移る時間

const BG = [8, 9, 15];
// 軌跡の色:中心、接続部1、接続部2、先端 の順
const TRAIL_COLORS = ['#ff5c8a', '#3d7bff', '#3d7bff', '#ffc94d'];
const BODY = [150, 155, 166]; // 振り子本体の色(マットな灰色)

let pend;       // 振り子
let pivot;      // 中心のずれ(腕の長さを 1 とした位置と速度)
let drag;       // ドラッグ中なら、始めた時の指と中心の位置。していなければ null
let L;          // 腕1本の長さ(画面上のピクセル)
let zStep;      // 1フレームで、どれだけ奥へ流れるか
let frameIndex; // 始まってからのフレーム数
let viewIndex = 0;   // いまの視点
let viewStart = 0;   // いまの視点に移り始めた時刻(秒)
let camFrom = null;  // 移る前のカメラ(移っている途中の位置から、なめらかにつなぐため)

function setup() {
  pixelDensity(min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight, WEBGL);
  restart();
}

function restart() {
  L = min(width, height) * 0.1;
  zStep = (L * DEPTH) / HISTORY;
  frameIndex = 0;
  // ほぼ真上まで持ち上げて、さらに勢いをつけて放す(上まで回り込めるだけのエネルギーを与える)
  const th = [0, 0, 0].map(() => random([-1, 1]) * random(2.6, PI));
  const w = [0, 0, 0].map(() => random(-START_SPIN, START_SPIN));
  pend = { th, w, trail: [] };
  pend.baseEnergy = energy(pend); // 最初のエネルギー。揺さぶって増えても、ここへ戻っていく
  pivot = { x: 0, y: 0, vx: 0, vy: 0 };
  drag = null;
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
  pend.trail.push(points(pend.th));
  if (pend.trail.length > HISTORY) pend.trail.shift();
  frameIndex++;

  // 光の部分:重なるほど明るくなる「加算合成」で、前後関係は気にせず描く
  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST);
  blendMode(ADD);
  drawTimeFrames();
  for (let i = 0; i <= N; i++) drawTrail(i);
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

// ルンゲ=クッタ法(RK4)で、時間を DT だけ進める
function rk4(p, ax = 0, ay = 0) {
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

// いまのカメラ設定(視点 + ゆっくりした漂い)
function currentCam() {
  const t = millis() / 1000;
  if (!camFrom) return drifted(VIEWS[viewIndex], t);
  const k = constrain((t - viewStart) / MOVE_SECONDS, 0, 1);
  const e = k * k * (3 - 2 * k); // ゆっくり動き出して、ゆっくり止まる
  const to = drifted(VIEWS[viewIndex], t);
  const from = camFrom;
  // 角度は近い向きに回る
  let dy = to.yaw - from.yaw;
  dy = ((dy + PI) % TWO_PI + TWO_PI) % TWO_PI - PI;
  return {
    yaw: from.yaw + dy * e,
    pitch: lerp(from.pitch, to.pitch, e),
    dist: lerp(from.dist, to.dist, e),
    focus: lerp(from.focus, to.focus, e),
  };
}

// 視点に、ゆっくりした揺らぎ(回り込み・上下・寄り引き)を足す
function drifted(v, t) {
  return {
    yaw: v.yaw + 0.18 * sin(t * 0.11),
    pitch: v.pitch + 0.06 * sin(t * 0.17),
    dist: v.dist * (1 + 0.1 * sin(t * 0.07)),
    focus: v.focus,
  };
}

function updateCamera() {
  const t = millis() / 1000;
  if (t - viewStart > VIEW_SECONDS) nextView();
  const c = currentCam();
  // 縦長の画面では、遠くから見ないとはみ出すので距離を伸ばす
  const fit = max(1, 0.85 / (width / height));
  const d = c.dist * L * fit;
  const tx = 0;
  const ty = -L * 0.5;
  const tz = -c.focus * L * DEPTH;
  camera(
    tx + d * sin(c.yaw) * cos(c.pitch),
    ty - d * sin(c.pitch),
    tz + d * cos(c.yaw) * cos(c.pitch),
    tx, ty, tz,
    0, 1, 0
  );
  perspective(PI / 3, width / height, L * 0.5, L * 200);
}

function nextView() {
  camFrom = currentCam();
  viewIndex = (viewIndex + 1) % VIEWS.length;
  viewStart = millis() / 1000;
}

// ---- 描画 ----

// i 番目の点(0 = 中心、N = 先端)の光の軌跡。新しいほど手前で明るく、古いほど奥で薄く消えていく
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
      vertex(pt.x, pt.y, -(n - 1 - k) * zStep);
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

// 1秒ごとの枠:時間の目盛りとして、奥へ流れていく
function drawTimeFrames() {
  noFill();
  strokeWeight(1);
  const r = L * 3.2;
  for (let f = frameIndex - (frameIndex % 60); f > frameIndex - HISTORY; f -= 60) {
    const z = -(frameIndex - f) * zStep;
    stroke(120, 130, 160, map(z, 0, -HISTORY * zStep, 50, 0));
    push();
    translate(0, -L * 0.5, z);
    rectMode(CENTER);
    rect(0, 0, r * 2, r * 2);
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
