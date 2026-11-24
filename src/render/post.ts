import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TAPE_FRAG, TAPE_VERT } from './shaders.ts';

export type Quality = 'low' | 'medium' | 'high' | 'auto';

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  tape: ShaderPass;
  render: RenderPass;
  scale = 1;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType }));
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.45, 1.25);
    this.composer.addPass(this.bloom);
    this.tape = new ShaderPass(
      new THREE.ShaderMaterial({
        vertexShader: TAPE_VERT,
        fragmentShader: TAPE_FRAG,
        uniforms: {
          tDiffuse: { value: null },
          uTime: { value: 0 },
          uCam: { value: 0 },
          uNight: { value: 0 },
          uReplay: { value: 0 },
          uTear: { value: 0 },
          uFlash: { value: 0 },
          uGrain: { value: 0.035 },
          uFilter: { value: 0 },
          uFade: { value: 0 },
          uStatic: { value: 0 },
          uRes: { value: new THREE.Vector2(size.x, size.y) },
        },
      }),
    );
    this.composer.addPass(this.tape);
    this.composer.addPass(new OutputPass());
  }

  setCamera(camera: THREE.Camera, scene: THREE.Scene): void {
    this.render.camera = camera;
    this.render.scene = scene;
  }

  u(name: string): { value: number } {
    return this.tape.uniforms[name] as { value: number };
  }

  setQuality(q: Exclude<Quality, 'auto'>): void {
    this.bloom.enabled = q !== 'low';
    this.bloom.strength = q === 'high' ? 0.45 : 0.38;
  }

  resize(w: number, h: number, pixelRatio: number): void {
    const s = this.scale;
    this.renderer.setPixelRatio(pixelRatio * s);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pixelRatio * s);
    this.composer.setSize(w, h);
    (this.tape.uniforms.uRes!.value as THREE.Vector2).set(w * pixelRatio * s, h * pixelRatio * s);
  }

  draw(): void {
    this.composer.render();
  }
}
