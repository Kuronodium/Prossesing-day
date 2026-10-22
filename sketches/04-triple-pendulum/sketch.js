// 3重振り子の時空図:振り子は手前の平面で揺れ、先端のライトが残す光の軌跡が奥(過去)へ流れていく
// 2つの振り子は、最初の角度が DIFF だけ違う。はじめは重なって見えるが、やがて別れる
// ドラッグで回転、ピンチ(ホイール)で拡大縮小、R キーでやり直し

const N = 3;                // 振り子の段数
const G = 9.81;             // 重力
const SPEED = 1.6;          // 時間の進む速さ(1 で現実と同じ)
const SUBSTEPS = 10;        // 1フレームの計算を何回に分けるか(多いほど正確)
const DT = SPEED / 60 / SUBSTEPS;
const HISTORY = 900;        // 何フレーム分の過去を残すか(60で1秒)
const DEPTH = 30;           // 時間の奥行きの長さ(腕の長さの何倍か)
const DIFF = 0.001;         // 2つ目の振り子の、最初の角度のずれ(ラジアン)

const BG = [8, 9, 15];
const LIGHTS = ['#ffc94d', '#5fe0d4']; // 先端のライトの色(振り子A、振り子B)
const METAL = [190, 194, 204];        // 腕と関節の色

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
  L = min(width, height) * 0.1;
  zStep = (L * DEPTH) / HISTORY;
  frameIndex = 0;
  const start = [random(1.6, 2.6), random(1.6, 2.6), random(1.6, 2.6)]; // 高く持ち上げてから放す
  const startB = [start[0], start[1], start[2] + DIFF];
  pendulums = [makePendulum(start, LIGHTS[0]), makePendulum(startB, LIGHTS[1])];
}

function makePendulum(angles, col) {
  return { th: angles.slice(), w: [0, 0, 0], col, trail: [] };
}

function draw() {
  background(BG);
  orbitControl();
  // 時間の軸に沿って、斜め前から覗き込む
  rotateY(-0.38);
  rotateX(-0.2);
  translate(L * 0.6, 0, L * 5);

  for (const p of pendulums) {
    for (let s = 0; s < SUBSTEPS; s++) rk4(p);
    p.trail.push(bobPositions(p.th)[N - 1]);
    if (p.trail.length > HISTORY) p.trail.shift();
  }
  frameIndex++;

  // 光の部分:重なるほど明るくなる「加算合成」で、前後関係は気にせず描く
  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST);
  blendMode(ADD);
  drawTimeFrames();
  for (const p of pendulums) drawTrail(p);
  blendMode(BLEND);
  gl.enable(gl.DEPTH_TEST);

  // 振り子本体:先端のライトに照らされる、しっかりした形
  for (const p of pendulums) drawPendulum(p);
  for (const p of pendulums) drawBulb(p);
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

// 光の軌跡:新しいほど手前で明るく、古いほど奥で薄く消えていく
function drawTrail(p) {
  noFill();
  const c = color(p.col);
  const n = p.trail.length;
  // 太く薄い線(にじみ)と、細く明るい線(芯)を重ねて、光っているように見せる
  for (const [weight, strength] of [[5, 0.18], [1.5, 1]]) {
    strokeWeight(weight);
    beginShape();
    for (let k = 0; k < n; k++) {
      const fade = pow(k / n, 1.6); // 古いほど 0 に近づく
      c.setAlpha(255 * fade * strength);
      stroke(c);
      const pt = p.trail[k];
      vertex(pt.x, pt.y, -(n - 1 - k) * zStep);
    }
    endShape();
  }
}

// 振り子本体:金属の腕(円柱)と関節(球)
function drawPendulum(p) {
  ambientLight(35);
  directionalLight(70, 70, 80, 0.3, 0.6, -1);
  // 両方の振り子の先端ライトが、まわりを照らす
  for (const q of pendulums) {
    const tip = bobPositions(q.th)[N - 1];
    pointLight(color(q.col), tip.x, tip.y, L * 0.4);
  }
  noStroke();
  fill(...METAL); // 軌跡で使った noFill() を戻す
  specularMaterial(...METAL);
  shininess(40);

  const pts = bobPositions(p.th);
  let prev = { x: 0, y: -L * 0.5 };
  push();
  translate(prev.x, prev.y, 0);
  box(L * 0.25, L * 0.08, L * 0.12); // 支点の金具
  pop();
  for (let i = 0; i < N; i++) {
    const pt = pts[i];
    push();
    translate((prev.x + pt.x) / 2, (prev.y + pt.y) / 2, 0);
    rotateZ(-p.th[i]);
    cylinder(L * 0.045, L, 12, 1);
    pop();
    if (i < N - 1) {
      push();
      translate(pt.x, pt.y, 0);
      sphere(L * 0.09, 16, 12);
      pop();
    }
    prev = pt;
  }
}

// 先端の電球:自分で光る球と、まわりのぼんやりした光
function drawBulb(p) {
  const tip = bobPositions(p.th)[N - 1];
  noLights();
  noStroke();
  push();
  translate(tip.x, tip.y, 0);
  fill(255);
  sphere(L * 0.06, 12, 8);
  blendMode(ADD);
  const c = color(p.col);
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
