// ライフゲーム:2つのルールだけで、模様が生まれて動き続ける
//   ・生きているセルは、まわりの仲間が 2〜3 個なら生き残る(それ以外は死ぬ)
//   ・死んでいるセルは、まわりの仲間がちょうど 3 個なら生まれる
// 指(マウス)でなぞると、そこにセルが生まれる

const CELL = 10;             // セル1つの大きさ
const FRAMES_PER_STEP = 4;   // 何フレームごとに1世代進めるか(小さいほど速い)
const OLD_AGE = 40;          // この世代数まで生きると「一番古い色」になる

const BG = '#f1ece2';
const YOUNG = '#e4572e';     // 生まれたばかりの色
const OLD = '#2b2d42';       // 長生きしたセルの色

let cols, rows;
let age;        // セルごとの年齢。0 は死んでいる、1 以上は生きている
let generation = 0;

function setup() {
  pixelDensity(min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight);
  noStroke();
  randomize();
}

function makeGrid() {
  cols = floor(width / CELL);
  rows = floor(height / CELL);
  age = new Array(cols * rows).fill(0);
  generation = 0;
}

function randomize() {
  makeGrid();
  for (let i = 0; i < age.length; i++) age[i] = random() < 0.25 ? 1 : 0;
}

function clearAll() {
  makeGrid();
}

function draw() {
  paintWithFinger();
  if (frameCount % FRAMES_PER_STEP === 0) step();

  background(BG);
  const young = color(YOUNG);
  const old = color(OLD);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const a = age[x + y * cols];
      if (a === 0) continue;
      // 年齢で色を変える:若いほど赤く、長生きするほど濃い紺に
      fill(lerpColor(young, old, min(a, OLD_AGE) / OLD_AGE));
      rect(x * CELL, y * CELL, CELL - 1, CELL - 1, 2);
    }
  }
}

// 1世代進める
function step() {
  const next = new Array(age.length).fill(0);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const n = countNeighbors(x, y);
      const i = x + y * cols;
      const alive = age[i] > 0;
      if (alive && (n === 2 || n === 3)) next[i] = age[i] + 1; // 生き残る(1つ年をとる)
      else if (!alive && n === 3) next[i] = 1;                  // 生まれる
    }
  }
  age = next;
  generation++;
}

// まわり8マスのうち、生きているセルの数。画面の端は反対側とつながっている
function countNeighbors(x, y) {
  let n = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + cols) % cols;
      const ny = (y + dy + rows) % rows;
      if (age[nx + ny * cols] > 0) n++;
    }
  }
  return n;
}

// 指の近くのセルを、ところどころ生まれさせる(全部埋めると、すぐ死んでしまうため)
function paintWithFinger() {
  const fingers = touches.length > 0 ? touches : mouseIsPressed ? [{ x: mouseX, y: mouseY }] : [];
  for (const f of fingers) {
    const cx = floor(f.x / CELL);
    const cy = floor(f.y / CELL);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
        if (random() < 0.3) age[x + y * cols] = 1;
      }
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  randomize();
}

function keyPressed() {
  if (key === 'r' || key === 'R') randomize();
  if (key === 'c' || key === 'C') clearAll();
}
