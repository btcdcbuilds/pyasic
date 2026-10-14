// Weapon and hero silhouettes drawn with canvas shapes (no image assets needed).

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Draws a weapon pointing right inside the box (x, y, w, h).
export function drawWeaponIcon(ctx, weapon, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 200, h / 90);
  const dark = '#2b2e35';
  const mid = '#4a4f5a';
  const glow = hex(weapon.color);
  const r = (fx, fy, fw, fh, c) => { ctx.fillStyle = c; ctx.fillRect(fx, fy, fw, fh); };
  const poly = (pts, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
  };
  switch (weapon.id) {
    case 'pistol':
      r(60, 30, 80, 18, dark); poly([70, 48, 92, 48, 84, 80, 62, 80], mid); r(136, 33, 10, 8, dark);
      break;
    case 'smg':
      r(40, 30, 110, 20, dark); r(150, 35, 25, 8, dark); poly([80, 50, 96, 50, 92, 82, 78, 82], mid); r(110, 50, 10, 26, mid);
      r(15, 34, 28, 10, mid);
      break;
    case 'rifle':
      poly([5, 34, 50, 30, 50, 52, 10, 62], mid); r(50, 28, 90, 22, dark); r(140, 33, 50, 8, dark);
      poly([95, 50, 110, 50, 118, 82, 102, 84], mid); poly([65, 50, 80, 50, 76, 72, 62, 72], dark); r(70, 20, 40, 8, dark);
      break;
    case 'shotgun':
      poly([5, 36, 45, 30, 45, 52, 10, 64], '#7a4a24'); r(45, 30, 70, 18, dark); r(115, 32, 80, 10, dark); r(100, 44, 60, 10, '#7a4a24');
      break;
    case 'minigun':
      r(20, 26, 60, 36, dark); poly([40, 62, 60, 62, 56, 84, 44, 84], mid);
      for (let i = 0; i < 4; i++) r(80, 28 + i * 8, 112, 5, i % 2 ? mid : dark);
      r(176, 24, 8, 40, mid); r(110, 24, 6, 40, mid);
      break;
    case 'laser':
      poly([5, 36, 50, 28, 50, 52, 10, 60], '#dfe6ee'); r(50, 26, 100, 26, '#e8eef5'); r(150, 34, 40, 10, '#c9d3dd');
      r(60, 34, 80, 6, glow); r(186, 32, 8, 14, glow); poly([92, 52, 108, 52, 112, 80, 96, 80], mid);
      break;
    case 'rocket':
      r(20, 26, 160, 26, '#4f5a3a'); r(5, 22, 20, 34, '#3a4228'); poly([180, 26, 196, 20, 196, 58, 180, 52], '#3a4228');
      poly([70, 52, 86, 52, 84, 80, 70, 80], dark); r(100, 52, 10, 20, dark); r(80, 14, 30, 12, dark); r(150, 34, 20, 8, '#ff6a2a');
      break;
    case 'plasma':
      r(20, 24, 120, 34, '#3a2a55'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(150, 41, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(150, 41, 9, 0, Math.PI * 2); ctx.fill();
      r(40, 30, 80, 6, glow); poly([60, 58, 78, 58, 74, 84, 58, 84], mid); r(170, 37, 26, 8, '#3a2a55');
      break;
    case 'tesla':
      r(20, 30, 90, 26, '#2f3b4f'); for (let i = 0; i < 4; i++) r(110 + i * 16, 26, 10, 34, '#c88a3a');
      r(110, 40, 64, 6, '#2f3b4f'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(184, 43, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(190, 30); ctx.lineTo(198, 20); ctx.lineTo(192, 14); ctx.stroke();
      poly([50, 56, 66, 56, 62, 82, 48, 82], mid);
      break;
    case 'railgun':
      poly([5, 38, 40, 30, 40, 50, 10, 58], dark); r(40, 28, 60, 24, dark); r(100, 26, 92, 8, mid); r(100, 46, 92, 8, mid);
      r(100, 36, 96, 6, glow); r(60, 18, 30, 10, dark); poly([60, 52, 76, 52, 72, 80, 58, 80], mid);
      break;
    default:
      r(40, 30, 120, 20, dark);
  }
  ctx.restore();
}

// Big gunner silhouette for hero boards.
export function drawHeroIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = '#2f7bff';
  ctx.beginPath(); ctx.arc(0, -36, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffc81a';
  ctx.fillRect(-16, -40, 32, 5);
  ctx.fillStyle = '#8a5a3a';
  ctx.fillRect(-8, -30, 16, 8);
  ctx.fillStyle = '#2f7bff';
  ctx.beginPath();
  ctx.moveTo(-26, -20); ctx.lineTo(26, -20); ctx.lineTo(20, 14); ctx.lineTo(-20, 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffc81a';
  ctx.fillRect(-22, -2, 44, 5);
  ctx.save(); ctx.rotate(-0.6); ctx.fillRect(-26, -10, 52, 5); ctx.restore();
  ctx.fillStyle = '#244a9a';
  ctx.fillRect(-18, 14, 14, 30);
  ctx.fillRect(4, 14, 14, 30);
  ctx.fillStyle = '#333';
  ctx.fillRect(4, -6, 60, 14);
  ctx.fillStyle = '#555';
  ctx.fillRect(40, -10, 4, 22);
  ctx.restore();
}

// Bitcoin-style coin face: orange disc with a B and its two bars (drawn, so no font glyph needed)
export function drawBtc(ctx, w, h) {
  ctx.fillStyle = '#f7931a';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(0.24);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-10, -44, 7, 88);
  ctx.fillRect(4, -44, 7, 88);
  ctx.font = `${Math.round(h * 0.72)}px "Lilita One", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('B', 3, 4);
  ctx.restore();
}
