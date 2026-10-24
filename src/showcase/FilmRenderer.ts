import { ShowcaseScene } from '../game/ShowcaseScene';
import {
  FILM_WIDTH,
  FILM_HEIGHT,
  FILM_IMPACTS,
  filmShot,
  filmTime,
  easeOut,
  clamp,
  punch,
} from './timeline';

const CREAM = '#fff2d3';
const ORANGE = '#ffb354';
const TAU = Math.PI * 2;

/** Full-frame edit: typography, camera hits and sound share the same time cues. */
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
    // Finish the match cut before the last encoded frames; no black frame at the seam.
    if (t > 31.2) {
      this.ctx.globalAlpha = easeOut((t - 31.2) / 0.4);
      this.ctx.drawImage(this.opening, 0, 0);
      this.ctx.globalAlpha = 1;
    }
  }

  private text(value: string, x: number, y: number, size: number, color = CREAM, outline = false) {
    const c = this.ctx;
    c.font = '800 ' + size + 'px Outfit, sans-serif';
    c.textAlign = 'center';
    if (outline) {
      c.lineWidth = 2.5;
      c.strokeStyle = color;
      c.strokeText(value, x, y);
    } else {
      c.fillStyle = color;
      c.fillText(value, x, y);
    }
  }

  private kinetic(
    value: string,
    x: number,
    y: number,
    size: number,
    age: number,
    options: { color?: string; angle?: number; outline?: boolean; impact?: number } = {},
  ) {
    const c = this.ctx;
    const entry = easeOut(age / 0.3);
    if (!entry) return;
    c.save();
    c.globalAlpha *= entry;
    c.translate(x, y + (1 - entry) * 100);
    c.rotate((options.angle ?? 0) + (1 - entry) * -0.11);
    const spring = 1 + punch(age) * 0.1 + (options.impact ?? 0) * 0.05;
    c.scale(spring, spring * (0.65 + entry * 0.35));
    this.text(value, 0, 0, size, options.color ?? CREAM, options.outline);
    c.restore();
  }

  private background(t: number) {
    const c = this.ctx;
    const s = filmShot(t);
    const frenzy = s.id === 'frenzy',
      shield = s.id === 'shield',
      danger = s.id === 'danger',
      bright = s.id === 'brand';
    c.fillStyle = bright ? '#f1b05e' : '#082c25';
    c.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
    const x = 960 + Math.sin(t * 0.7) * 160,
      y = 540 + Math.cos(t * 0.9) * 110;
    const glow = c.createRadialGradient(x, y, 40, x, y, 1200);
    glow.addColorStop(
      0,
      bright ? '#ffdc90' : danger ? '#6b3025' : frenzy ? '#80702b' : shield ? '#287571' : '#37694b',
    );
    glow.addColorStop(1, bright ? '#ef9853' : '#082c25');
    c.fillStyle = glow;
    c.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
    c.save();
    c.translate(x, y);
    c.rotate(t * 0.11);
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      c.fillStyle = bright ? '#fff2d314' : '#e8e6b107';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(1500, -80);
      c.lineTo(1500, 80);
      c.fill();
    }
    c.restore();
    for (let i = 0; i < 42; i++) {
      const speed = frenzy ? 2.8 : s.id === 'loop' ? 2.1 : 0.42;
      const p = (i / 42 + t * speed * 0.12) % 1;
      const a = i * 2.39996 + t * 0.06,
        r = 190 + p * 1120;
      c.strokeStyle = bright ? '#174f3c30' : '#ffd197';
      c.globalAlpha = frenzy ? 0.08 + p * 0.25 : 0.08;
      c.lineWidth = 1.5 + p * 2;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      const end = r + 12 + p * (frenzy ? 220 : 28);
      c.lineTo(x + Math.cos(a) * end, y + Math.sin(a) * end);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private brand(y: number, size: number, age: number, dark = false) {
    const c = this.ctx,
      entry = easeOut(age / 0.35);
    c.save();
    c.translate(960, y + (1 - entry) * 90);
    c.rotate(-0.045 * (1 - entry));
    const zoom = 0.7 + entry * 0.3 + punch(age) * 0.06;
    c.scale(zoom, zoom);
    c.font = '800 ' + size + 'px Outfit';
    const width = c.measureText('cookingninja').width;
    c.textAlign = 'left';
    c.fillStyle = dark ? '#123e30' : CREAM;
    c.fillText('cooking', -width / 2, 0);
    c.fillStyle = dark ? '#9e3827' : ORANGE;
    c.fillText('ninja', -width / 2 + c.measureText('cooking').width, 0);
    c.restore();
  }

  private hearts(t: number) {
    const c = this.ctx;
    for (let i = 0; i < 3; i++) {
      const lost = i > 0 && t >= 11.9,
        age = Math.max(0, t - 11.9);
      c.save();
      c.translate(795 + i * 160 + (lost ? Math.sin(age * 40) * 12 * Math.exp(-age * 5) : 0), 910);
      c.fillStyle = lost ? '#fff2d32b' : ORANGE;
      c.beginPath();
      c.moveTo(0, 30);
      c.bezierCurveTo(-90, -30, -35, -95, 0, -49);
      c.bezierCurveTo(35, -95, 90, -30, 0, 30);
      c.fill();
      c.restore();
    }
  }

  private draw(t: number) {
    const c = this.ctx,
      s = filmShot(t);
    const impact = FILM_IMPACTS.reduce(
      (sum, cue) => sum + (t >= cue && t < cue + 0.5 ? Math.exp(-(t - cue) * 13) : 0),
      0,
    );
    c.globalAlpha = 1;
    this.background(t);
    c.save();
    c.translate(Math.sin(t * 57) * impact * 10, Math.cos(t * 49) * impact * 6);

    // Type occupies the same stage as the ingredients, rather than a text column.
    switch (s.id) {
      case 'hook':
        this.kinetic('PRÊT ?', 960, 650, 390, s.local + 0.1, { outline: true });
        break;
      case 'brand':
        this.brand(590, 244, s.local + 0.15, true);
        break;
      case 'slice':
        c.save();
        c.globalAlpha = 0.32;
        c.translate(960, 560);
        c.rotate(-0.13 + Math.sin(s.local) * 0.02);
        this.text('TRANCHEZ', ((s.local * 180) % 900) - 450, 110, 345, CREAM, true);
        c.restore();
        break;
      case 'danger':
        this.kinetic(t < 11.9 ? 'ATTENTION' : 'OUPS !', 960, 600, t < 11.9 ? 235 : 420, s.local, {
          color: '#ff8666',
          angle: -0.09,
          impact,
        });
        break;
      case 'frenzy':
        c.save();
        c.globalAlpha = 0.4;
        this.kinetic('FRÉNÉSIE', 960, 650, 360, s.local, {
          color: ORANGE,
          outline: true,
          angle: -0.09,
          impact,
        });
        c.restore();
        break;
      case 'shield':
        c.save();
        c.globalAlpha = 0.45;
        this.kinetic('SAUVÉ !', 960, 690, 390, s.local, {
          color: '#b6ffec',
          outline: true,
          impact,
        });
        c.restore();
        break;
      case 'mix':
        c.save();
        c.translate(960, 550);
        c.rotate(s.local * 0.18 - 0.17);
        c.globalAlpha = 0.24;
        this.text('TOURNEZ', 0, 100, 340, CREAM, true);
        c.restore();
        break;
      case 'dishes': {
        const word = t < 23.3 ? 'BURGER' : t < 24.6 ? 'TACOS' : 'GÂTEAU';
        const cue = t < 23.3 ? 22 : t < 24.6 ? 23.3 : 24.6;
        c.save();
        c.globalAlpha = 0.28;
        this.kinetic(word, 960, 620, word === 'TACOS' ? 440 : 375, t - cue + 0.1, {
          outline: true,
          color: ORANGE,
          angle: -0.04,
        });
        c.restore();
        break;
      }
    }

    this.scene.render(t);
    c.drawImage(this.scene.canvas, 0, 0);

    switch (s.id) {
      case 'hook': {
        const slice = easeOut((t - 1.2) / 0.4);
        for (let half = 0; half < 2; half++) {
          c.save();
          c.globalAlpha = 1 - clamp((t - 1.65) / 0.2);
          c.beginPath();
          c.rect(0, half ? 545 : 0, 1920, half ? 535 : 545);
          c.clip();
          this.kinetic(
            'PRÊT ?',
            960 + (half ? -1 : 1) * slice * 500,
            660 + (half ? 110 : -120) * slice,
            310,
            t + 0.1,
            { angle: (half ? 1 : -1) * slice * 0.1 },
          );
          c.restore();
        }
        break;
      }
      case 'brand':
        this.kinetic('LA CUISINE PASSE À L’ACTION.', 960, 960, 57, s.local - 0.2, {
          color: '#173f2d',
        });
        break;
      case 'gesture':
        this.kinetic('VOTRE TÉLÉPHONE.', 960, 210, 107, s.local + 0.1);
        this.kinetic('VOTRE LAME.', 1180 + Math.sin(s.local * 1.6) * 35, 950, 142, s.local - 0.25, {
          color: ORANGE,
          angle: -0.045,
        });
        break;
      case 'slice': {
        const words = ['VISEZ.', 'TRANCHEZ.', 'ENCHAÎNEZ.', 'ENCORE !'];
        const cut = Math.min(3, Math.floor(s.local));
        this.kinetic(words[cut], 960, 970, 133, (s.local % 1) + 0.12, {
          color: ORANGE,
          angle: cut % 2 ? 0.035 : -0.035,
          impact,
        });
        break;
      }
      case 'danger': {
        this.hearts(t);
        const age = t - 11.9;
        if (age >= 0 && age < 0.7) {
          const glow = c.createRadialGradient(960, 540, 300, 960, 540, 1100);
          glow.addColorStop(0, '#e95c4000');
          glow.addColorStop(1, 'rgba(255,65,40,' + 0.48 * Math.exp(-age * 5) + ')');
          c.fillStyle = glow;
          c.fillRect(0, 0, 1920, 1080);
          c.strokeStyle = 'rgba(255,110,75,' + Math.exp(-age * 5) + ')';
          c.lineWidth = 20;
          c.strokeRect(12, 12, 1896, 1056);
        }
        break;
      }
      case 'frenzy':
        if (s.local < 1)
          this.kinetic('ÇA S’EMBALLE.', 960, 960, 134, s.local + 0.1, { color: ORANGE, impact });
        else {
          const age = s.local - 1,
            count = Math.max(1, 3 - Math.floor(age));
          this.kinetic('RARE !', 960, 175, 118, age + 0.15, { color: '#ffeab0', angle: -0.04 });
          this.kinetic(String(count), 315, 650, 235, (age % 1) + 0.1, { color: ORANGE });
          this.kinetic('COUPEZ EN RAFALE', 960, 990, 92, age + 0.1, { color: '#ffeab0', impact });
        }
        break;
      case 'shield':
        this.kinetic('BOUCLIER ACTIVÉ', 960, 960, 107, s.local + 0.15, {
          color: '#bcffe9',
          impact,
        });
        break;
      case 'mix':
        c.save();
        c.translate(960, 570);
        c.rotate(t * 2.8);
        c.strokeStyle = ORANGE;
        c.lineWidth = 9;
        for (let i = 0; i < 2; i++) {
          c.rotate(Math.PI);
          c.beginPath();
          c.ellipse(0, 0, 560, 390, 0, 0.1, 2.6);
          c.stroke();
          c.save();
          c.translate(Math.cos(2.6) * 560, Math.sin(2.6) * 390);
          c.rotate(2.6);
          c.fillStyle = ORANGE;
          c.beginPath();
          c.moveTo(-20, -18);
          c.lineTo(0, 28);
          c.lineTo(20, -18);
          c.fill();
          c.restore();
        }
        c.restore();
        this.kinetic('UN DERNIER TOUR.', 960, 190, 106, s.local + 0.1);
        break;
      case 'dishes':
        this.kinetic('À TABLE !', 960, 980, 126, s.local + 0.1, { color: ORANGE, impact });
        break;
      case 'finale':
        this.brand(260, 167, s.local + 0.1);
        this.kinetic('VENEZ JOUER.', 960, 400, 109, s.local - 0.15, { color: ORANGE });
        this.kinetic('LYCÉE GUY MOLLET', 960, 955, 66, s.local - 0.3);
        this.text('ARRAS  ·  BTS SIO', 960, 1010, 31, '#bbd3be');
        break;
    }
    c.restore();

    // School identity stays discreet during action and becomes prominent at the end.
    if (s.id !== 'finale' && s.id !== 'brand') {
      c.save();
      c.globalAlpha = 0.7;
      c.textAlign = 'left';
      c.font = '800 22px Outfit';
      c.fillStyle = CREAM;
      c.fillText('LYCÉE GUY MOLLET · ARRAS', 50, 1040);
      c.restore();
    }
  }

  dispose() {
    this.scene.dispose();
  }
}
