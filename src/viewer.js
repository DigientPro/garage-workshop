import {
  Box3, Color, DirectionalLight, HemisphereLight, OrthographicCamera,
  Scene, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.querySelector('canvas');
const status = document.getElementById('status');
const entranceLabel = document.getElementById('entrance-label');
const buttons = Object.fromEntries(
  Array.from(document.querySelectorAll('button'), button => [button.id, button]),
);
const modelURL = new URL('./garage.glb?v=2', document.baseURI);
const state = { floor: true, ceiling: true, floorMode: 'joists' };

start().catch(() => {
  const link = document.createElement('a');
  link.href = modelURL;
  link.textContent = 'Скачать 3D-модель (GLB)';
  status.replaceChildren('Не удалось открыть 3D-вид.', document.createElement('br'), link);
});

async function start() {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  const scene = new Scene();
  scene.background = new Color('#e9e7de');
  scene.add(new HemisphereLight('#fffefa', '#a1a294', 2.1));
  const sun = new DirectionalLight('#fff4e1', 2.25);
  sun.position.set(-4, 7, 5);
  scene.add(sun);

  const { scene: model } = await new GLTFLoader().loadAsync(modelURL.href);
  scene.add(model);
  const roof = model.getObjectByName('ceiling');
  const floorBase = model.getObjectByName('floor-base');
  const joists = model.getObjectByName('joists');
  const deck = model.getObjectByName('deck');
  const entrance = model.getObjectByName('entrance').getWorldPosition(new Vector3());
  const projectedEntrance = new Vector3();
  const room = new Box3().setFromObject(model.getObjectByName('walls'));
  const center = room.getCenter(new Vector3());
  const corners = [room.min.x, room.max.x].flatMap(x =>
    [room.min.y, room.max.y].flatMap(y => [room.min.z, room.max.z].map(z => new Vector3(x, y, z))),
  );

  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 60);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.minZoom = .65;
  orbit.maxZoom = 5;
  orbit.listenToKeyEvents(canvas);
  orbit.target.copy(center);

  let viewportAspect = 1;
  let frameSize = 4;
  let frame = 0;
  function requestRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      orbit.update();
      renderer.render(scene, camera);
      positionEntranceLabel();
    });
  }
  orbit.addEventListener('change', requestRender);

  function positionEntranceLabel() {
    const { x, y, z } = projectedEntrance.copy(entrance).project(camera);
    const left = (x + 1) * canvas.clientWidth / 2;
    const top = (1 - y) * canvas.clientHeight / 2;
    entranceLabel.hidden = z < -1 || z > 1 || left < 34 || left > canvas.clientWidth - 34
      || top < 36 || top > canvas.clientHeight;
    entranceLabel.style.left = `${left}px`;
    entranceLabel.style.top = `${top}px`;
  }

  function applyFrustum() {
    camera.left = -frameSize * viewportAspect;
    camera.right = -camera.left;
    camera.bottom = -frameSize;
    camera.top = frameSize;
    camera.updateProjectionMatrix();
  }

  function fitFrustum() {
    camera.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    frameSize = Math.max(...corners.map(point => {
      const offset = point.clone().sub(center);
      return Math.max(Math.abs(offset.dot(right)) / viewportAspect, Math.abs(offset.dot(up)));
    })) * 1.12;
    applyFrustum();
  }

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    viewportAspect = width / height;
    renderer.setSize(width, height, false);
    fitFrustum();
    requestRender();
  }

  function setCamera(x, y, z) {
    orbit.reset();
    camera.zoom = 1;
    orbit.target.copy(center);
    camera.position.copy(center).addScaledVector(new Vector3(x, y, z).normalize(), 14);
    camera.lookAt(center);
    orbit.update();
    fitFrustum();
    orbit.saveState();
    requestRender();
  }

  function showOverview() {
    setCamera(1, .265, .57);
  }

  function showPlan(height) {
    if (viewportAspect < .9) {
      setCamera(.001, height, 0);
    } else {
      setCamera(0, height, .001);
    }
  }

  function updateLayers() {
    roof.visible = state.ceiling;
    floorBase.visible = state.floor;
    joists.visible = state.floor && state.floorMode === 'joists';
    deck.visible = state.floor && state.floorMode === 'deck';
    buttons.floor.textContent = state.floor ? 'Скрыть пол' : 'Показать пол';
    buttons.ceiling.textContent = state.ceiling ? 'Скрыть потолок' : 'Показать потолок';
    for (const mode of ['deck', 'joists']) {
      buttons[mode].setAttribute('aria-pressed', String(state.floorMode === mode));
    }
    requestRender();
  }

  for (const mode of ['deck', 'joists']) {
    buttons[mode].addEventListener('click', () => {
      state.floorMode = mode;
      state.floor = true;
      updateLayers();
      if (camera.position.y < room.min.y) showOverview();
    });
  }
  buttons.floor.addEventListener('click', () => {
    state.floor = !state.floor;
    updateLayers();
    if (state.floor && camera.position.y < room.min.y) showOverview();
  });
  buttons.ceiling.addEventListener('click', () => {
    state.ceiling = !state.ceiling;
    updateLayers();
    if (state.ceiling && camera.position.y > room.max.y) showOverview();
    if (!state.ceiling && camera.position.y < room.min.y) showOverview();
  });
  buttons.overview.addEventListener('click', showOverview);
  buttons.above.addEventListener('click', () => showPlan(1));
  buttons.below.addEventListener('click', () => {
    state.ceiling = true;
    state.floor = false;
    updateLayers();
    showPlan(-1);
  });

  // Keyboard zoom complements OrbitControls' pointer, wheel and pinch gestures.
  canvas.addEventListener('keydown', event => {
    if (!['+', '=', '-'].includes(event.key)) return;
    event.preventDefault();
    const zoomFactor = event.key === '-' ? 1 / 1.15 : 1.15;
    camera.zoom = Math.min(orbit.maxZoom, Math.max(orbit.minZoom, camera.zoom * zoomFactor));
    camera.updateProjectionMatrix();
    requestRender();
  });

  resize();
  new ResizeObserver(resize).observe(canvas);
  updateLayers();
  showOverview();
  document.getElementById('controls').disabled = false;
  status.hidden = true;
}
