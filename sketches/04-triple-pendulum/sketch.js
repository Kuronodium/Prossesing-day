// 3重振り子の時空図:振り子は手前の平面で揺れ、通った跡が奥(過去)へ流れていく
// 2つの振り子は、最初の角度が DIFF だけ違う。はじめは重なって見えるが、やがて別れる
// ドラッグで回転、ピンチ(ホイール)で拡大縮小、R キーでやり直し

const N = 3;                // 振り子の段数
const G = 9.81;             // 重力
const SUBSTEPS = 8;         // 1フレームの計算を何回に分けるか(多いほど正確)
const DT = 1 / 60 / SUBSTEPS;
const HISTORY = 600;        // 何フレーム分の過去を残すか(60で1秒)
const DIFF = 0.001;         // 2つ目の振り子の、最初の角度のずれ(ラジアン)

const BG = [12, 14, 22];
const COLORS = ['#f2c14e', '#6fd3c9']; // 振り子A、振り子B

let pendulums = [];
let L;          // 腕1本の長さ(画面上のピクセル)
let zStep;      // 1フレームで、どれだけ奥へ流れるか
let frameIndex; // 始まってからのフレーム数

function setup() {
  pixelDensity(min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight, WEBGL);
  restart();
}

function restart() {
  L = min(width, height) * 0.09;
  zStep = L * 0.016; // 時間の奥行きを、振り子の大きさに合わせる
  frameIndex = 0;
  const start = [random(1.6, 2.6), random(1.6, 2.6), random(1.6, 2.6)]; // 高く持ち上げてから放す
  const startB = [start[0], start[1], start[2] + DIFF];
  pendulums = [makePendulum(start, COLORS[0]), makePendulum(startB, COLORS[1])];
}

function makePendulum(angles, col) {
  return { th: angles.slice(), w: [0, 0, 0], col, trail: [] };
}

function draw() {
  background(BG);
  orbitControl();
  rotateY(-0.75);
  rotateX(-0.25);
  translate(0, 0, (HISTORY * zStep) / 2); // 時空図の真ん中を画面の中心に

  for (const p of pendulums) {
    for (let s = 0; s < SUBSTEPS; s++) rk4(p);
    p.trail.push(bobPositions(p.th));
    if (p.trail.length > HISTORY) p.trail.shift();
  }
  frameIndex++;

  drawTimeFrames();
  for (const p of pendulums) drawTrail(p);
  for (const p of pendulums) drawArms(p);
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

// 角度から、3つのおもりの画面上の位置を求める(支点は少し上)
function bobPositions(th) {
  const pts = [];
  let x = 0;
  let y = -L * 0.5;
  for (let i = 0; i < N; i++) {
    x += L * sin(th[i]);
    y += L * cos(th[i]);
    pts.push({ x, y });
  }
  return pts;
}

// ---- 描画 ----

// 通った跡:新しいほど手前(z = 0)、古いほど奥
function drawTrail(p) {
  noFill();
  const c = color(p.col);
  for (let b = 0; b < N; b++) {
    c.setAlpha(b === N - 1 ? 230 : 70); // 先端のおもりを一番目立たせる
    stroke(c);
    strokeWeight(b === N - 1 ? 1.6 : 1);
    beginShape();
    const n = p.trail.length;
    for (let k = 0; k < n; k++) {
      const pt = p.trail[k][b];
      vertex(pt.x, pt.y, -(n - 1 - k) * zStep);
    }
    endShape();
  }
}

// いまの振り子の腕とおもり(手前の平面)
function drawArms(p) {
  const pts = bobPositions(p.th);
  stroke(p.col);
  strokeWeight(2);
  let prev = { x: 0, y: -L * 0.5 };
  for (const pt of pts) {
    line(prev.x, prev.y, 0, pt.x, pt.y, 0);
    prev = pt;
  }
  noStroke();
  fill(p.col);
  for (const pt of pts) {
    push();
    translate(pt.x, pt.y, 0);
    sphere(L * 0.06, 8, 6);
    pop();
  }
}

// 1秒ごとの枠:時間の目盛りとして、奥へ流れていく
function drawTimeFrames() {
  noFill();
  strokeWeight(1);
  const r = L * 3.2;
  for (let f = frameIndex - (frameIndex % 60); f > frameIndex - HISTORY; f -= 60) {
    const z = -(frameIndex - f) * zStep;
    stroke(255, 255, 255, map(z, 0, -HISTORY * zStep, 40, 0));
    push();
    translate(0, -L * 0.5, z);
    rectMode(CENTER);
    rect(0, 0, r * 2, r * 2);
    pop();
  }
}

// 2つの振り子の先端どうしの距離(ずれの大きさ)
function tipGap() {
  const a = bobPositions(pendulums[0].th)[N - 1];
  const b = bobPositions(pendulums[1].th)[N - 1];
  return dist(a.x, a.y, b.x, b.y);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  restart();
}

function keyPressed() {
  if (key === 'r' || key === 'R') restart();
}
