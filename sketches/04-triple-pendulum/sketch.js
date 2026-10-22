// 3重振り子の時空図:振り子は手前の平面で揺れ、各点が残す光の軌跡が奥(過去)へ流れていく
//   中心(支点)はピンク、接続部は青、先端は黄色のライト
// ドラッグで回転、ピンチ(ホイール)で拡大縮小、R キーでやり直し

const N = 3;                // 振り子の段数
const G = 9.81;             // 重力
const SPEED = 1.6;          // 時間の進む速さ(1 で現実と同じ)
const SUBSTEPS = 10;        // 1フレームの計算を何回に分けるか(多いほど正確)
const DT = SPEED / 60 / SUBSTEPS;
const HISTORY = 900;        // 何フレーム分の過去を残すか(60で1秒)
const DEPTH = 30;           // 時間の奥行きの長さ(腕の長さの何倍か)
const START_SPIN = 4;       // 最初の勢いの最大値(1秒あたりの回転角、ラジアン)

const BG = [8, 9, 15];
// 軌跡の色:中心、接続部1、接続部2、先端 の順
const TRAIL_COLORS = ['#ff5c8a', '#3d7bff', '#3d7bff', '#ffc94d'];
const BODY = [150, 155, 166]; // 振り子本体の色(マットな灰色)

let pend;       // 振り子
let L;          // 腕1本の長さ(画面上のピクセル)
let zStep;      // 1フレームで、どれだけ奥へ流れるか
let frameIndex; // 始まってからのフレーム数

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
}

function draw() {
  background(BG);
  orbitControl();
  // 時間の軸に沿って、斜め前から覗き込む
  rotateY(-0.38);
  rotateX(-0.2);
  translate(L * 0.6, 0, L * 5);

  for (let s = 0; s < SUBSTEPS; s++) rk4(pend);
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
function accel(th, w) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const f = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const below = N - max(i, j); // i と j の両方より下にあるおもりの数
      M[i][j] = below * cos(th[i] - th[j]);
      f[i] -= below * sin(th[i] - th[j]) * w[j] * w[j];
    }
    f[i] -= (N - i) * G * sin(th[i]);
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
function rk4(p) {
  const add = (a, b, s) => a.map((v, i) => v + b[i] * s);
  const k1w = accel(p.th, p.w), k1t = p.w;
  const k2w = accel(add(p.th, k1t, DT / 2), add(p.w, k1w, DT / 2)), k2t = add(p.w, k1w, DT / 2);
  const k3w = accel(add(p.th, k2t, DT / 2), add(p.w, k2w, DT / 2)), k3t = add(p.w, k2w, DT / 2);
  const k4w = accel(add(p.th, k3t, DT), add(p.w, k3w, DT)), k4t = add(p.w, k3w, DT);
  for (let i = 0; i < N; i++) {
    p.th[i] += (DT / 6) * (k1t[i] + 2 * k2t[i] + 2 * k3t[i] + k4t[i]);
    p.w[i] += (DT / 6) * (k1w[i] + 2 * k2w[i] + 2 * k3w[i] + k4w[i]);
  }
}

// 角度から、中心(支点)と3つのおもりの画面上の位置を求める
function points(th) {
  let x = 0;
  let y = -L * 0.5; // 支点は少し上
  const pts = [{ x, y }];
  for (let i = 0; i < N; i++) {
    x += L * sin(th[i]);
    y += L * cos(th[i]);
    pts.push({ x, y });
  }
  return pts;
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
}
