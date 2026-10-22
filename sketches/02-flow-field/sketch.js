// フローフィールド:見えない「流れ」に沿って、粒が線を描く
// 指(マウス)でなぞると、そのまわりに渦ができる

const NOISE_SCALE = 0.003; // 流れの細かさ(大きいほど細かくうねる)
const SPEED = 1.5;         // 粒の速さ
const FADE = 14;           // 軌跡が消える速さ(0〜255、大きいほど早く消える)
const SWIRL_RADIUS = 120;  // 指の影響が届く距離
const SWIRL_POWER = 4;     // 渦の強さ

const BG = [16, 20, 32];
const PALETTE = ['#f2c14e', '#f78154', '#4d9078', '#b4436c', '#f6efe0'];

let particles = [];

function setup() {
  pixelDensity(min(2, displayDensity())); // スマホの高解像度画面で重くなりすぎないように
  createCanvas(windowWidth, windowHeight);
  restart();
}

function restart() {
  noiseSeed(floor(random(10000))); // 毎回ちがう流れにする
  background(BG);
  particles = [];
  const count = min(2500, floor((width * height) / 350)); // 画面の広さに合わせて粒の数を決める
  for (let i = 0; i < count; i++) particles.push(newParticle());
}

function newParticle() {
  const c = color(random(PALETTE));
  c.setAlpha(180);
  return { x: random(width), y: random(height), c, life: random(100, 400) };
}

function draw() {
  // 薄い背景を重ねて、古い線を少しずつ消す(これで軌跡が残る)
  noStroke();
  fill(...BG, FADE);
  rect(0, 0, width, height);

  const t = frameCount * 0.002; // 流れそのものも、ゆっくり変わっていく
  const fingers = getFingers();
  strokeWeight(1.2);

  for (const p of particles) {
    // 流れの向き:その場所の noise の値を角度に変える
    const angle = noise(p.x * NOISE_SCALE, p.y * NOISE_SCALE, t) * TWO_PI * 2;
    let vx = cos(angle) * SPEED;
    let vy = sin(angle) * SPEED;

    // 指の近くでは、指を中心に回る力を足す(近いほど強い)
    for (const f of fingers) {
      const dx = p.x - f.x;
      const dy = p.y - f.y;
      const d = sqrt(dx * dx + dy * dy);
      if (d > 1 && d < SWIRL_RADIUS) {
        const s = (1 - d / SWIRL_RADIUS) * SWIRL_POWER;
        vx += (-dy / d) * s;
        vy += (dx / d) * s;
      }
    }

    const px = p.x;
    const py = p.y;
    p.x += vx;
    p.y += vy;
    p.life--;

    stroke(p.c);
    line(px, py, p.x, p.y);

    // 寿命が来たか、画面の外に出たら、別の場所で生まれ直す
    if (p.life < 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
      Object.assign(p, newParticle());
    }
  }
}

// 画面に触れている指の位置(パソコンではマウスを押している位置)
function getFingers() {
  if (touches.length > 0) return touches;
  if (mouseIsPressed) return [{ x: mouseX, y: mouseY }];
  return [];
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  restart();
}

function keyPressed() {
  if (key === 'r' || key === 'R') restart();
}
