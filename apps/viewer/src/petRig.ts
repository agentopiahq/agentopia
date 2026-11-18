import { PetKind, PetView } from '@agentopia/core';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

import { BOX, BUILD, drawPet, petPose } from './pet';
import { styled } from './styles/context';

/** A pet's rig: its own small canvas, posed and drawn each frame, as a sprite. */
export class PetRig {
  readonly view = new Container();

  private readonly canvas = document.createElement('canvas');
  private readonly sprite = new Sprite();
  private source: CanvasSource | null = null;
  private resolution = 0;

  constructor(private readonly kind: PetKind) {
    const s = BUILD[kind].scale;
    this.sprite.position.set(BOX.x0 * s, BOX.y0 * s);
    this.view.addChild(this.sprite);
  }

  private ensure(resolution: number): void {
    const res = Math.max(1, Math.min(4, Math.round(resolution * 4) / 4));
    if (res === this.resolution && this.source) {
      return;
    }
    const s = BUILD[this.kind].scale;
    this.resolution = res;
    this.canvas.width = Math.ceil((BOX.x1 - BOX.x0) * s * res);
    this.canvas.height = Math.ceil((BOX.y1 - BOX.y0) * s * res);
    const old = this.sprite.texture;
    this.source = new CanvasSource({ resource: this.canvas, resolution: res });
    this.sprite.texture = new Texture({ source: this.source });
    if (old && old !== Texture.EMPTY) {
      old.destroy(true);
    }
  }

  /**
   * Pose and draw one frame, facing `facing` along the screen. `travel` is
   * how far it has walked, in tiles (what its legs step by); `clock` the
   * frame clock in seconds, for blinks and the z's.
   */
  update(pet: PetView, facing: 1 | -1, travel: number, clock: number, resolution = 2): void {
    this.ensure(resolution);
    const s = BUILD[this.kind].scale;
    const g = styled(this.canvas.getContext('2d') as CanvasRenderingContext2D, { figure: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.resolution * s;
    g.setTransform(k * facing, 0, 0, k, (facing > 0 ? -BOX.x0 : BOX.x1) * k, -BOX.y0 * k);
    const pose = petPose(pet, pet.phase / 1000, travel);
    drawPet(g, this.kind, pose, pet.id, clock);
    this.source?.update();
  }

  destroy(): void {
    this.sprite.texture.destroy(true);
    this.view.destroy({ children: true });
  }
}
