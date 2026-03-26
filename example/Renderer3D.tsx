import { useRef, useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useQuery, useWorld } from '../src';
import {
  Transform, Velocity, Energy,
  Herbivore, Predator, Plant,
  WIDTH, HEIGHT,
} from './components';

const HALF_W = WIDTH / 2;
const HALF_H = HEIGHT / 2;
const MAX_INSTANCES = 256;

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  herbMesh: THREE.InstancedMesh;
  predMesh: THREE.InstancedMesh;
  plantMesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
}

function createScene(canvas: HTMLCanvasElement): SceneState {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(WIDTH, HEIGHT);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080f);
  scene.fog = new THREE.FogExp2(0x08080f, 0.0012);

  const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 1, 2000);
  camera.position.set(0, 500, 450);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.update();

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(WIDTH * 1.2, HEIGHT * 1.2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0c0c18,
    roughness: 0.95,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid overlay
  const grid = new THREE.GridHelper(Math.max(WIDTH, HEIGHT), 40, 0x1a1a2e, 0x12121f);
  grid.position.y = 0;
  scene.add(grid);

  // Lighting
  const ambient = new THREE.AmbientLight(0x303050, 1.5);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(200, 400, 200);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 50;
  dirLight.shadow.camera.far = 1200;
  dirLight.shadow.camera.left = -500;
  dirLight.shadow.camera.right = 500;
  dirLight.shadow.camera.top = 500;
  dirLight.shadow.camera.bottom = -500;
  scene.add(dirLight);

  const bluePoint = new THREE.PointLight(0x4488ff, 80, 600);
  bluePoint.position.set(-200, 80, -100);
  scene.add(bluePoint);

  const redPoint = new THREE.PointLight(0xff4444, 60, 500);
  redPoint.position.set(200, 80, 100);
  scene.add(redPoint);

  // Instanced meshes
  const herbGeo = new THREE.ConeGeometry(4, 12, 6);
  herbGeo.rotateX(Math.PI / 2);
  const herbMat = new THREE.MeshStandardMaterial({
    color: 0x46a0ff,
    emissive: 0x1a3a66,
    roughness: 0.4,
    metalness: 0.3,
  });
  const herbMesh = new THREE.InstancedMesh(herbGeo, herbMat, MAX_INSTANCES);
  herbMesh.castShadow = true;
  herbMesh.count = 0;
  scene.add(herbMesh);

  const predGeo = new THREE.ConeGeometry(6, 16, 4);
  predGeo.rotateX(Math.PI / 2);
  const predMat = new THREE.MeshStandardMaterial({
    color: 0xf04646,
    emissive: 0x661a1a,
    roughness: 0.3,
    metalness: 0.4,
  });
  const predMesh = new THREE.InstancedMesh(predGeo, predMat, MAX_INSTANCES);
  predMesh.castShadow = true;
  predMesh.count = 0;
  scene.add(predMesh);

  const plantGeo = new THREE.SphereGeometry(3, 6, 4);
  const plantMat = new THREE.MeshStandardMaterial({
    color: 0x33aa33,
    emissive: 0x0a330a,
    roughness: 0.7,
    metalness: 0.1,
  });
  const plantMesh = new THREE.InstancedMesh(plantGeo, plantMat, MAX_INSTANCES);
  plantMesh.count = 0;
  scene.add(plantMesh);

  const dummy = new THREE.Object3D();

  return { renderer, scene, camera, controls, herbMesh, predMesh, plantMesh, dummy };
}

export function Renderer3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneState | null>(null);

  const entities = useQuery([Transform]);
  const world = useWorld();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = createScene(canvas);
    sceneRef.current = state;
    return () => {
      state.controls.dispose();
      state.renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const state = sceneRef.current;
    if (!state) return;

    const { renderer, scene, camera, controls, herbMesh, predMesh, plantMesh, dummy } = state;

    let herbIdx = 0;
    let predIdx = 0;
    let plantIdx = 0;

    for (const entity of entities) {
      if (!entity.alive) continue;
      const t = entity.get<{ x: number; y: number }>(Transform);
      const worldX = t.x - HALF_W;
      const worldZ = t.y - HALF_H;

      if (entity.has(Plant)) {
        if (plantIdx >= MAX_INSTANCES) continue;
        dummy.position.set(worldX, 2, worldZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        plantMesh.setMatrixAt(plantIdx, dummy.matrix);
        plantIdx++;
      } else if (entity.has(Herbivore)) {
        if (herbIdx >= MAX_INSTANCES) continue;
        const v = entity.get<{ x: number; y: number }>(Velocity);
        const e = entity.get<{ current: number; max: number }>(Energy);
        const energyRatio = e ? e.current / e.max : 1;
        const bob = 6 + Math.sin(Date.now() * 0.004 + entity.id * 1.7) * 2;

        dummy.position.set(worldX, bob, worldZ);
        if (v) {
          const speed = Math.sqrt(v.x * v.x + v.y * v.y);
          if (speed > 1) {
            dummy.rotation.set(0, Math.atan2(v.x, v.y), 0);
          }
        }
        dummy.scale.setScalar(0.5 + energyRatio * 0.7);
        dummy.updateMatrix();
        herbMesh.setMatrixAt(herbIdx, dummy.matrix);
        herbIdx++;
      } else if (entity.has(Predator)) {
        if (predIdx >= MAX_INSTANCES) continue;
        const v = entity.get<{ x: number; y: number }>(Velocity);
        const e = entity.get<{ current: number; max: number }>(Energy);
        const energyRatio = e ? e.current / e.max : 1;
        const bob = 10 + Math.sin(Date.now() * 0.005 + entity.id * 2.3) * 3;

        dummy.position.set(worldX, bob, worldZ);
        if (v) {
          const speed = Math.sqrt(v.x * v.x + v.y * v.y);
          if (speed > 1) {
            dummy.rotation.set(0, Math.atan2(v.x, v.y), 0);
          }
        }
        dummy.scale.setScalar(0.6 + energyRatio * 0.6);
        dummy.updateMatrix();
        predMesh.setMatrixAt(predIdx, dummy.matrix);
        predIdx++;
      }
    }

    herbMesh.count = herbIdx;
    herbMesh.instanceMatrix.needsUpdate = true;
    predMesh.count = predIdx;
    predMesh.instanceMatrix.needsUpdate = true;
    plantMesh.count = plantIdx;
    plantMesh.instanceMatrix.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);
  });

  const hCount = world.query([Herbivore]).length;
  const pCount = world.query([Predator]).length;
  const plCount = world.query([Plant]).length;

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', borderRadius: 8 }}
      />
      <div className="hud-overlay">
        <span className="hud-stat hud-herb">herbivores {hCount}</span>
        <span className="hud-stat hud-pred">predators {pCount}</span>
        <span className="hud-stat hud-plant">plants {plCount}</span>
        <span className="hud-stat hud-total">entities {world.entities.size}</span>
      </div>
    </div>
  );
}
