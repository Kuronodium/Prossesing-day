// 地層:時間とともに積もっていく
// マウスでドラッグすると回転、ホイールで拡大縮小、R キーで最初から

const N = 16;                 // 柱の数(N × N 本)
const CELL = 20;              // 柱1本の太さ
const MAX_LAYERS = 40;        // 何層まで積もるか
const FRAMES_PER_LAYER = 30;  // 1層が積もるのにかかるフレーム数(60で約1秒)
const GROUND = 120;           // 地面の位置

// 時代ごとの色(この中を noise でゆっくり行き来する)
const PALETTE = ['#f2e6c9', '#d9a441', '#a0522d', '#4a3426', '#9aa0a6', '#6b7f5e', '#e8e2d6'];

let done = [];    // 積もりきった層。1層 = 色 + 形(まとめて1つにしたもの)
let current;      // いま積もっている層。色 + 柱ごとの厚さ
let progress = 0; // current の進み具合(0 → 1)
let heights;      // 柱ごとの、積もりきった層のてっぺんの高さ

function setup() {
  createCanvas(600, 600, WEBGL);
  reset();
}

function reset() {
  for (const layer of done) freeGeometry(layer.shape);
  done = [];
  progress = 0;
  heights = [];
  for (let i = 0; i < N; i++) heights[i] = new Array(N).fill(0);
  current = makeLayer(0);
}

function draw() {
  background(245);
  orbitControl();
  ambientLight(170);
  directionalLight(200, 200, 200, 0.5, 0.6, -1);

  rotateX(-PI / 6);
  rotateY(frameCount * 0.003);

  // 時間を進める:今の層が積もりきったら固めて、次の層を始める
  if (current) {
    progress += 1 / FRAMES_PER_LAYER;
    if (progress >= 1) {
      finishLayer();
      progress = 0;
      current = done.length < MAX_LAYERS ? makeLayer(done.length) : null;
    }
  }

  noStroke();
  for (const layer of done) {
    fill(layer.c);
    model(layer.shape);
  }
  if (current) drawLayer(current, progress);
}

// k 番目の層の、色と厚さを決める
function makeLayer(k) {
  // 時代の色:noise で選ぶので、似た色がしばらく続いてから変わる
  const t = noise(k * 0.25, 100) * (PALETTE.length - 1);
  const c = lerpColor(color(PALETTE[floor(t)]), color(PALETTE[ceil(t)]), t % 1);

  // 場所ごとの厚さ:noise で起伏をつける。0 の場所は「その時代は積もらなかった」
  const thickness = [];
  for (let i = 0; i < N; i++) {
    thickness[i] = [];
    for (let j = 0; j < N; j++) {
      const n = noise(i * 0.15, j * 0.15, k * 0.08);
      thickness[i][j] = max(0, n * 14 - 3);
    }
  }
  return { c, thickness };
}

// 層を柱ごとの箱で描く。amount は厚さの割合(0 → 1 で育つ)
function drawLayer(layer, amount) {
  const offset = (N * CELL) / 2;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const t = layer.thickness[i][j] * amount;
      if (t < 0.5) continue;
      push();
      // WEBGL では y は下向きが正。地面から上へ積むので引き算する
      translate(i * CELL - offset, GROUND - heights[i][j] - t / 2, j * CELL - offset);
      fill(layer.c);
      box(CELL, t, CELL);
      pop();
    }
  }
}

// 積もりきった層を1つの形にまとめる(箱を1つずつ描くより、ずっと軽くなる)
function finishLayer() {
  const shape = buildGeometry(() => drawLayer(current, 1));
  done.push({ c: current.c, shape });
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (current.thickness[i][j] >= 0.5) heights[i][j] += current.thickness[i][j];
    }
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    noiseSeed(floor(random(10000))); // 毎回ちがう地層にする
    reset();
  }
}
