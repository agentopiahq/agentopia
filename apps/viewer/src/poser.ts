import { OfficeFrame, PetView, Point } from '@agentopia/core';

import { CORNER_INSET } from './corners';
import { Heading, headingOf, headingView } from './heading';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import {
  PERSON_SNAPS,
  PersonPose,
  PetPose,
  Scene,
  Snap,
  freeze,
  nearestSnap,
  parseScene,
  personPose,
  personPoseOf,
  petPoseOf,
  petPosesFor,
  petSnaps,
  poseFrame,
  posesFor,
} from './pose';
import { NO_EXPORT } from './snapshot';
import { LIT } from './zoom';

/**
 * The pose editor (the website's `?pose`): a card down the left of the office
 * for freezing it and posing whoever is in it, for pictures and clips.
 *
 * Press anyone in the office (you, an agent, the cat or the dog) and the
 * office freezes on that moment; drag them to move them, and they snap onto a
 * seat, a perch or a bowl they are dropped near. The card then picks their
 * pose, which way they face, whether they sit, and what they say. Poses keep
 * moving, so the export key's clips catch them. The scene is kept in this
 * browser, so a reload comes back to it; "resume" lets the office go on
 * living from where it froze. The scene itself is `pose.ts`.
 */

/** What the editor needs of the office on screen. */
export interface Posable {
  figuresAt(clientX: number, clientY: number): Array<{ kind: 'person' | 'pet'; id: string }>;
  clientOf(p: Point, z?: number): { x: number; y: number };
  floorAt(clientX: number, clientY: number): Point;
  sheetScale(): number;
  headingNow(id: string): Heading | null;
  yawNow(): number;
}

type Pick = { kind: 'person' | 'pet'; id: string };

/** Where the scene is kept between visits. */
const STORE_KEY = 'agentopia.pose.scene';
/** How near a seat or perch a figure has to be dropped to land on it, in sheet points. */
const SNAP_RADIUS = 20;
/** A press that moves less than this, in CSS pixels, is a tap. */
const TAP_SLOP = 5;

const HEADINGS: readonly Heading[] = ['+y', '+x', '-y', '-x'];

const POSE_STYLE = `
.agentopia-pose{position:absolute;right:${CORNER_INSET}px;top:128px;z-index:5;width:250px;box-sizing:border-box;
  max-height:calc(100% - 200px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;
  padding:12px 14px 12px;border:1.5px solid ${SHEET.ink};border-radius:10px;background:${SHEET.paper};
  box-shadow:4px 5px 0 #6a60551f;color:${SHEET.ink};user-select:none;font:400 15px/1.2 ${FONT.hand};}
.agentopia-pose-head{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:grab;touch-action:none;}
.agentopia-pose.moving .agentopia-pose-head{cursor:grabbing;}
.agentopia-pose-title{font:400 17px/1 ${FONT.hand};letter-spacing:2px;cursor:pointer;}
.agentopia-pose-title:hover{color:${LIT};}
.agentopia-pose.folded{width:auto;}
.agentopia-pose-state{color:${SHEET.lead};font-size:14px;}
.agentopia-pose-hint{color:${SHEET.lead};font-size:14px;line-height:1.25;}
.agentopia-pose-label{color:${SHEET.lead};font-size:14px;margin-top:2px;}
.agentopia-pose-name{font:700 16px/1.2 ${FONT.hand};}
.agentopia-pose-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;}
.agentopia-pose-grid.four{grid-template-columns:repeat(2,minmax(0,1fr));}
.agentopia-pose-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.agentopia-pose-chip{min-width:0;padding:4px 3px 3px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;
  border:1.5px solid ${SHEET.ink};border-radius:7px;background:${SHEET.paper};color:${SHEET.ink};cursor:pointer;
  font:400 13px/1.1 ${FONT.hand};white-space:nowrap;}
.agentopia-pose-chip:hover:not(:disabled),.agentopia-pose-chip:focus-visible{border-color:${LIT};color:${LIT};outline:none;}
.agentopia-pose-chip[aria-pressed="true"]:not(:disabled){background:${LIT};border-color:${LIT};color:${SHEET.paper};}
.agentopia-pose-chip:disabled{opacity:0.4;cursor:default;}
.agentopia-pose input[type="text"],.agentopia-pose select{width:100%;box-sizing:border-box;padding:4px 6px;
  border:1.5px solid ${SHEET.ink};border-radius:7px;background:${SHEET.paper};color:${SHEET.ink};font:400 14px/1.2 ${FONT.hand};}
.agentopia-pose input[type="text"]:focus,.agentopia-pose select:focus{outline:none;border-color:${LIT};}
.agentopia-pose label.check{display:flex;gap:6px;align-items:center;cursor:pointer;font-size:14px;}
.agentopia-pose-mark{position:absolute;z-index:4;pointer-events:none;width:44px;height:18px;margin:-9px 0 0 -22px;
  border:2px dashed ${LIT};border-radius:50%;display:none;}
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = ''
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function chip(
  label: string,
  pressed: boolean,
  onClick: () => void,
  title = label
): HTMLButtonElement {
  const b = el('button', 'agentopia-pose-chip', label);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', onClick);
  return b;
}

/** How a floor heading reads on screen from a yaw: front or back, left or right. */
export function headingWords(heading: Heading, yaw: number): string {
  const { facing, back } = headingView(heading, yaw);
  return `${back ? 'back' : 'front'} ${facing > 0 ? 'right' : 'left'}`;
}

function load(storage: Storage | null): Scene | null {
  try {
    return parseScene(storage?.getItem(STORE_KEY) ?? null);
  } catch {
    return null;
  }
}

export class Poser {
  private scene: Scene | null;
  private live: OfficeFrame | null = null;
  private selected: Pick | null = null;
  private drag: {
    pick: Pick;
    grab: { x: number; y: number };
    moved: boolean;
    /** Who is behind, to pick instead if this press turns out a tap on whoever was picked already. */
    behind: Pick | null;
  } | null = null;
  private press: { x: number; y: number } | null = null;
  private readonly card: HTMLDivElement;
  private readonly mark: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly unlisten: Array<() => void> = [];
  private shownYaw = 0;
  /** Folded down to its title, to see the office behind it. */
  private folded = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly office: Posable,
    private readonly storage: Storage | null = safeStorage()
  ) {
    this.scene = load(storage);
    this.style = el('style');
    this.style.textContent = POSE_STYLE;
    this.card = el('div', 'agentopia-pose');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', 'Pose the office');
    // Presses on the card are the card's, never the office's.
    this.card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.grabCard(e);
    });
    this.card.addEventListener('wheel', (e) => e.stopPropagation());
    this.mark = el('div', 'agentopia-pose-mark');
    // The card and its mark are for making pictures, never in them.
    this.card.setAttribute(NO_EXPORT, '');
    this.mark.setAttribute(NO_EXPORT, '');
    host.append(this.style, this.card, this.mark);
    this.listen(host, 'pointerdown', (e) => this.down(e as PointerEvent), true);
    this.listen(window, 'pointermove', (e) => this.move(e as PointerEvent));
    this.listen(window, 'pointerup', (e) => this.up(e as PointerEvent));
    this.listen(window, 'pointercancel', () => {
      this.drag = null;
      this.press = null;
    });
    this.listen(window, 'keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Escape' && this.selected && !(e.target instanceof HTMLInputElement)) {
        this.select(null);
      }
    });
    this.show();
  }

  /** Whether the office is frozen on a scene. */
  get frozen(): boolean {
    return this.scene !== null;
  }

  /** The director's frame this tick, while the office runs: what a freeze would keep. */
  watch(frame: OfficeFrame): void {
    this.live = frame;
  }

  /** Run the frozen scene's loops on by `dt` ms. */
  advance(dt: number): void {
    if (this.scene) {
      this.scene.elapsed += dt;
    }
  }

  /** The frozen office, posed, to draw this tick. */
  frame(): OfficeFrame | null {
    return this.scene ? poseFrame(this.scene) : null;
  }

  /** After a frame is drawn: keep the selection's mark under its feet, and the facing words true to the camera. */
  afterRender(frame: OfficeFrame): void {
    const pick = this.selected;
    const where = pick ? this.whereIs(pick, frame) : null;
    if (!where) {
      this.mark.style.display = 'none';
    } else {
      const host = this.host.getBoundingClientRect();
      const c = this.office.clientOf(where.pos, where.z);
      const k = this.office.sheetScale();
      this.mark.style.display = 'block';
      this.mark.style.left = `${c.x - host.left}px`;
      this.mark.style.top = `${c.y - host.top}px`;
      this.mark.style.transform = `scale(${Math.max(0.5, Math.min(2.5, k))})`;
    }
    const yaw = this.office.yawNow();
    if (Math.abs(yaw - this.shownYaw) > 0.2) {
      this.shownYaw = yaw;
      this.show();
    }
  }

  destroy(): void {
    for (const off of this.unlisten) {
      off();
    }
    this.card.remove();
    this.mark.remove();
    this.style.remove();
  }

  // ---- the scene ------------------------------------------------------------

  private freezeNow(): boolean {
    if (this.scene) {
      return true;
    }
    if (!this.live) {
      return false;
    }
    this.scene = freeze(this.live);
    this.save();
    return true;
  }

  private resume(): void {
    this.scene = null;
    this.selected = null;
    try {
      this.storage?.removeItem(STORE_KEY);
    } catch {
      // A browser that keeps nothing simply forgets the scene sooner.
    }
    this.show();
  }

  private save(): void {
    if (!this.scene) {
      return;
    }
    try {
      this.storage?.setItem(STORE_KEY, JSON.stringify(this.scene));
    } catch {
      // Out of room, or storage off: the scene lasts as long as the page.
    }
  }

  /** The pose of a person, made from how they stand now if they have none yet. */
  private personPose(id: string): PersonPose | null {
    const scene = this.scene;
    if (!scene) {
      return null;
    }
    const existing = scene.people[id];
    if (existing) {
      return existing;
    }
    const actor =
      id === scene.base.human.id ? scene.base.human : scene.base.actors.find((a) => a.id === id);
    if (!actor) {
      return null;
    }
    const shown = poseFrame(scene);
    const now =
      shown.human.id === id ? shown.human : (shown.actors.find((a) => a.id === id) ?? actor);
    const pose = personPoseOf(now, this.office.headingNow(id) ?? '+y', scene.elapsed);
    scene.people[id] = pose;
    return pose;
  }

  private petPose(id: string): PetPose | null {
    const scene = this.scene;
    if (!scene) {
      return null;
    }
    const existing = scene.pets[id];
    if (existing) {
      return existing;
    }
    const now = poseFrame(scene).pets.find((p) => p.id === id);
    if (!now) {
      return null;
    }
    const pose = petPoseOf(now, headingOf(now.dir.x, now.dir.y), scene.elapsed);
    scene.pets[id] = pose;
    return pose;
  }

  private petOf(id: string): PetView | undefined {
    return this.scene?.base.pets.find((p) => p.id === id);
  }

  private whereIs(pick: Pick, frame: OfficeFrame): { pos: Point; z: number } | null {
    if (pick.kind === 'pet') {
      const pet = frame.pets.find((p) => p.id === pick.id);
      return pet ? { pos: pet.pos, z: pet.z } : null;
    }
    const actor =
      frame.human.id === pick.id ? frame.human : frame.actors.find((a) => a.id === pick.id);
    return actor ? { pos: actor.pos, z: 0 } : null;
  }

  private select(pick: Pick | null): void {
    this.selected = pick;
    if (pick) {
      if (pick.kind === 'person') {
        this.personPose(pick.id);
      } else {
        this.petPose(pick.id);
      }
      this.save();
    }
    this.show();
  }

  /** Change what is picked, starting its loop over when the pose itself changed. */
  private edit(change: (pose: PersonPose | PetPose) => void, restart = false): void {
    const pick = this.selected;
    const scene = this.scene;
    if (!pick || !scene) {
      return;
    }
    const pose = pick.kind === 'person' ? this.personPose(pick.id) : this.petPose(pick.id);
    if (!pose) {
      return;
    }
    change(pose);
    if (restart) {
      pose.since = scene.elapsed;
    }
    this.save();
    this.show();
  }

  // ---- pressing and dragging --------------------------------------------------

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) {
      return;
    }
    const hits = this.office.figuresAt(e.clientX, e.clientY);
    const hit = hits[0];
    if (!hit) {
      this.press = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!this.freezeNow()) {
      return;
    }
    // Ours: the camera neither pans nor turns, and no furniture opens under it.
    e.stopPropagation();
    e.preventDefault();
    // Pressing whoever is picked again drags them, even from behind someone;
    // a tap goes through to whoever stands behind them.
    const same = (a: Pick | null, b: Pick): boolean => a?.kind === b.kind && a.id === b.id;
    const at = hits.findIndex((h) => same(this.selected, h));
    const target = at >= 0 ? hits[at] : hit;
    const behind = at >= 0 && hits.length > 1 ? hits[(at + 1) % hits.length] : null;
    this.select(target);
    const where = this.whereIs(target, poseFrame(this.scene as Scene));
    const foot = where ? this.office.clientOf(where.pos, where.z) : { x: e.clientX, y: e.clientY };
    this.drag = {
      pick: target,
      grab: { x: e.clientX - foot.x, y: e.clientY - foot.y },
      moved: false,
      behind,
    };
    e.target.setPointerCapture?.(e.pointerId);
  }

  private move(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || !this.scene) {
      return;
    }
    const foot = { x: e.clientX - drag.grab.x, y: e.clientY - drag.grab.y };
    const snaps: readonly Snap[] =
      drag.pick.kind === 'person'
        ? PERSON_SNAPS
        : petSnaps(this.petOf(drag.pick.id)?.kind ?? 'cat');
    const snap = nearestSnap(
      snaps,
      foot,
      (p, z) => this.office.clientOf(p, z),
      SNAP_RADIUS * this.office.sheetScale()
    );
    const pos = snap ? { ...snap.at } : this.office.floorAt(foot.x, foot.y);
    if (drag.pick.kind === 'person') {
      const pose = this.personPose(drag.pick.id);
      if (pose) {
        pose.pos = pos;
        if (snap) {
          pose.heading = snap.heading;
          pose.seated = snap.seated === true;
        } else if (personPose(pose.pose).seat !== 'always') {
          pose.seated = false;
        }
      }
    } else {
      const pose = this.petPose(drag.pick.id);
      if (pose) {
        delete pose.follow;
        pose.pos = pos;
        pose.z = snap?.z ?? 0;
        if (snap) {
          pose.heading = snap.heading;
        }
      }
    }
    drag.moved = true;
  }

  private up(e: PointerEvent): void {
    if (this.drag) {
      const { moved, behind } = this.drag;
      this.drag = null;
      if (moved) {
        this.save();
        this.show();
      } else if (behind) {
        this.select(behind);
      }
      return;
    }
    const press = this.press;
    this.press = null;
    // A tap on the floor lets go of whoever was picked; a drag of the floor moves the camera.
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_SLOP && this.selected) {
      this.select(null);
    }
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
    capture = false
  ): void {
    target.addEventListener(type, handler, capture);
    this.unlisten.push(() => target.removeEventListener(type, handler, capture));
  }

  // ---- the card ---------------------------------------------------------------

  /** Dragged by its head, the card moves out of the way of whoever is being posed. */
  private grabCard(e: PointerEvent): void {
    const target = e.target as Element | null;
    if (e.button !== 0 || !target?.closest('.agentopia-pose-head') || target.closest('button')) {
      return;
    }
    e.preventDefault();
    const host = this.host.getBoundingClientRect();
    const box = this.card.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    this.card.classList.add('moving');
    const move = (m: PointerEvent): void => {
      const left = Math.max(0, Math.min(host.width - box.width, m.clientX - host.left - dx));
      const top = Math.max(0, Math.min(host.height - 40, m.clientY - host.top - dy));
      Object.assign(this.card.style, { left: `${left}px`, top: `${top}px`, right: 'auto' });
    };
    const up = (): void => {
      this.card.classList.remove('moving');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private nameOf(pick: Pick): string {
    const scene = this.scene;
    if (!scene) {
      return '';
    }
    if (pick.kind === 'pet') {
      return `the ${this.petOf(pick.id)?.kind ?? 'pet'}`;
    }
    if (pick.id === scene.base.human.id) {
      return 'you';
    }
    const i = scene.base.actors.findIndex((a) => a.id === pick.id);
    const actor = scene.base.actors[i];
    if (!actor) {
      return '';
    }
    // Numbered, so two of them can be told apart in a list.
    const name = `agent ${i + 1}`;
    const desk = scene.base.desks.find((d) => d.bus === actor.bus);
    if (actor.role === 'lead' && desk) {
      return `${name}, lead at desk ${desk.slot + 1}`;
    }
    return actor.role === 'helper' ? `${name}, a ${actor.label} helper` : name;
  }

  private show(): void {
    const card = this.card;
    card.replaceChildren();
    const head = el('div', 'agentopia-pose-head');
    const title = el('div', 'agentopia-pose-title', this.folded ? 'POSE ▸' : 'POSE ▾');
    title.title = this.folded ? 'Open the pose card' : 'Fold the pose card away';
    title.addEventListener('click', (e) => {
      e.stopPropagation();
      this.folded = !this.folded;
      this.show();
    });
    card.classList.toggle('folded', this.folded);
    const state = el('span', 'agentopia-pose-state', this.scene ? 'frozen' : 'live');
    const left = el('div', 'agentopia-pose-row');
    left.append(title, state);
    head.append(left);
    if (this.scene) {
      head.append(
        chip('resume', false, () => this.resume(), 'Let the office live on, and forget the poses')
      );
    } else {
      head.append(
        chip('freeze', false, () => {
          this.freezeNow();
          this.show();
        })
      );
    }
    card.append(head);
    if (this.folded) {
      return;
    }

    const pick = this.selected;
    if (!pick || !this.scene) {
      card.append(
        el(
          'div',
          'agentopia-pose-hint',
          'Press anyone to freeze the office and pose them; drag them about, and drop them on a seat or a perch to put them there; press again to reach whoever is behind. Poses keep moving, so a clip from the export key catches them.'
        )
      );
      this.showHidden();
      return;
    }
    card.append(el('div', 'agentopia-pose-name', this.nameOf(pick)));
    if (pick.kind === 'person') {
      this.showPerson(pick.id);
    } else {
      this.showPet(pick.id);
    }
    const done = el('div', 'agentopia-pose-row');
    done.append(
      chip('take out', false, () => {
        this.edit((pose) => {
          pose.hidden = true;
        });
        this.select(null);
      }),
      chip('as it was', false, () => {
        if (pick.kind === 'person') {
          delete this.scene?.people[pick.id];
        } else {
          delete this.scene?.pets[pick.id];
        }
        this.save();
        this.select(null);
      }),
      chip('done', false, () => this.select(null))
    );
    card.append(done);
  }

  /** Whoever was taken out, to bring back. */
  private showHidden(): void {
    const scene = this.scene;
    if (!scene) {
      return;
    }
    const out: Pick[] = [
      ...Object.entries(scene.people)
        .filter(([, p]) => p.hidden)
        .map(([id]): Pick => ({ kind: 'person', id })),
      ...Object.entries(scene.pets)
        .filter(([, p]) => p.hidden)
        .map(([id]): Pick => ({ kind: 'pet', id })),
    ];
    if (out.length === 0) {
      return;
    }
    this.card.append(el('div', 'agentopia-pose-label', 'taken out'));
    const row = el('div', 'agentopia-pose-row');
    for (const pick of out) {
      row.append(
        chip(`${this.nameOf(pick)} ↩`, false, () => {
          const pose = pick.kind === 'person' ? scene.people[pick.id] : scene.pets[pick.id];
          if (pose) {
            pose.hidden = false;
          }
          this.select(pick);
        })
      );
    }
    this.card.append(row);
  }

  private headingRow(pose: { heading: Heading }): HTMLElement {
    const grid = el('div', 'agentopia-pose-grid four');
    const yaw = this.office.yawNow();
    for (const h of HEADINGS) {
      grid.append(
        chip(headingWords(h, yaw), pose.heading === h, () => {
          this.edit((p) => {
            p.heading = h;
          });
        })
      );
    }
    return grid;
  }

  private showPerson(id: string): void {
    const scene = this.scene as Scene;
    const pose = this.personPose(id);
    const actor =
      id === scene.base.human.id ? scene.base.human : scene.base.actors.find((a) => a.id === id);
    if (!pose || !actor) {
      return;
    }
    const card = this.card;
    card.append(el('div', 'agentopia-pose-label', 'pose'));
    const grid = el('div', 'agentopia-pose-grid');
    for (const spec of posesFor(actor)) {
      grid.append(
        chip(spec.label, pose.pose === spec.id, () => {
          this.edit((p) => {
            const person = p as PersonPose;
            const was = personPose(person.pose);
            person.pose = spec.id;
            if (spec.seat === 'always') {
              person.seated = true;
            }
            // A pose that talks starts with a line; one that doesn't drops the line it brought.
            if (spec.says && person.says.trim() === '') {
              person.says = spec.says;
            } else if (!spec.says && was.says !== undefined && person.says === was.says) {
              person.says = '';
            }
          }, true);
        })
      );
    }
    card.append(grid);

    card.append(el('div', 'agentopia-pose-label', 'facing'));
    card.append(this.headingRow(pose));

    const spec = personPose(pose.pose);
    if (spec.seat === 'may') {
      const label = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = pose.seated;
      box.addEventListener('change', () => {
        this.edit((p) => {
          (p as PersonPose).seated = box.checked;
        });
      });
      label.append(box, document.createTextNode('sitting (on a sofa or chair)'));
      card.append(label);
    }

    card.append(el('div', 'agentopia-pose-label', 'says'));
    const says = el('input');
    says.type = 'text';
    says.maxLength = 80;
    says.placeholder = 'nothing';
    says.value = pose.says;
    says.addEventListener('input', () => {
      const p = this.scene?.people[id];
      if (p) {
        p.says = says.value;
        this.save();
      }
    });
    card.append(says);

    card.append(el('div', 'agentopia-pose-label', 'put at'));
    card.append(
      this.spotSelect(PERSON_SNAPS, pose.pos, (snap) => {
        this.edit((p) => {
          const person = p as PersonPose;
          person.pos = { ...snap.at };
          person.heading = snap.heading;
          person.seated = snap.seated === true;
        });
      })
    );
  }

  private showPet(id: string): void {
    const pet = this.petOf(id);
    const pose = this.petPose(id);
    if (!pet || !pose) {
      return;
    }
    const card = this.card;
    card.append(el('div', 'agentopia-pose-label', 'pose'));
    const grid = el('div', 'agentopia-pose-grid');
    for (const spec of petPosesFor(pet.kind)) {
      grid.append(
        chip(spec.label, pose.pose === spec.id, () => {
          this.edit((p) => {
            const it = p as PetPose;
            it.pose = spec.id;
            // Nobody walks along the top of a bookshelf.
            if (spec.id === 'walk' || spec.id === 'trot') {
              it.z = 0;
            }
          }, true);
        })
      );
    }
    card.append(grid);
    card.append(el('div', 'agentopia-pose-label', 'facing'));
    card.append(this.headingRow(pose));
    card.append(el('div', 'agentopia-pose-label', 'keeps beside'));
    const follow = el('select');
    const nobody = el('option', '', 'nobody');
    nobody.value = '';
    follow.append(nobody);
    const scene = this.scene as Scene;
    for (const who of [scene.base.human, ...scene.base.actors]) {
      if (scene.people[who.id]?.hidden) {
        continue;
      }
      const option = el('option', '', this.nameOf({ kind: 'person', id: who.id }));
      option.value = who.id;
      follow.append(option);
    }
    follow.value = pose.follow ?? '';
    follow.addEventListener('change', () => {
      this.edit((p) => {
        const it = p as PetPose;
        if (follow.value) {
          it.follow = follow.value;
          it.z = 0;
        } else {
          delete it.follow;
        }
      });
    });
    card.append(follow);
    card.append(el('div', 'agentopia-pose-label', 'put at'));
    card.append(
      this.spotSelect(petSnaps(pet.kind), pose.pos, (snap) => {
        this.edit((p) => {
          const it = p as PetPose;
          it.pos = { ...snap.at };
          it.z = snap.z;
          it.heading = snap.heading;
        });
      })
    );
  }

  private spotSelect(
    snaps: readonly Snap[],
    at: Point,
    onPick: (snap: Snap) => void
  ): HTMLSelectElement {
    const select = el('select');
    const here = snaps.find((s) => Math.hypot(s.at.x - at.x, s.at.y - at.y) < 0.01);
    const free = el('option', '', 'where they are');
    free.value = '';
    select.append(free);
    for (const snap of snaps) {
      const option = el('option', '', snap.label);
      option.value = snap.id;
      select.append(option);
    }
    select.value = here?.id ?? '';
    select.addEventListener('change', () => {
      const snap = snaps.find((s) => s.id === select.value);
      if (snap) {
        onPick(snap);
      }
    });
    return select;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
