import * as THREE from 'three';

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2614);
scene.fog = new THREE.Fog(0x2a2614, 2, 30);
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 1.65, 0);
const wallMat = new THREE.MeshLambertMaterial({ color: 0xb8a35a });
for (let i = 0; i < 20; i++) {
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, 2), wallMat);
    w.position.set(side * 1.5, 1.35, -i * 2);
    scene.add(w);
  }
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 40), new THREE.MeshLambertMaterial({ color: 0x8a7a3a }));
floor.rotation.x = -Math.PI / 2;
floor.position.z = -19;
scene.add(floor);
scene.add(new THREE.AmbientLight(0xfff2c0, 1.2));
(window as unknown as { __HUM__?: unknown }).__HUM__ = location.search.includes('test=1') ? { ready: true } : undefined;
renderer.setAnimationLoop((t) => {
  camera.position.z = -((t / 1000) % 30);
  renderer.render(scene, camera);
});
