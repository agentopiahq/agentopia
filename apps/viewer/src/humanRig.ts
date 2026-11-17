import { Actor } from '@agentopia/core';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

import type { RigView } from './character';
import { BLEND_S, BOX, Ctx, HumanPose, RIG_SCALE, blend, drawHuman, humanPose } from './human';

/**
 * The human's rig: the poses and drawing in `human.ts`, drawn each frame into
 * a canvas of its own that the office composites as a sprite, the way
 * `AgentRig` draws the Claude character.
 */

// ---- the rig -----------------------------------------------------------------

/** The human, drawn per frame into a canvas the office composites as a sprite. */
export class HumanRig {
  readonly view = new Container();

  private readonly canvas = document.createElement('canvas');
  private readonly sprite = new Sprite();
  private source: CanvasSource | null = null;
  private resolution = 0;
  /** How it last sat: what getting up eases out of, with no activity left to say. */
  private seat: 'sit' | 'hug' = 'sit';
  private lastPose: HumanPose | null = null;
  private lastKey = '';
  private blendFrom: HumanPose | null = null;
  private blendAt = 0;

  constructor() {
    this.sprite.position.set(BOX.x0 * RIG_SCALE, BOX.y0 * RIG_SCALE);
    this.view.addChild(this.sprite);
  }

  private ensure(resolution: number): void {
    const res = Math.max(1, Math.min(4, Math.round(resolution * 4) / 4));
    if (res === this.resolution && this.source) {
      return;
    }
    this.resolution = res;
    this.canvas.width = Math.ceil((BOX.x1 - BOX.x0) * RIG_SCALE * res);
    this.canvas.height = Math.ceil((BOX.y1 - BOX.y0) * RIG_SCALE * res);
    const old = this.sprite.texture;
    this.source = new CanvasSource({ resource: this.canvas, resolution: res });
    this.sprite.texture = new Texture({ source: this.source });
    if (old && old !== Texture.EMPTY) {
      old.destroy(true);
    }
  }

  /** Same contract as `AgentRig.update`; the human never types at a desk. */
  update(
    actor: Actor,
    t: number,
    _atOwnComputer: boolean,
    resolution = 2,
    view: RigView = {}
  ): void {
    this.ensure(resolution);
    const act = actor.activity?.act;
    if (act === 'hug' || act === 'sit') {
      this.seat = act;
    }
    const clock = view.clock ?? t;
    let pose = humanPose(actor, t, view.sit ?? 0, this.seat, view.travel ?? clock, {
      back: view.back === true,
      square: view.square === true,
    });
    const key = `${actor.state}|${actor.gesture ?? ''}|${this.seat}|${view.back === true}|${view.square === true}`;
    if (key !== this.lastKey) {
      this.blendFrom = this.lastPose;
      this.blendAt = clock;
      this.lastKey = key;
    }
    if (this.blendFrom) {
      const k = (clock - this.blendAt) / BLEND_S;
      if (k < 0 || k >= 1) {
        this.blendFrom = null;
      } else {
        pose = blend(this.blendFrom, pose, k * k * (3 - 2 * k));
      }
    }
    this.lastPose = pose;
    const g = this.canvas.getContext('2d') as Ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.resolution * RIG_SCALE;
    const flip = actor.facing < 0 ? -1 : 1;
    g.setTransform(k * flip, 0, 0, k, -BOX.x0 * k, -BOX.y0 * k);
    drawHuman(g, pose, view.back === true, clock);
    this.source?.update();
  }

  destroy(): void {
    this.sprite.texture.destroy(true);
    this.view.destroy({ children: true });
  }
}
