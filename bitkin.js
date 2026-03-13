(function () {
  window._botOn = false;
  typeof stopScan === 'function' && stopScan();
  typeof stopBot === 'function' && stopBot();

  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;

  const GROUND_Y   = 585;   // confirmed
  const JUMP_HOLD  = 400;
  const TRIGGER_MS = 450;   // confirmed working perfectly
  const SPD        = 6.27;  // confirmed px/frame
  const PX_PER_MS  = SPD / 16.67;

  // High obstacle Y range confirmed: 493-513 → duck
  // Low obstacle Y range confirmed:  593-665 → jump
  const HIGH_OBS_MAX_Y = 580; // obstacle top below this = high = duck

  const GAME_COLOR = '#2a2a38';
  let frameRects = [];

  const origFill = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
    origFill.call(this, x, y, w, h);
    if (this.fillStyle === GAME_COLOR)
      frameRects.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  };

  function analyzeFrame(rects) {
    if (!rects.length) return { playerY: null, obstacles: [] };
    const sorted = [...rects].sort((a, b) => a.x - b.x);

    // Player = leftmost rects (x < 200)
    const pRects = sorted.filter(r => r.x < 200);
    const playerY = pRects.length ? Math.min(...pRects.map(r => r.y)) : null;

    // Obstacles = rects right of x=200, cluster by proximity
    const obsRects = sorted.filter(r => r.x >= 200);
    const clusters = [];
    let cur = null;
    for (const r of obsRects) {
      if (!cur || r.x - cur.maxX > 40) {
        cur = { minX: r.x, maxX: r.x + r.w, minY: r.y, maxY: r.y + r.h, count: 1 };
        clusters.push(cur);
      } else {
        cur.maxX = Math.max(cur.maxX, r.x + r.w);
        cur.minY = Math.min(cur.minY, r.y);
        cur.maxY = Math.max(cur.maxY, r.y + r.h);
        cur.count++;
      }
    }
    const obstacles = clusters.filter(c => c.count >= 3 && (c.maxX - c.minX) < 200);
    return { playerY, obstacles };
  }

  let ducking = false, lastAct = 0;

  function holdKey(key, ms) {
    const kc = { ArrowUp: 38, ArrowDown: 40, ' ': 32 }[key] || 0;
    const o = { key, keyCode: kc, which: kc, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true };
    [document, window, canvas, document.body].forEach(t => t && t.dispatchEvent(new KeyboardEvent('keydown', o)));
    setTimeout(() => {
      [document, window, canvas, document.body].forEach(t => t && t.dispatchEvent(new KeyboardEvent('keyup', o)));
    }, ms);
  }

  // Use playerY to determine if on ground — no fixed timer needed!
  function isOnGround(playerY) {
    return playerY !== null && playerY >= GROUND_Y - 10;
  }

  function jump(playerY) {
    // Only jump if truly on ground and cooldown passed
    if (!isOnGround(playerY)) return;
    if (Date.now() - lastAct < 200) return;
    lastAct = Date.now();
    holdKey('ArrowUp', JUMP_HOLD);
    holdKey(' ', JUMP_HOLD);
    console.log('%c↑ JUMP', 'color:lime;font-weight:bold;font-size:16px');
  }

  function duck() {
    if (ducking || Date.now() - lastAct < 200) return;
    ducking = true; lastAct = Date.now();
    holdKey('ArrowDown', 420);
    console.log('%c↓ DUCK', 'color:orange;font-weight:bold;font-size:16px');
    setTimeout(() => { ducking = false; }, 500);
  }

  function tryStart() {
    try { window.startGame && window.startGame(); } catch(e) {}
    holdKey('ArrowUp', 80); holdKey(' ', 80);
    document.querySelectorAll('*').forEach(el => {
      const t = (el.innerText || '').trim().toUpperCase();
      if ((t === 'START →' || t === 'RETRY →') && el.offsetParent) el.click();
    });
  }
  tryStart(); setTimeout(tryStart, 500);

  let frame = 0;
  window._botOn = true;

  function loop() {
    if (!window._botOn) return;
    frame++;

    const rects = frameRects;
    frameRects = [];

    const { playerY, obstacles } = analyzeFrame(rects);
    const onGround = isOnGround(playerY);

    // Get closest obstacle
    const closest = obstacles.length
      ? obstacles.reduce((a, b) => a.minX < b.minX ? a : b)
      : null;

    if (closest) {
      const dist   = closest.minX - 100;
      const ms     = dist / PX_PER_MS;
      const isHigh = closest.minY < HIGH_OBS_MAX_Y;

      // Draw red box around detected obstacle
      ctx.strokeStyle = isHigh ? 'orange' : 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(closest.minX, closest.minY, closest.maxX - closest.minX, closest.maxY - closest.minY);

      // Draw trigger line
      ctx.fillStyle = 'rgba(255,255,0,0.5)';
      ctx.fillRect(100 + TRIGGER_MS * PX_PER_MS, 580, 2, 100);

      if (frame % 8 === 0) {
        console.log(`obs y=${closest.minY}-${closest.maxY} dist=${Math.round(dist)} ms=${Math.round(ms)} high=${isHigh} onGround=${onGround} playerY=${playerY}`);
      }

      if (ms <= TRIGGER_MS) {
        if (isHigh) duck();
        else jump(playerY);  // only fires if actually on ground
      }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
  window.stopBot = () => {
    window._botOn = false;
    CanvasRenderingContext2D.prototype.fillRect = origFill;
    console.log('Bot stopped.');
  };
  console.log('%c🤖 Bot FINAL v5 — ground-aware jumping. stopBot() to quit.', 'color:lime;font-size:16px;font-weight:bold');
  console.log('Jump only fires when playerY >= 575 (confirmed on ground)');
  console.log('No fixed cooldown — reacts to every obstacle independently');
})();
