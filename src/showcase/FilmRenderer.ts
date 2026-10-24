import { ShowcaseScene } from '../game/ShowcaseScene';
import { FILM_WIDTH, FILM_HEIGHT, filmShot, filmTime, easeOut, clamp } from './timeline';

const cream = '#fff2d3';
const orange = '#ffb354';
const TAU = Math.PI * 2;

/** One composited canvas gives the live preview and the exported film identical artwork. */
export class FilmRenderer {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scene = new ShowcaseScene();
  private readonly opening = document.createElement('canvas');

  constructor() {
    this.canvas.width = this.opening.width = FILM_WIDTH;
    this.canvas.height = this.opening.height = FILM_HEIGHT;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Le dessin du film est indisponible dans ce navigateur.');
    this.ctx = ctx;
    this.draw(0);
    this.opening.getContext('2d')!.drawImage(this.canvas, 0, 0);
  }

  render(time: number) {
    const t = filmTime(time);
    this.draw(t);
    // Land on the exact opening composition: no black frame at the loop seam.
    if (t > 31) {
      this.ctx.globalAlpha = easeOut((t - 31) / 0.6);
      this.ctx.drawImage(this.opening, 0, 0);
      this.ctx.globalAlpha = 1;
    }
  }

  private text(value: string, x: number, y: number, size: number, color = cream, weight = 800) {
    this.ctx.fillStyle = color;
    this.ctx.font = `${weight} ${size}px Outfit, sans-serif`;
    this.ctx.fillText(value, x, y);
  }

  private background(t: number, frenzy: boolean) {
    const c = this.ctx;
    c.fillStyle = '#092c25';
    c.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
    const centerX = 1370 + Math.sin(t * 0.5) * 100;
    const glow = c.createRadialGradient(centerX, 560, 30, centerX, 560, 1040);
    glow.addColorStop(0, frenzy ? '#6e5924' : '#38684b');
    glow.addColorStop(0.55, frenzy ? '#30462d' : '#1c4b38');
    glow.addColorStop(1, '#092c25');
    c.fillStyle = glow;
    c.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
    c.save();
    c.translate(centerX, 560);
    c.rotate(t * 0.025);
    c.strokeStyle = '#d7e5ae';
    c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      c.globalAlpha = 0.09 - i * 0.012;
      c.beginPath();
      c.ellipse(0, 0, 290 + i * 155, 290 + i * 155, 0, 0, TAU);
      c.stroke();
    }
    c.restore();
    // Fine floating seasoning; deterministic paths keep export and preview in sync.
    for (let i = 0; i < 48; i++) {
      const speed = frenzy ? 140 : 13;
      const x = ((i * 271.7 + t * speed) % 2000) - 40;
      const y = 180 + ((i * 179.3) % 800) + Math.sin(t + i) * 18;
      c.globalAlpha = (i % 3 === 0 ? 0.3 : 0.12) * (0.7 + Math.sin(t + i) * 0.3);
      c.fillStyle = orange;
      c.beginPath();
      c.ellipse(x, y, frenzy ? 19 : 2.5, 2, -0.32, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    // The left-side gradient protects large typography from the brightest lighting.
    const shade = c.createLinearGradient(0, 0, 1150, 0);
    shade.addColorStop(0, '#092c25d9');
    shade.addColorStop(1, '#092c2500');
    c.fillStyle = shade;
    c.fillRect(0, 0, 1200, FILM_HEIGHT);
  }

  private brand() {
    const c = this.ctx;
    this.text('cooking', 90, 106, 48);
    c.font = '800 48px Outfit';
    this.text('ninja', 90 + c.measureText('cooking').width, 106, 48, orange);
    c.fillStyle = '#fff2d337';
    c.fillRect(1310, 56, 2, 75);
    this.text('LYCÉE GUY MOLLET', 1343, 88, 32, cream, 600);
    this.text('ARRAS  /  BTS SIO', 1343, 119, 21, '#b9cbb4', 500);
    c.fillStyle = '#fff2d31c';
    c.fillRect(90, 160, 1740, 1);
  }

  private draw(t: number) {
    const shot = filmShot(t);
    const c = this.ctx;
    c.globalAlpha = 1;
    this.background(t, shot.index === 3);
    if (shot.index !== 5) {
      c.save();
      c.translate(1170, 570);
      c.rotate(-0.14);
      c.globalAlpha = 0.045;
      this.text(shot.index === 3 ? 'FRÉNÉSIE' : 'NINJA', -170, 170, 250);
      c.restore();
    }
    this.scene.render(t);
    c.drawImage(this.scene.canvas, 0, 0);
    this.brand();

    const outgoing = 1 - easeOut((shot.local - (shot.end - shot.at - 0.3)) / 0.3);
    const entry = easeOut(shot.local / 0.7);
    c.save();
    c.globalAlpha = outgoing;
    const x = shot.index === 5 ? 960 : 100;
    if (shot.index === 5) c.textAlign = 'center';
    const headingY = shot.index === 5 ? 270 : 315;
    const tag = `${String(shot.index + 1).padStart(2, '0')}  /  ${shot.label.toLocaleUpperCase('fr')}`;
    this.text(tag, x, headingY + (1 - entry) * 22, 22, orange, 500);

    shot.lines.forEach((line, i) => {
      const p = easeOut((shot.local - i * 0.09) / 0.65);
      c.save();
      const fontSize = shot.index === 5 ? 73 : shot.index === 1 ? 82 : 105;
      const baseline = headingY + 125 + i * 110;
      c.beginPath();
      c.rect(0, baseline - 105, 1920, 116);
      c.clip();
      c.globalAlpha = p * outgoing;
      this.text(
        line,
        x,
        baseline + (1 - p) * 110,
        fontSize,
        i === shot.lines.length - 1 ? orange : cream,
      );
      c.restore();
    });
    if (shot.index !== 5) {
      const y = headingY + 125 + shot.lines.length * 110 + 25;
      c.globalAlpha = easeOut((shot.local - 0.35) / 0.6) * outgoing;
      c.fillStyle = orange;
      c.fillRect(x, y - 7, 46 * entry, 3);
      this.text(shot.caption, x + 65, y + 2, 27, '#cbdbc5', 400);
      if (shot.index === 6) {
        c.fillStyle = orange;
        c.beginPath();
        c.roundRect(x, y + 56, 352, 68, 34);
        c.fill();
        this.text('VENEZ ESSAYER  →', x + 30, y + 100, 28, '#143d2e', 600);
      }
    } else {
      this.text(shot.caption, x, 458, 29, '#cbdbc5', 400);
    }
    c.restore();

    // The mixing instruction is a moving circular arrow, recognizable from the game.
    if (shot.index === 4) {
      c.save();
      c.translate(1430, 620);
      c.rotate(t * 1.6);
      c.strokeStyle = orange;
      c.fillStyle = orange;
      c.lineWidth = 6;
      for (let i = 0; i < 2; i++) {
        c.rotate(Math.PI);
        c.beginPath();
        c.arc(0, 0, 310, 0.1, 2.45);
        c.stroke();
        c.save();
        c.rotate(2.45);
        c.translate(310, 0);
        c.beginPath();
        c.moveTo(-15, -15);
        c.lineTo(0, 22);
        c.lineTo(15, -15);
        c.fill();
        c.restore();
      }
      c.restore();
    }

    // Editorial progress strip, part of the film rather than playback controls.
    c.fillStyle = '#fff2d328';
    c.fillRect(100, 998, 1720, 2);
    c.fillStyle = orange;
    c.fillRect(100, 998, (t / 32) * 1720, 2);
    this.text('UN PROJET ÉTUDIANT. UNE EXPÉRIENCE À JOUER.', 100, 1040, 19, '#9db7a5', 500);
    c.textAlign = 'right';
    this.text('COOKINGNINJA', 1820, 1040, 19, '#9db7a5', 500);
    c.textAlign = 'left';

    // Short diagonal wipe at each edit, warm rather than a white flash.
    if (shot.index > 0 && shot.local < 0.38) {
      const travel = clamp(shot.local / 0.38);
      c.save();
      c.translate(-800 + travel * 3500, 0);
      c.fillStyle = orange;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(620, 0);
      c.lineTo(100, 1080);
      c.lineTo(-520, 1080);
      c.fill();
      c.restore();
    }
  }

  dispose() {
    this.scene.dispose();
  }
}
