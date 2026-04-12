import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {
  createLavaShader, createSunShader, createAtmosphereShader,
  createShieldShader, createEnergyFlowShader, createNebulaShader,
  createHologramShader, createStarfieldShader,
  createTexturedBuildingShader, createPlanetShader,
  createProceduralPlanetShader,
  HeatDistortionShader, VignetteGradeShader,
} from './shaders.js';

// ============================================================
// ERROR HANDLING
// ============================================================
window.addEventListener('error', (e) => { console.error('[Ignisium]', e.error); showError(e.message); });
window.addEventListener('unhandledrejection', (e) => { console.error('[Ignisium]', e.reason); showError(String(e.reason)); });

function showError(msg) {
  let el = document.getElementById('error-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'error-overlay';
    el.style.cssText = 'position:fixed;bottom:20px;left:20px;max-width:500px;padding:12px 16px;background:rgba(255,30,30,0.15);border:1px solid rgba(255,60,60,0.4);color:#ff6666;font:12px monospace;z-index:999;border-radius:4px;cursor:pointer;';
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
  }
  el.textContent = `⚠ ${msg}`;
  setTimeout(() => el?.remove(), 8000);
}

function safe(fn, ctx) { try { return fn(); } catch (e) { console.error(`[${ctx}]`, e); showError(`${ctx}: ${e.message}`); return null; } }

// ============================================================
// GAME CONFIG & DEFINITIONS
// ============================================================

// --- Tech Tree ---
const TechTree = {
  basic_construction: { name: 'Basic Construction', cost: { energy: 30 }, time: 5, unlocks: ['thermal_extractor', 'mineral_drill', 'habitat_pod'], requires: [], desc: 'Unlock basic colony structures' },
  advanced_extraction: { name: 'Advanced Extraction', cost: { energy: 80, minerals: 40 }, time: 15, unlocks: [], requires: ['basic_construction'], desc: 'Extractors produce 50% more', effect: 'extractionBonus' },
  military_science: { name: 'Military Science', cost: { energy: 100, minerals: 60 }, time: 20, unlocks: ['barracks', 'defense_turret'], requires: ['basic_construction'], desc: 'Unlock military buildings' },
  shipyard_tech: { name: 'Shipyard Engineering', cost: { energy: 150, minerals: 100 }, time: 30, unlocks: ['shipyard'], requires: ['military_science'], desc: 'Unlock the Shipyard for fleet construction' },
  colonization: { name: 'Colonization', cost: { energy: 200, minerals: 150 }, time: 40, unlocks: [], requires: ['shipyard_tech'], desc: 'Unlocks colony ship construction at the Shipyard' },
  trade_networks: { name: 'Trade Networks', cost: { energy: 120, minerals: 80 }, time: 25, unlocks: ['trade_depot'], requires: ['basic_construction'], desc: 'Establish inter-colony trade routes' },
  shield_tech: { name: 'Shield Technology', cost: { energy: 180, minerals: 120 }, time: 35, unlocks: ['shield_gen'], requires: ['military_science'], desc: 'Unlock planetary shield generators' },
  research_lab_tech: { name: 'Research Methods', cost: { energy: 50, minerals: 30 }, time: 10, unlocks: ['research_lab'], requires: [], desc: 'Unlock the Research Lab for faster research' },
  storage_tech: { name: 'Storage Systems', cost: { energy: 40, minerals: 25 }, time: 8, unlocks: ['warehouse'], requires: [], desc: 'Unlock warehouses for resource storage' },
};

// --- Building Definitions ---
const BuildingDefs = {
  command_center: { name: 'Command Center', icon: '🏛️', desc: 'Central hub. Increases max population.', cost: { energy: 0, minerals: 0 }, production: {}, maxPopBonus: 10, maxLevel: 5, unique: true, category: 'core' },
  thermal_extractor: { name: 'Thermal Extractor', icon: '🔥', desc: 'Taps lava flows for thermal energy.', cost: { energy: 10, minerals: 15 }, production: { energy: 2 }, maxPopBonus: 0, maxLevel: 5, category: 'resource' },
  mineral_drill: { name: 'Mineral Drill', icon: '⛏️', desc: 'Extracts rare minerals from basalt.', cost: { energy: 15, minerals: 10 }, production: { minerals: 2 }, maxPopBonus: 0, maxLevel: 5, category: 'resource' },
  habitat_pod: { name: 'Habitat Pod', icon: '🏠', desc: 'Pressurized living quarters.', cost: { energy: 20, minerals: 20 }, production: {}, maxPopBonus: 8, maxLevel: 5, category: 'civilian' },
  research_lab: { name: 'Research Lab', icon: '🔬', desc: 'Accelerates tech research by 30%.', cost: { energy: 40, minerals: 30 }, production: {}, maxPopBonus: 0, maxLevel: 3, category: 'civilian', effect: 'researchSpeed' },
  warehouse: { name: 'Warehouse', icon: '📦', desc: 'Increases resource storage capacity.', cost: { energy: 25, minerals: 35 }, production: {}, maxPopBonus: 0, maxLevel: 5, category: 'civilian', effect: 'storageBonus' },
  barracks: { name: 'Barracks', icon: '⚔️', desc: 'Trains defense units.', cost: { energy: 50, minerals: 40 }, production: {}, maxPopBonus: 0, maxLevel: 3, category: 'military', effect: 'defense' },
  defense_turret: { name: 'Defense Turret', icon: '🗼', desc: 'Automated defense against raids.', cost: { energy: 60, minerals: 50 }, production: {}, maxPopBonus: 0, maxLevel: 5, category: 'military', effect: 'turret' },
  shipyard: { name: 'Shipyard', icon: '🚀', desc: 'Constructs ships and colony vessels.', cost: { energy: 100, minerals: 80 }, production: {}, maxPopBonus: 0, maxLevel: 3, unique: true, category: 'military' },
  trade_depot: { name: 'Trade Depot', icon: '🔄', desc: 'Enables trade routes between planets.', cost: { energy: 60, minerals: 50 }, production: { energy: 1, minerals: 1 }, maxPopBonus: 0, maxLevel: 3, unique: true, category: 'civilian' },
  shield_gen: { name: 'Shield Generator', icon: '🛡️', desc: 'Projects a protective shield.', cost: { energy: 120, minerals: 100 }, production: {}, maxPopBonus: 0, maxLevel: 3, unique: true, category: 'military', effect: 'shield' },
};

// --- Ship Definitions ---
const ShipDefs = {
  fighter:    { name: 'Fighter',     icon: '✈️', desc: 'Combat ship for defense and escort.', cost: { energy: 80, minerals: 60 }, buildTime: 20 },
  transport:  { name: 'Transport',   icon: '🚚', desc: 'Cargo vessel for establishing trade routes.', cost: { energy: 100, minerals: 80 }, buildTime: 30 },
  colonyShip: { name: 'Colony Ship', icon: '🚀', desc: 'Massive vessel to colonize new worlds.', cost: { energy: 300, minerals: 200 }, buildTime: 60 },
};

// --- Planet Definitions ---
const PlanetDefs = [
  { name: 'Ignisium', type: 'Volcanic', color: 0xff5511, emissive: 0xff3300, emissiveIntensity: 1.5, atmosColor: 0xff4400, radius: 5, dist: 40, speed: 0.3, colonized: true, resources: { energy: 'Very High', minerals: 'High', rare: 'Low' }, threat: 'Medium', temperature: '1,200°C', gravity: '0.8g', desc: 'A volatile volcanic world rich in thermal energy. Lava rivers carve through basalt plains.' },
  { name: 'Crystara', type: 'Crystal Ice', color: 0x5599ff, emissive: 0x3366cc, emissiveIntensity: 1.2, atmosColor: 0x66aaff, radius: 4, dist: 65, speed: 0.2, colonized: false, resources: { energy: 'Low', minerals: 'Very High', rare: 'High' }, threat: 'Low', temperature: '-180°C', gravity: '0.6g', desc: 'Frozen world with vast crystal formations. Rich in rare minerals beneath the ice.' },
  { name: 'Verdania', type: 'Temperate', color: 0x55cc55, emissive: 0x338833, emissiveIntensity: 1.0, atmosColor: 0x77ee77, radius: 6, dist: 95, speed: 0.12, colonized: false, resources: { energy: 'Medium', minerals: 'Medium', rare: 'Medium' }, threat: 'Low', temperature: '22°C', gravity: '1.0g', desc: 'Earth-like world with breathable atmosphere. Balanced resources, ideal for expansion.' },
  { name: 'Nethara', type: 'Gas Giant', color: 0xcc8844, emissive: 0x775522, emissiveIntensity: 0.8, atmosColor: 0xddaa55, radius: 10, dist: 140, speed: 0.06, colonized: false, resources: { energy: 'High', minerals: 'None', rare: 'Very High' }, threat: 'High', temperature: '-110°C', gravity: '2.5g', desc: 'Massive gas giant. Orbital stations can harvest rare gases from the upper atmosphere.', mapping: 'equirect' },
  { name: 'Glacius', type: 'Frozen', color: 0xbbddff, emissive: 0x7799bb, emissiveIntensity: 0.6, atmosColor: 0xccddff, radius: 3.5, dist: 185, speed: 0.03, colonized: false, resources: { energy: 'Low', minerals: 'Medium', rare: 'Low' }, threat: 'Medium', temperature: '-220°C', gravity: '0.4g', desc: 'Distant frozen world. Subsurface oceans may hold ancient deposits.' },
];

// ============================================================
// GAME STATE
// ============================================================
const GS = {
  view: 'solar', // 'solar' | 'planet_overview' | 'zone' | 'transitioning'
  activeZone: null, // zone id when in 'zone' view
  resources: { energy: 50, minerals: 30 },
  population: 5,
  maxPopulation: 10,
  storageCap: { energy: 200, minerals: 200 },
  buildings: [],
  grid: new Map(),
  selectedBuilding: null,
  placingBuilding: null,
  time: 0,
  // Tech
  researchedTechs: new Set(['basic_construction', 'research_lab_tech', 'storage_tech']),
  currentResearch: null,
  researchProgress: 0,
  // Fleet
  ships: { fighter: 0, transport: 0, colonyShip: 0 },
  shipQueue: [], // { type, progress, buildTime }
  activePlanet: 'Ignisium', // which planet the player is viewing
  // Events
  events: [],
  eventCooldown: 60,
  lastEventTime: 0,
  // Defense
  defenseRating: 0,
  shieldActive: false,
  // Score
  score: 0,
  // Colonies
  colonies: ['Ignisium'],
  // Build queue
  buildQueue: [],
  // Trade
  tradeRoutes: [],
  // Tutorial
  tutorialStep: 0,
  tutorialDone: false,
  // Game speed & match
  gameSpeed: 1.0,
  matchMode: false,
  matchDuration: 600,
  matchTimeRemaining: 600,
  matchTargetScore: 1000,
  matchEnded: false,
  gameStarted: false,
};

// ============================================================
// SAVE / LOAD (Phase 4)
// ============================================================
function saveGame(silent = false) {
  const data = {
    resources: GS.resources,
    population: GS.population,
    maxPopulation: GS.maxPopulation,
    storageCap: GS.storageCap,
    buildings: GS.buildings.map(b => ({ type: b.type, q: b.q, r: b.r, zoneId: b.zoneId ?? 0, level: b.level })),
    researchedTechs: [...GS.researchedTechs],
    currentResearch: GS.currentResearch,
    researchProgress: GS.researchProgress,
    ships: GS.ships,
    shipQueue: GS.shipQueue,
    activePlanet: GS.activePlanet,
    defenseRating: GS.defenseRating,
    shieldActive: GS.shieldActive,
    score: GS.score,
    colonies: GS.colonies,
    colonyZoneIds: GS.colonies.filter(n => n !== 'Ignisium').map(n => {
      const z = ZONES.find(z => z.planet === n);
      return z ? { planet: n, zoneId: z.id } : null;
    }).filter(Boolean),
    tradeRoutes: GS.tradeRoutes,
    tutorialDone: GS.tutorialDone,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem('ignisium_save', JSON.stringify(data));
    if (!silent) showNotification('Game saved');
  } catch (e) { showError('Save failed: ' + e.message); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem('ignisium_save');
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(GS.resources, data.resources || {});
    GS.population = data.population ?? 5;
    GS.maxPopulation = data.maxPopulation ?? 10;
    if (data.storageCap) Object.assign(GS.storageCap, data.storageCap);
    GS.researchedTechs = new Set((data.researchedTechs || []).filter(id => TechTree[id]));
    GS.currentResearch = (data.currentResearch && TechTree[data.currentResearch]) ? data.currentResearch : null;
    GS.researchProgress = data.researchProgress || 0;
    if (data.ships) Object.assign(GS.ships, data.ships);
    GS.shipQueue = (data.shipQueue || []).filter(item => item && ShipDefs[item.type]);
    GS.activePlanet = data.activePlanet || 'Ignisium';
    GS.defenseRating = data.defenseRating ?? 0;
    GS.shieldActive = data.shieldActive ?? false;
    GS.score = data.score ?? 0;
    GS.colonies = data.colonies || ['Ignisium'];
    GS.tradeRoutes = data.tradeRoutes || [];
    GS.tutorialDone = data.tutorialDone ?? false;

    // Restore planet colonized state and rebuild colony zones in saved order
    GS.colonies.forEach(name => {
      const pDef = PlanetDefs.find(p => p.name === name);
      if (pDef) pDef.colonized = true;
      if (name === 'Ignisium' || !pDef) return;
      colonizePlanet(pDef);
    });

    // Rebuild buildings
    if (data.buildings) {
      data.buildings.forEach(b => {
        if (b.type === 'command_center') return; // already placed
        if (!BuildingDefs[b.type]) return; // skip unknown building types
        placeBuilding(b.type, b.q, b.r, true, b.zoneId ?? 0);
        const key = gridKey(b.q, b.r, b.zoneId ?? 0);
        const building = GS.grid.get(key);
        if (building) {
          for (let i = 1; i < b.level; i++) {
            building.level++;
            building.mesh.scale.setScalar(1 + (building.level - 1) * 0.08);
          }
        }
      });
    }
    recalcMaxPop();
    recalcDefense();
    showNotification('Game loaded');
    return true;
  } catch (e) { showError('Load failed: ' + e.message); return false; }
}

function showNotification(msg) {
  let el = document.getElementById('notification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notification';
    el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);padding:8px 20px;background:rgba(0,200,255,0.15);border:1px solid rgba(0,200,255,0.4);color:#0cf;font:12px "Orbitron",monospace;z-index:999;border-radius:4px;letter-spacing:1px;pointer-events:none;transition:opacity 0.5s;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

// ============================================================
// RENDERER
// ============================================================
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const solarScene = new THREE.Scene();
const planetScene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(0, 100, 150);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 300;
controls.maxPolarAngle = Math.PI * 0.45;

// ============================================================
// POST-PROCESSING PIPELINE
// ============================================================
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(solarScene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.3, 0.92);
composer.addPass(bloomPass);

const heatPass = new ShaderPass(HeatDistortionShader);
heatPass.enabled = false;
composer.addPass(heatPass);

const gradePass = new ShaderPass(VignetteGradeShader);
composer.addPass(gradePass);

// ============================================================
// SHADER INSTANCES
// ============================================================
let lavaShader = createLavaShader();
const sunShader = createSunShader();
const hologramShader = createHologramShader();
const buildingShaders = []; // track textured building shaders for uTime updates
const allShaders = [lavaShader, sunShader, hologramShader];

let lavaMesh = null;
const zoneGroups = []; // THREE.Group per zone, for visibility toggling
const zoneMarkers = []; // Sprite markers for planet overview

// ============================================================
// MATERIALS
// ============================================================
const basaltMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.75, metalness: 0.15, flatShading: true });
// Cyan LED indicators (small, focused, like Image 10 teal squares)
const cyanGlow = new THREE.MeshStandardMaterial({ color: 0x00eeff, emissive: 0x00ddff, emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.5 });
// Amber point lights — punchy SC2 style
const orangeGlow = new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.3 });
// Window glow: warm amber, strong bleed
const windowMat = new THREE.MeshStandardMaterial({ color: 0xffcc55, emissive: 0xffaa22, emissiveIntensity: 1.0 });

function metalMat(c = 0x506070) {
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.7, flatShading: true });
}

// Helper: create mesh and set position (Object.assign doesn't work for position on Object3D)
function meshAt(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// ============================================================
// SOLAR SYSTEM BUILD
// ============================================================
function buildSolarSystem() {
  solarScene.add(new THREE.AmbientLight(0x334466, 1.5));

  // Twinkling stars
  const sg = new THREE.BufferGeometry();
  const N = 4000;
  const sPos = new Float32Array(N * 3), sCol = new Float32Array(N * 3), sSz = new Float32Array(N), sPh = new Float32Array(N), sBr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = 500 + Math.random() * 1500, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sPos[i*3] = r*Math.sin(ph)*Math.cos(th); sPos[i*3+1] = r*Math.sin(ph)*Math.sin(th); sPos[i*3+2] = r*Math.cos(ph);
    const c = 0.5 + Math.random() * 0.5, t = Math.random();
    sCol[i*3] = c*(t>0.7?1:0.85); sCol[i*3+1] = c*(t>0.4?1:0.8); sCol[i*3+2] = c;
    sSz[i] = 0.5 + Math.random() * 2.0; sPh[i] = Math.random(); sBr[i] = 0.5 + Math.random() * 0.5;
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  sg.setAttribute('aSize', new THREE.BufferAttribute(sSz, 1));
  sg.setAttribute('aPhase', new THREE.BufferAttribute(sPh, 1));
  sg.setAttribute('aBrightness', new THREE.BufferAttribute(sBr, 1));
  const starMat = createStarfieldShader();
  allShaders.push(starMat);
  solarScene.add(new THREE.Points(sg, starMat));

  // Nebula
  const nebMat = createNebulaShader();
  allShaders.push(nebMat);
  solarScene.add(new THREE.Mesh(new THREE.SphereGeometry(800, 24, 24), nebMat));

  // Sun -- procedural surface generated entirely in shader from 3D noise.
  // No image, full 360 coverage, animated photosphere.
  const sunCfg = PLANET_SHADER_CONFIGS.sun || {};
  const sunMat = createProceduralPlanetShader(8, {
    ...sunCfg,
    ambient: sunCfg.ambient ? new THREE.Vector3(...sunCfg.ambient) : undefined,
    sunColor: sunCfg.sunColor ? new THREE.Vector3(...sunCfg.sunColor) : undefined,
    emissive: sunCfg.emissive ? new THREE.Color(sunCfg.emissive) : undefined,
  });
  allShaders.push(sunMat);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(8, 64, 64), sunMat);
  sun.name = 'sun';
  solarScene.add(sun);

  // Sun corona layers -- thinner now that the textured sun has its own
  // surface detail; the corona is a soft halo, not a glow that dominates.
  const c1 = createAtmosphereShader(new THREE.Color(0xffcc44), 0.7);
  allShaders.push(c1);
  solarScene.add(new THREE.Mesh(new THREE.SphereGeometry(9.5, 32, 32), c1));
  const c2 = createAtmosphereShader(new THREE.Color(0xff8833), 0.35);
  allShaders.push(c2);
  solarScene.add(new THREE.Mesh(new THREE.SphereGeometry(12, 32, 32), c2));

  const sunLight = new THREE.PointLight(0xffeedd, 4.0, 1000);
  solarScene.add(sunLight);

  // Planets
  PlanetDefs.forEach(p => {
    // Orbit ring
    const oGeo = new THREE.RingGeometry(p.dist - 0.15, p.dist + 0.15, 128);
    const oMat = new THREE.MeshBasicMaterial({ color: 0x5577aa, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const orbit = new THREE.Mesh(oGeo, oMat);
    orbit.rotation.x = -Math.PI / 2;
    solarScene.add(orbit);

    // Planet -- procedural shader generates the surface entirely from
    // 3D noise. No image, no UV mapping, no seams, no pole pinching;
    // the planet has continuous detail across the entire sphere.
    // Lookup per-planet config by name (lowercased); fall back to a
    // generic ramp if the planet isn't in PLANET_SHADER_CONFIGS.
    const cfg = PLANET_SHADER_CONFIGS[p.name.toLowerCase()] || {
      colorStops: [
        { stop: 0.0, color: p.color },
        { stop: 1.0, color: p.emissive ?? p.color },
      ],
    };
    const planetMat = createProceduralPlanetShader(p.radius, {
      ...cfg,
      ambient: cfg.ambient ? new THREE.Vector3(...cfg.ambient) : undefined,
      sunColor: cfg.sunColor ? new THREE.Vector3(...cfg.sunColor) : undefined,
      emissive: cfg.emissive ? new THREE.Color(cfg.emissive) : undefined,
      // Initial light dir; updated per frame from sun -> planet in
      // animateSolarSystem so the lit hemisphere tracks the sun.
      lightDir: new THREE.Vector3(1, 0, 0),
    });
    allShaders.push(planetMat);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius, 64, 64),
      planetMat,
    );
    mesh.userData = { planet: p };
    mesh.name = p.name;

    // Atmosphere -- thinner, less obscuring glow shell so the planet's
    // surface details stay readable. Was intensity 1.8 / radius x1.2.
    const aMat = createAtmosphereShader(new THREE.Color(p.atmosColor), 0.7);
    allShaders.push(aMat);
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(p.radius * 1.08, 24, 24), aMat));

    // Colony shield
    if (p.colonized) {
      const sMat = createShieldShader();
      allShaders.push(sMat);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(p.radius + 1.0, 32, 32), sMat);
      shield.name = 'colony-shield';
      mesh.add(shield);
    }

    // Position
    const angle = Math.random() * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * p.dist, 0, Math.sin(angle) * p.dist);
    mesh.userData.orbitAngle = angle;
    solarScene.add(mesh);
  });
}

// ============================================================
// PLANET SURFACE BUILD
// ============================================================
const HEX_SIZE = 5, HEX_GAP = 0.6;

// Multi-zone layout: smaller clusters separated by lava
const ZONES = [
  { id: 0, name: 'Core',          radius: 3, ox: 0,   oz: 0,   type: 'core',     tint: [0.10, 0.10, 0.12], planet: 'Ignisium' },
  { id: 1, name: 'North Ridge',   radius: 2, ox: -40, oz: -50, type: 'resource',  tint: [0.12, 0.09, 0.08], planet: 'Ignisium' },
  { id: 2, name: 'East Caldera',  radius: 2, ox: 50,  oz: -15, type: 'resource',  tint: [0.11, 0.09, 0.08], planet: 'Ignisium' },
  { id: 3, name: 'South Mesa',    radius: 2, ox: -10, oz: 55,  type: 'military',  tint: [0.09, 0.09, 0.12], planet: 'Ignisium' },
  { id: 4, name: 'West Plateau',  radius: 2, ox: -55, oz: 15,  type: 'civilian',  tint: [0.11, 0.11, 0.11], planet: 'Ignisium' },
];

// Planet-specific tint colors for terrain hexes
const PLANET_TINTS = {
  Ignisium: [0.10, 0.10, 0.12],
  Crystara: [0.08, 0.10, 0.16],
  Verdania: [0.08, 0.13, 0.08],
  Nethara:  [0.14, 0.10, 0.06],
  Glacius:  [0.10, 0.12, 0.16],
};

// Planet shader style IDs (match shader getPlanetColors)
const PLANET_STYLES = {
  Ignisium: 0, // Volcanic
  Crystara: 1, // Crystal Ice
  Verdania: 2, // Temperate
  Nethara:  3, // Gas Giant
  Glacius:  4, // Frozen
};

function hexToWorld(q, r) {
  const s = HEX_SIZE + HEX_GAP;
  return { x: s * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), z: s * (1.5 * r) };
}

function createHexShape(radius) {
  // 12-sided shape — softer than a hex, reads as a "plot" not a tile
  const sides = 12;
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 / sides) * i - Math.PI / 6;
    const x = radius * Math.cos(a), y = radius * Math.sin(a);
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function buildPlanetSurface() {
  // Stronger ambient so buildings aren't lost in darkness
  planetScene.add(new THREE.AmbientLight(0x334455, 1.0));
  // Main directional — warm key light
  const sunDir = new THREE.DirectionalLight(0xffcc88, 1.2);
  sunDir.position.set(50, 80, 30);
  planetScene.add(sunDir);
  // Lava underlight
  const lavaLight = new THREE.PointLight(0xff4400, 0.8, 100);
  lavaLight.position.y = -3;
  planetScene.add(lavaLight);
  // Cool rim light — SC2 style backlight for silhouette pop
  const rim = new THREE.DirectionalLight(0x6688cc, 0.6);
  rim.position.set(-30, 20, -50);
  planetScene.add(rim);
  // Fill from below to catch building undersides
  const fillLight = new THREE.DirectionalLight(0x553322, 0.3);
  fillLight.position.set(0, -10, 0);
  planetScene.add(fillLight);

  // Planet view stars
  const sg = new THREE.BufferGeometry();
  const N = 2000;
  const sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 800, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sp[i*3] = r*Math.sin(ph)*Math.cos(th); sp[i*3+1] = Math.abs(r*Math.cos(ph)); sp[i*3+2] = r*Math.sin(ph)*Math.sin(th);
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  planetScene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2 })));

  // Gas giant in sky
  const gg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 32), new THREE.MeshBasicMaterial({ color: 0xaa6633, transparent: true, opacity: 0.5 }));
  gg.position.set(200, 250, -300);
  planetScene.add(gg);
  const ggr = new THREE.Mesh(new THREE.RingGeometry(70, 90, 64), new THREE.MeshBasicMaterial({ color: 0xccaa88, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
  ggr.position.copy(gg.position); ggr.rotation.x = -Math.PI * 0.3; ggr.rotation.z = 0.2;
  planetScene.add(ggr);

  // Terrain
  const terrain = new THREE.Group();
  terrain.name = 'terrain';

  // Far ground fill — cheap dark basalt that fills the horizon (no shader cost)
  const farGroundGeo = new THREE.PlaneGeometry(2000, 2000, 1, 1);
  farGroundGeo.rotateX(-Math.PI / 2);
  const farGroundMat = new THREE.MeshStandardMaterial({
    color: 0x0e0e12,
    roughness: 0.95,
    metalness: 0.1,
    emissive: 0x1a0800,
    emissiveIntensity: 0.15,
  });
  const farGround = new THREE.Mesh(farGroundGeo, farGroundMat);
  farGround.position.y = -0.8;
  farGround.name = 'ignisium-far-ground';
  terrain.add(farGround);

  // Lava plane (detailed shader over playable area)
  const lavaGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
  lavaGeo.rotateX(-Math.PI / 2);
  lavaMesh = new THREE.Mesh(lavaGeo, lavaShader);
  lavaMesh.position.y = -0.5;
  lavaMesh.name = 'ignisium-lava';
  terrain.add(lavaMesh);

  // Build each zone as a separate group
  const hexShape = createHexShape(HEX_SIZE);
  ZONES.forEach(zone => {
    const zoneGroup = new THREE.Group();
    zoneGroup.name = `zone-${zone.id}`;
    zoneGroup.visible = false; // hidden until player zooms in

    for (let q = -zone.radius; q <= zone.radius; q++) {
      for (let r = -zone.radius; r <= zone.radius; r++) {
        if (Math.abs(q + r) > zone.radius) continue;
        const { x, z } = hexToWorld(q, r);
        const wx = x + zone.ox, wz = z + zone.oz;
        const hv = Math.random() * 0.3;
        const geo = new THREE.ExtrudeGeometry(hexShape, { depth: 2.0 + hv, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.4, bevelSegments: 3 });
        geo.rotateX(-Math.PI / 2);
        const mat = basaltMat.clone();
        const tint = zone.tint;
        const vary = Math.random() * 0.06;
        mat.color.setRGB(tint[0] + vary, tint[1] + vary, tint[2] + vary);
        const hex = new THREE.Mesh(geo, mat);
        hex.position.set(wx, -1, wz);
        hex.userData = { gridQ: q, gridR: r, zoneId: zone.id, isHex: true };
        zoneGroup.add(hex);
      }
    }

    // Border rocks per zone
    for (let q = -zone.radius - 1; q <= zone.radius + 1; q++) {
      for (let r = -zone.radius - 1; r <= zone.radius + 1; r++) {
        const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        if (d < zone.radius + 1 || d > zone.radius + 1) continue;
        const { x, z } = hexToWorld(q, r);
        const wx = x + zone.ox, wz = z + zone.oz;
        const h = 2 + Math.random() * 3;
        const rg = new THREE.CylinderGeometry(1 + Math.random() * 1.5, 2 + Math.random() * 1.5, h, 5 + Math.floor(Math.random() * 3));
        const rm = basaltMat.clone();
        const s = 0.06 + Math.random() * 0.05;
        rm.color.setRGB(s, s, s);
        const rock = new THREE.Mesh(rg, rm);
        rock.position.set(wx + (Math.random()-0.5)*2, h/2-1, wz + (Math.random()-0.5)*2);
        rock.rotation.y = Math.random() * Math.PI;
        zoneGroup.add(rock);
      }
    }

    terrain.add(zoneGroup);
    zoneGroups[zone.id] = zoneGroup;

    // Zone marker sprite (visible in planet_overview)
    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = 256; markerCanvas.height = 96;
    const ctx = markerCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,15,30,0.8)';
    ctx.roundRect(0, 0, 256, 96, 8);
    ctx.fill();
    ctx.strokeStyle = zone.type === 'core' ? '#00d4ff' : zone.type === 'resource' ? '#ff8c00' : zone.type === 'military' ? '#ff3344' : '#44ff88';
    ctx.lineWidth = 2;
    ctx.roundRect(0, 0, 256, 96, 8);
    ctx.stroke();
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(zone.name, 128, 32);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(zone.type.toUpperCase(), 128, 54);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText(`Radius ${zone.radius} · Click to enter`, 128, 78);

    const markerTex = new THREE.CanvasTexture(markerCanvas);
    const markerMat = new THREE.SpriteMaterial({ map: markerTex, transparent: true, depthTest: false });
    const marker = new THREE.Sprite(markerMat);
    marker.position.set(zone.ox, 20, zone.oz);
    marker.scale.set(30, 11, 1);
    marker.userData = { isZoneMarker: true, zoneId: zone.id };
    marker.visible = false; // shown in planet_overview
    planetScene.add(marker);
    zoneMarkers[zone.id] = marker;
  });

  planetScene.add(terrain);
  placeBuilding('command_center', 0, 0, true, 0);
}

// ============================================================
// COLONIZATION — Generate colony zone on a new planet
// ============================================================
function colonizePlanet(planetDef) {
  const newZoneId = ZONES.length;
  const tint = PLANET_TINTS[planetDef.name] || [0.10, 0.10, 0.12];
  const zone = {
    id: newZoneId,
    name: `${planetDef.name} Colony`,
    radius: 2,
    ox: 0,
    oz: 0,
    type: 'core',
    tint,
    planet: planetDef.name,
  };
  ZONES.push(zone);

  // Build hex geometry for the colony zone
  const terrain = planetScene.getObjectByName('terrain');
  const hexShape = createHexShape(HEX_SIZE);
  const zoneGroup = new THREE.Group();
  zoneGroup.name = `zone-${zone.id}`;
  zoneGroup.visible = false;

  for (let q = -zone.radius; q <= zone.radius; q++) {
    for (let r = -zone.radius; r <= zone.radius; r++) {
      if (Math.abs(q + r) > zone.radius) continue;
      const { x, z } = hexToWorld(q, r);
      const wx = x + zone.ox, wz = z + zone.oz;
      const hv = Math.random() * 0.3;
      const geo = new THREE.ExtrudeGeometry(hexShape, { depth: 2.0 + hv, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.4, bevelSegments: 3 });
      geo.rotateX(-Math.PI / 2);
      const mat = basaltMat.clone();
      const vary = Math.random() * 0.06;
      mat.color.setRGB(tint[0] + vary, tint[1] + vary, tint[2] + vary);
      const hex = new THREE.Mesh(geo, mat);
      hex.position.set(wx, -1, wz);
      hex.userData = { gridQ: q, gridR: r, zoneId: zone.id, isHex: true };
      zoneGroup.add(hex);
    }
  }

  // Border rocks
  for (let q = -zone.radius - 1; q <= zone.radius + 1; q++) {
    for (let r = -zone.radius - 1; r <= zone.radius + 1; r++) {
      const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (d < zone.radius + 1 || d > zone.radius + 1) continue;
      const { x, z } = hexToWorld(q, r);
      const wx = x + zone.ox, wz = z + zone.oz;
      const h = 2 + Math.random() * 3;
      const rg = new THREE.CylinderGeometry(1 + Math.random() * 1.5, 2 + Math.random() * 1.5, h, 5 + Math.floor(Math.random() * 3));
      const rm = basaltMat.clone();
      const s = 0.06 + Math.random() * 0.05;
      rm.color.setRGB(s, s, s);
      const rock = new THREE.Mesh(rg, rm);
      rock.position.set(wx + (Math.random()-0.5)*2, h/2-1, wz + (Math.random()-0.5)*2);
      rock.rotation.y = Math.random() * Math.PI;
      zoneGroup.add(rock);
    }
  }

  // Colony ground plane with planet-specific shader
  const colonyStyle = PLANET_STYLES[planetDef.name] ?? 0;
  const colonyLavaShader = createLavaShader(colonyStyle);
  allShaders.push(colonyLavaShader);
  const colonyLavaGeo = new THREE.PlaneGeometry(80, 80, 1, 1);
  colonyLavaGeo.rotateX(-Math.PI / 2);
  const colonyLavaMesh = new THREE.Mesh(colonyLavaGeo, colonyLavaShader);
  colonyLavaMesh.position.y = -0.5;
  zoneGroup.add(colonyLavaMesh);

  // Colony far ground fill
  const colonyFarGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
  colonyFarGeo.rotateX(-Math.PI / 2);
  const farTint = tint;
  const colonyFarMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(farTint[0] * 0.6, farTint[1] * 0.6, farTint[2] * 0.6),
    roughness: 0.95,
    metalness: 0.1,
    emissive: new THREE.Color(farTint[0] * 0.3, farTint[1] * 0.3, farTint[2] * 0.3),
    emissiveIntensity: 0.2,
  });
  const colonyFar = new THREE.Mesh(colonyFarGeo, colonyFarMat);
  colonyFar.position.y = -0.8;
  zoneGroup.add(colonyFar);

  if (terrain) terrain.add(zoneGroup);
  zoneGroups[zone.id] = zoneGroup;

  // Zone marker
  const markerCanvas = document.createElement('canvas');
  markerCanvas.width = 256; markerCanvas.height = 96;
  const ctx = markerCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,15,30,0.8)';
  ctx.roundRect(0, 0, 256, 96, 8);
  ctx.fill();
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 2;
  ctx.roundRect(0, 0, 256, 96, 8);
  ctx.stroke();
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(zone.name, 128, 32);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#00d4ff';
  ctx.fillText('COLONY', 128, 54);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText(`Radius ${zone.radius} · Click to enter`, 128, 78);

  const markerTex = new THREE.CanvasTexture(markerCanvas);
  const markerMat = new THREE.SpriteMaterial({ map: markerTex, transparent: true, depthTest: false });
  const marker = new THREE.Sprite(markerMat);
  marker.position.set(zone.ox, 20, zone.oz);
  marker.scale.set(30, 11, 1);
  marker.userData = { isZoneMarker: true, zoneId: zone.id };
  marker.visible = false;
  planetScene.add(marker);
  zoneMarkers[zone.id] = marker;

  // Place free command center
  placeBuilding('command_center', 0, 0, true, zone.id);
}

// ============================================================
// BUILDING GENERATORS
// ============================================================
function createCommandCenter() {
  const g = new THREE.Group();
  // Brighter metals with visible contrast
  const mBase = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.4, metalness: 0.7, flatShading: true });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x3a4050, roughness: 0.5, metalness: 0.6, flatShading: true });
  const mAccent = new THREE.MeshStandardMaterial({ color: 0x667888, roughness: 0.3, metalness: 0.8, flatShading: true });
  // Team-color accent (SC2 style — strong cyan markers)
  const teamGlow = new THREE.MeshStandardMaterial({ color: 0x00eeff, emissive: 0x00ccdd, emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.5 });

  // Wide base platform — fills the plot
  g.add(meshAt(new THREE.CylinderGeometry(4.5, 5, 1.5, 8), mBase, 0, 0.75, 0));

  // Main structure — chunky, reads from distance
  g.add(meshAt(new THREE.BoxGeometry(6, 4, 6), mDark, 0, 3.5, 0));

  // Upper command deck
  g.add(meshAt(new THREE.BoxGeometry(4, 1.5, 4), mAccent, 0, 6.25, 0));

  // Dome top
  g.add(meshAt(new THREE.SphereGeometry(2.2, 16, 12, 0, Math.PI*2, 0, Math.PI/2), mBase, 0, 7, 0));

  // Central energy core — large, bright, the visual anchor
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), teamGlow);
  core.position.y = 7.5; core.name = 'energy-core'; g.add(core);

  // Corner pylons with team-color lights
  [-1, 1].forEach(sx => {
    [-1, 1].forEach(sz => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 6, 6), mBase);
      pylon.position.set(sx * 3.2, 3, sz * 3.2); g.add(pylon);
      // Team color light on top of each pylon
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), teamGlow);
      light.position.set(sx * 3.2, 6.2, sz * 3.2); g.add(light);
    });
  });

  // Window strips — amber, warm glow
  [0,1,2,3].forEach(i => {
    const a = (i/4)*Math.PI*2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.15), windowMat);
    w.position.set(Math.cos(a)*3.05, 3.5, Math.sin(a)*3.05); w.lookAt(0, 3.5, 0); g.add(w);
    // Second row
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.15), windowMat);
    w2.position.set(Math.cos(a)*3.05, 4.5, Math.sin(a)*3.05); w2.lookAt(0, 4.5, 0); g.add(w2);
  });

  // Antenna
  g.add(meshAt(new THREE.CylinderGeometry(0.08, 0.08, 3, 4), mAccent, 0, 9, 0));
  const antennaLight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), teamGlow);
  antennaLight.position.y = 10.5; antennaLight.name = 'antenna-light'; g.add(antennaLight);

  return g;
}

function createThermalExtractor() {
  const g = new THREE.Group(), m = metalMat(0x444450);
  g.add(meshAt(new THREE.CylinderGeometry(2, 2.5, 2, 8), m, 0, 1, 0));
  g.add(meshAt(new THREE.CylinderGeometry(0.6, 0.6, 4, 6), metalMat(0x555565), 0, 3, 0));
  g.add(meshAt(new THREE.CylinderGeometry(1.2, 0.8, 1, 8), m, 0, 5.2, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.15, 8, 16), orangeGlow);
  ring.position.y = 2.2; ring.rotation.x = Math.PI/2; ring.name = 'energy-ring'; g.add(ring);
  [-1,1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,3,6), m); p.position.set(s*1.8,2.5,0); p.rotation.z = s*0.2; g.add(p); });
  return g;
}

function createMineralDrill() {
  const g = new THREE.Group(), m = metalMat(0x3d3d4d);
  g.add(meshAt(new THREE.BoxGeometry(4, 1, 4), m, 0, 0.5, 0));
  g.add(meshAt(new THREE.BoxGeometry(1, 4, 1), metalMat(0x4a4a5a), 0, 2.5, 0));
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4, 6), m);
  arm.position.set(1.5, 3.5, 0); arm.rotation.z = -0.6; arm.name = 'drill-arm'; g.add(arm);
  const bit = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.9, roughness: 0.2 }));
  bit.position.set(2.8, 1.8, 0); bit.rotation.z = -0.6 - Math.PI; bit.name = 'drill-bit'; g.add(bit);
  [-1,1].forEach(s => { g.add(meshAt(new THREE.BoxGeometry(1, 1.5, 1.5), metalMat(0x333340), -1.5, 1, s*1.5)); });
  const ind = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), cyanGlow); ind.position.set(0, 4.7, 0); g.add(ind);
  return g;
}

function createHabitatPod() {
  const g = new THREE.Group(), m = metalMat(0x404050);
  g.add(meshAt(new THREE.SphereGeometry(2.5, 16, 12, 0, Math.PI*2, 0, Math.PI/2), m, 0, 0.5, 0));
  const br = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.3, 8, 16), metalMat(0x555565));
  br.position.y = 0.5; br.rotation.x = Math.PI/2; g.add(br);
  const wm = new THREE.MeshStandardMaterial({ color: 0x00aacc, emissive: 0x006688, emissiveIntensity: 0.4, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), wm);
    w.position.set(Math.cos(a)*2.35, 1.5, Math.sin(a)*2.35); w.lookAt(0, 1.5, 0); g.add(w);
  }
  g.add(meshAt(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 4), m, 0, 3.2, 0));
  const al = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), cyanGlow); al.position.y = 4; al.name = 'antenna-light'; g.add(al);
  return g;
}

function createResearchLab() {
  const g = new THREE.Group(), m = metalMat(0x354555);
  g.add(meshAt(new THREE.BoxGeometry(5, 2, 5), m, 0, 1, 0));
  // Satellite dish
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI*2, 0, Math.PI/3), metalMat(0x556677));
  dish.position.set(0, 3.5, 0); dish.rotation.x = -0.3; g.add(dish);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 4), m);
  antenna.position.y = 2.5; g.add(antenna);
  // Holographic display (emissive)
  const holo = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.05), new THREE.MeshStandardMaterial({ color: 0x00cc66, emissive: 0x00aa55, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 }));
  holo.position.set(1.5, 2, 2.55); holo.name = 'holo-display'; g.add(holo);
  return g;
}

function createWarehouse() {
  const g = new THREE.Group(), m = metalMat(0x3a3a35);
  g.add(meshAt(new THREE.BoxGeometry(5, 3, 4), m, 0, 1.5, 0));
  // Loading door
  g.add(meshAt(new THREE.BoxGeometry(2, 2.5, 0.1), metalMat(0x555550), 0, 1.3, 2.05));
  // Status light
  const sl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), orangeGlow); sl.position.set(1.5, 3.2, 0); g.add(sl);
  return g;
}

function createBarracks() {
  const g = new THREE.Group(), m = metalMat(0x3a3535);
  g.add(meshAt(new THREE.BoxGeometry(5, 2.5, 5), m, 0, 1.25, 0));
  // Guard towers
  [-1,1].forEach(s => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 4, 6), metalMat(0x444440));
    t.position.set(s * 2.8, 2, s * 2.8); g.add(t);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0xaa0000, emissiveIntensity: 0.5 }));
    l.position.set(s * 2.8, 4.2, s * 2.8); g.add(l);
  });
  return g;
}

function createDefenseTurret() {
  const g = new THREE.Group(), m = metalMat(0x3a3a3a);
  g.add(meshAt(new THREE.CylinderGeometry(1.5, 2, 2, 8), m, 0, 1, 0));
  // Barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 3, 6), metalMat(0x555555));
  barrel.position.set(0, 2.5, 1); barrel.rotation.x = Math.PI/6; barrel.name = 'turret-barrel'; g.add(barrel);
  // Targeting light
  const tl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0xaa0000, emissiveIntensity: 0.6 }));
  tl.position.set(0, 3, 0); tl.name = 'turret-light'; g.add(tl);
  return g;
}

function createShipyard() {
  const g = new THREE.Group(), m = metalMat(0x353545);
  // Large hangar
  g.add(meshAt(new THREE.BoxGeometry(8, 3, 6), m, 0, 1.5, 0));
  // Landing pad
  g.add(meshAt(new THREE.CylinderGeometry(3, 3, 0.3, 8), metalMat(0x444455), 5, 0.15, 0));
  // Pad lights
  for (let i = 0; i < 4; i++) {
    const a = (i/4)*Math.PI*2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), cyanGlow);
    l.position.set(5 + Math.cos(a)*2.8, 0.4, Math.sin(a)*2.8); g.add(l);
  }
  // Crane arm
  g.add(meshAt(new THREE.BoxGeometry(0.3, 5, 0.3), m, -3, 4, 0));
  g.add(meshAt(new THREE.BoxGeometry(6, 0.3, 0.3), m, 0, 6.5, 0));
  return g;
}

function createTradeDepot() {
  const g = new THREE.Group(), m = metalMat(0x3a4a3a);
  g.add(meshAt(new THREE.BoxGeometry(5, 2, 5), m, 0, 1, 0));
  // Teleport pad
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x00cc66, emissive: 0x00aa55, emissiveIntensity: 0.4 }));
  pad.position.set(0, 2.1, 0); pad.name = 'trade-pad'; g.add(pad);
  return g;
}

function createShieldGen() {
  const g = new THREE.Group(), m = metalMat(0x354555);
  g.add(meshAt(new THREE.CylinderGeometry(2, 2.5, 2, 8), m, 0, 1, 0));
  // Shield emitter
  const emit = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), cyanGlow);
  emit.position.y = 3; emit.name = 'shield-emitter'; g.add(emit);
  // Support struts
  [0,1,2].forEach(i => {
    const a = (i/3)*Math.PI*2;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.5, 4), m);
    s.position.set(Math.cos(a)*1.5, 2, Math.sin(a)*1.5); g.add(s);
  });
  return g;
}

const buildingGenerators = {
  command_center: createCommandCenter,
  thermal_extractor: createThermalExtractor,
  mineral_drill: createMineralDrill,
  habitat_pod: createHabitatPod,
  research_lab: createResearchLab,
  warehouse: createWarehouse,
  barracks: createBarracks,
  defense_turret: createDefenseTurret,
  shipyard: createShipyard,
  trade_depot: createTradeDepot,
  shield_gen: createShieldGen,
};

// ============================================================
// GLB-BACKED BUILDING MESHES
// ------------------------------------------------------------
// Generated GLBs from the asset-pipeline/ (Hunyuan3D-2) go in
// public/assets/models/buildings/<type>.glb. If a file exists, it
// replaces the primitive-based generator for that building type.
// Missing GLBs silently fall back to the primitive generator, so the
// game always works — even before any GLBs have been generated.
// ============================================================
const BUILDING_GLBS = {
  command_center:    '/assets/models/buildings/command_center.glb',
  thermal_extractor: '/assets/models/buildings/thermal_extractor.glb',
  mineral_drill:     '/assets/models/buildings/mineral_drill.glb',
  habitat_pod:       '/assets/models/buildings/habitat_pod.glb',
  research_lab:      '/assets/models/buildings/research_lab.glb',
  warehouse:         '/assets/models/buildings/warehouse.glb',
  barracks:          '/assets/models/buildings/barracks.glb',
  defense_turret:    '/assets/models/buildings/defense_turret.glb',
  shipyard:          '/assets/models/buildings/shipyard.glb',
  trade_depot:       '/assets/models/buildings/trade_depot.glb',
  shield_gen:        '/assets/models/buildings/shield_gen.glb',
};

// ============================================================
// PROCEDURAL PLANET SHADER CONFIGS
// Per-planet noise params + color ramps + extras (bands/clouds/glow).
// Keys must match PlanetDefs.name (lowercased).
// ============================================================
const PLANET_SHADER_CONFIGS = {
  // Palettes extracted from the MJ concept art via extract_palette.py.
  // To re-tune: regenerate the MJ marble in input/, run
  // `runtime/.../python.exe extract_palette.py 6`, paste the new
  // colorStops back here.
  ignisium: {
    baseScale: 2.5,
    octaves: 5,
    roughness: 0.55,
    colorStops: [
      { stop: 0.00, color: 0x161928 },
      { stop: 0.20, color: 0x1b2536 },
      { stop: 0.40, color: 0x252738 },
      { stop: 0.60, color: 0x283448 },
      { stop: 0.80, color: 0xb6c9db },
      { stop: 1.00, color: 0xc7d7e5 },
    ],
    // Ridged noise overlay -> bright cracks across the surface (lava
    // rivers if you re-prompt to a more volcanic MJ marble; glowing
    // electric cracks on the cool-blue palette this image gave us).
    ridgeStrength: 0.6,
    ridgeScale: 4.0,
    ridgeColor: 0xff7030,
    emissive: 0xff5520,
    emissiveIntensity: 0.35,
    // Soft warm rim glow.
    fresnelStrength: 0.6,
    fresnelPower: 2.5,
    fresnelColor: 0xff7040,
    ambient: [0.25, 0.28, 0.35],
    timeScale: 0.05,
  },
  crystara: {
    baseScale: 3.2,
    octaves: 5,
    roughness: 0.6,
    colorStops: [
      { stop: 0.00, color: 0x253a58 },
      { stop: 0.20, color: 0x274567 },
      { stop: 0.40, color: 0x4b5569 },
      { stop: 0.60, color: 0xd7d7d9 },
      { stop: 0.80, color: 0xe8e7e9 },
      { stop: 1.00, color: 0xf9f9fb },
    ],
    // Voronoi cell BORDERS -> the actual crystalline lattice look.
    cellStrength: 0.55,
    cellScale: 8.0,
    cellMode: 'borders',
    cellColor: 0xc8e8ff,
    // Sharp specular -- ice surfaces reflect.
    specularStrength: 0.7,
    specularPower: 48.0,
    // Cool blue atmosphere rim.
    fresnelStrength: 0.5,
    fresnelPower: 3.0,
    fresnelColor: 0x88c0ff,
    ambient: [0.40, 0.46, 0.55],
  },
  verdania: {
    baseScale: 2.0,
    octaves: 6,
    roughness: 0.55,
    colorStops: [
      { stop: 0.00, color: 0x1b2626 },
      { stop: 0.20, color: 0x263529 },
      { stop: 0.40, color: 0x283636 },
      { stop: 0.60, color: 0x273747 },
      { stop: 0.80, color: 0x364637 },
      { stop: 1.00, color: 0x284965 },
    ],
    cloudOpacity: 0.40,
    cloudScale: 4.5,
    cloudDrift: 0.04,
    // Specular only on the lower (water) end of the surface noise --
    // gives oceans a shine, leaves continents matte.
    specularStrength: 0.6,
    specularPower: 64.0,
    specularThreshold: 0.45,
    // Soft blue-ish atmosphere.
    fresnelStrength: 0.55,
    fresnelPower: 3.5,
    fresnelColor: 0x80b8ff,
    timeScale: 0.05,
  },
  nethara: {
    baseScale: 1.5,
    octaves: 4,
    roughness: 0.55,
    bandIntensity: 0.85,
    bandFrequency: 4.0,
    bandTurbulence: 0.9,
    // HEAVY domain warp -- bands get swirled into storm-like turbulence.
    warpStrength: 0.8,
    warpScale: 1.2,
    colorStops: [
      { stop: 0.00, color: 0x281939 },
      { stop: 0.20, color: 0x361a38 },
      { stop: 0.40, color: 0x282447 },
      { stop: 0.60, color: 0x572746 },
      { stop: 0.80, color: 0x274468 },
      { stop: 1.00, color: 0xfbfbfb },
    ],
    // Soft purple rim.
    fresnelStrength: 0.5,
    fresnelPower: 3.0,
    fresnelColor: 0xc080d0,
    timeScale: 0.05,  // slow but visible band drift
  },
  glacius: {
    baseScale: 2.8,
    octaves: 5,
    roughness: 0.6,
    colorStops: [
      { stop: 0.00, color: 0x152838 },
      { stop: 0.45, color: 0x4a7090 },
      { stop: 0.70, color: 0xa8c8d8 },
      { stop: 0.95, color: 0xf0f8ff },
    ],
    // Subtle ice cells -- frozen patches.
    cellStrength: 0.3,
    cellScale: 6.0,
    cellMode: 'cells',
    cellColor: 0xe8f8ff,
    specularStrength: 0.4,
    specularPower: 48.0,
    fresnelStrength: 0.4,
    fresnelPower: 3.0,
    fresnelColor: 0xa0d0ff,
    ambient: [0.4, 0.48, 0.55],
  },
  sun: {
    baseScale: 4.0,
    octaves: 4,
    roughness: 0.5,
    colorStops: [
      { stop: 0.00, color: 0xd38a38 },
      { stop: 0.30, color: 0xd9943a },
      { stop: 0.65, color: 0xe7a747 },
      { stop: 1.00, color: 0xf8c865 },
    ],
    // Animated domain warp -- roiling plasma motion.
    warpStrength: 0.5,
    warpScale: 1.5,
    // Ridged overlay -- bright plasma flares.
    ridgeStrength: 0.4,
    ridgeScale: 6.0,
    ridgeColor: 0xffffe0,
    unlit: true,
    timeScale: 0.5,    // sun churns visibly
    brightness: 1.5,
  },
};

// type -> prepared THREE.Group template, cloned for each placement
const buildingGlbTemplates = new Map();
const gltfLoader = new GLTFLoader();
// Building GLBs are Draco-compressed by asset-pipeline/compress.py. The
// decoder wasm/js lives in /public/draco/ (copied from three/examples).
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

// Normalize an imported GLB root so it sits on the hex-grid footprint the
// primitive generators use (roughly a 4-unit-wide square centered on origin,
// pivot at y=0). Hunyuan3D output tends to be arbitrarily scaled.
function normalizeBuildingGlb(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 4; // tune to match primitive footprint
  const scale = targetSize / maxDim;
  root.scale.setScalar(scale);
  // Recompute box post-scale to park the mesh on the ground.
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
  // Center XZ so rotation/level-up scaling pivots around the footprint.
  const center = new THREE.Vector3();
  box2.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  // Apply the stylized building shader to each mesh. If the mesh has a
  // texture map (from Hunyuan3D PBR baking), feed it as the albedo. If
  // not, the shader falls back to a neutral grey.
  root.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      const albedoMap = c.material?.map || null;
      if (albedoMap) {
        const shader = createTexturedBuildingShader(albedoMap);
        buildingShaders.push(shader);
        c.material = shader;
      }
    }
  });
  return root;
}

// Fire all GLB loads in parallel at module init. Any that 404 or fail are
// just dropped — the primitive fallback handles it. We do a HEAD probe first
// because Vite's dev server falls back to serving index.html (HTTP 200,
// content-type text/html) for missing static files, which would otherwise be
// fed into GLTFLoader and produce noisy parse errors in the console.
function preloadBuildingGlbs() {
  return Promise.all(Object.entries(BUILDING_GLBS).map(async ([type, url]) => {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) return;
      const ct = head.headers.get('content-type') || '';
      if (ct.includes('text/html')) return; // SPA fallback, file isn't actually there
      const gltf = await gltfLoader.loadAsync(url);
      const template = normalizeBuildingGlb(gltf.scene);
      buildingGlbTemplates.set(type, template);
      console.log(`[ignisium] loaded GLB for ${type}`);
      // Swap any already-placed primitive meshes for this building type.
      if (typeof GS !== 'undefined' && GS.buildings) {
        for (const b of GS.buildings) {
          if (b.type !== type || b.mesh?.userData?.isGlb) continue;
          const newMesh = template.clone(true);
          newMesh.position.copy(b.mesh.position);
          newMesh.rotation.copy(b.mesh.rotation);
          newMesh.scale.setScalar(1 + (b.level - 1) * 0.08);
          newMesh.userData = { ...b.mesh.userData, isGlb: true };
          newMesh.visible = b.mesh.visible;
          planetScene.remove(b.mesh);
          planetScene.add(newMesh);
          b.mesh = newMesh;
        }
      }
    } catch (err) {
      // Expected for any building that doesn't have a GLB yet.
      // Only log at debug level; primitive fallback handles gameplay.
      // console.debug(`[ignisium] no GLB for ${type}`, err);
    }
  }));
}

// Kick off GLB loading immediately. Game boot does not block on this;
// preloadBuildingGlbs() swaps meshes in-place once each load finishes.
preloadBuildingGlbs();

// ============================================================
// BUILDING PLACEMENT
// ============================================================
function showZoneHexes(zoneId) {
  // Hide all zones, show target
  zoneGroups.forEach((g, i) => { if (g) g.visible = (i === zoneId); });
  // Toggle building meshes
  GS.buildings.forEach(b => { if (b.mesh) b.mesh.visible = (b.zoneId === zoneId); });
  // Hide markers
  zoneMarkers.forEach(m => { if (m) m.visible = false; });
  // Toggle Ignisium-specific terrain (hide when viewing colony zones)
  const zone = ZONES[zoneId];
  const isIgnisium = zone && zone.planet === 'Ignisium';
  const terrain = planetScene.getObjectByName('terrain');
  if (terrain) {
    const igLava = terrain.getObjectByName('ignisium-lava');
    const igFar = terrain.getObjectByName('ignisium-far-ground');
    if (igLava) igLava.visible = isIgnisium;
    if (igFar) igFar.visible = isIgnisium;
  }
}

function showPlanetOverview() {
  // Hide all zone hexes, show only markers for current planet
  zoneGroups.forEach(g => { if (g) g.visible = false; });
  GS.buildings.forEach(b => { if (b.mesh) b.mesh.visible = false; });
  zoneMarkers.forEach((m, i) => {
    if (m) {
      const zone = ZONES[i];
      m.visible = zone && zone.planet === GS.activePlanet;
    }
  });
  // Show Ignisium terrain only when viewing Ignisium
  const terrain = planetScene.getObjectByName('terrain');
  if (terrain) {
    const isIgnisium = GS.activePlanet === 'Ignisium';
    const igLava = terrain.getObjectByName('ignisium-lava');
    const igFar = terrain.getObjectByName('ignisium-far-ground');
    if (igLava) igLava.visible = isIgnisium;
    if (igFar) igFar.visible = isIgnisium;
  }
}

function hexWorldPos(q, r, zoneId = 0) {
  const zone = ZONES[zoneId] || ZONES[0];
  const { x, z } = hexToWorld(q, r);
  return { x: x + zone.ox, z: z + zone.oz };
}

function gridKey(q, r, zoneId = 0) { return `${zoneId}:${q},${r}`; }

function placeBuilding(type, q, r, free = false, zoneId = 0) {
  const def = BuildingDefs[type];
  if (!def) return false;
  const key = gridKey(q, r, zoneId);
  if (GS.grid.has(key)) return false;
  if (!free) {
    if (GS.resources.energy < def.cost.energy || GS.resources.minerals < def.cost.minerals) return false;
    GS.resources.energy -= def.cost.energy;
    GS.resources.minerals -= def.cost.minerals;
  }

  const gen = buildingGenerators[type];
  if (!gen) return false;
  // Prefer a loaded GLB template if one is available; fall back to the
  // primitive generator otherwise. Either returns a THREE.Group.
  const glbTemplate = buildingGlbTemplates.get(type);
  const mesh = glbTemplate ? glbTemplate.clone(true) : gen();
  const { x, z } = hexWorldPos(q, r, zoneId);
  mesh.position.set(x, 0.5, z);
  mesh.userData = { type, q, r, zoneId, level: 1, def, isGlb: !!glbTemplate };
  planetScene.add(mesh);

  const building = { type, q, r, zoneId, level: 1, mesh, def };
  GS.buildings.push(building);
  GS.grid.set(key, building);
  recalcMaxPop();
  recalcDefense();

  // Energy pipe to command center
  const ccKey = gridKey(0, 0, 0);
  if (type !== 'command_center' && GS.grid.has(ccKey)) {
    safe(() => {
      const cc = hexWorldPos(0, 0, 0), bp = hexWorldPos(q, r, zoneId);
      const dir = new THREE.Vector3(cc.x - bp.x, 0, cc.z - bp.z);
      const len = dir.length(); dir.normalize();
      const color = def.category === 'resource' ? new THREE.Color(0xff6600) : new THREE.Color(0x00ccff);
      const pipeMat = createEnergyFlowShader(color);
      allShaders.push(pipeMat);
      const pipe = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.6), pipeMat);
      pipe.position.set((bp.x + cc.x)/2, 0.3, (bp.z + cc.z)/2);
      pipe.rotation.x = -Math.PI/2;
      pipe.rotation.z = -Math.atan2(dir.z, dir.x);
      planetScene.add(pipe);
    }, 'energyPipe');
  }

  // Tutorial progression
  if (!GS.tutorialDone && GS.buildings.length === 2) advanceTutorial();

  return true;
}

function recalcMaxPop() {
  GS.maxPopulation = 10;
  GS.buildings.forEach(b => { GS.maxPopulation += (b.def.maxPopBonus || 0) * b.level; });
}

function recalcDefense() {
  GS.defenseRating = 0;
  GS.shieldActive = false;
  GS.buildings.forEach(b => {
    if (b.def.effect === 'turret') GS.defenseRating += 10 * b.level;
    if (b.def.effect === 'defense') GS.defenseRating += 5 * b.level;
    if (b.def.effect === 'shield') { GS.shieldActive = true; GS.defenseRating += 20 * b.level; }
  });
}

function getProductionRates() {
  const rates = { energy: 0, minerals: 0 };
  const extractionBonus = GS.researchedTechs.has('advanced_extraction') ? 1.5 : 1.0;
  GS.buildings.forEach(b => {
    if (b.def.production.energy) rates.energy += b.def.production.energy * b.level * (b.type.includes('extractor') ? extractionBonus : 1);
    if (b.def.production.minerals) rates.minerals += b.def.production.minerals * b.level * (b.type.includes('drill') ? extractionBonus : 1);
  });
  // Trade route bonus
  GS.tradeRoutes.forEach(() => { rates.energy += 0.5; rates.minerals += 0.5; });
  return rates;
}

function getStorageCap() {
  let bonus = 0;
  GS.buildings.forEach(b => { if (b.def.effect === 'storageBonus') bonus += 100 * b.level; });
  return { energy: 200 + bonus, minerals: 200 + bonus };
}

function getResearchSpeed() {
  let mult = 1.0;
  GS.buildings.forEach(b => { if (b.def.effect === 'researchSpeed') mult += 0.3 * b.level; });
  return mult;
}

// ============================================================
// CAMERA TRANSITIONS
// ============================================================
let transProgress = 0, transFrom = new THREE.Vector3(), transTo = new THREE.Vector3();
let transTargFrom = new THREE.Vector3(), transTargTo = new THREE.Vector3(), transCallback = null;

function transitionToView(target, zoneId) {
  if (GS.view === 'transitioning') return;
  GS.view = 'transitioning';
  transProgress = 0;
  transFrom.copy(camera.position);
  transTargFrom.copy(controls.target);

  // For colony planets with only one zone, skip overview and go to zone
  if (target === 'planet_overview') {
    const planetZones = ZONES.filter(z => z.planet === GS.activePlanet);
    if (planetZones.length === 1) {
      target = 'zone';
      zoneId = planetZones[0].id;
    }
  }

  if (target === 'planet_overview') {
    // Prepare planet scene BEFORE transition so it's ready at the midpoint switch
    showPlanetOverview();
    transTo.set(0, 120, 50);
    transTargTo.set(0, 0, 0);
    transCallback = () => {
      GS.view = 'planet_overview';
      GS.activeZone = null;
      renderPass.scene = planetScene;
      controls.minDistance = 60; controls.maxDistance = 200; controls.maxPolarAngle = Math.PI * 0.38;
      heatPass.enabled = true;
      bloomPass.strength = 0.3;
      renderer.toneMappingExposure = 0.9;
      showOverviewUI();
    };
  } else if (target === 'zone') {
    const zone = ZONES[zoneId] || ZONES[0];
    GS.activeZone = zoneId;
    // Prepare zone visibility BEFORE transition
    showZoneHexes(zoneId);
    transTo.set(zone.ox, 60, zone.oz + 60);
    transTargTo.set(zone.ox, 0, zone.oz);
    transCallback = () => {
      GS.view = 'zone';
      renderPass.scene = planetScene;
      controls.minDistance = 15; controls.maxDistance = 150; controls.maxPolarAngle = Math.PI * 0.42;
      controls.target.set(zone.ox, 0, zone.oz);
      heatPass.enabled = true;
      bloomPass.strength = 0.3;
      renderer.toneMappingExposure = 0.9;
      showZoneUI();
    };
  } else { // solar
    // Try to return camera near the planet we just left
    const planetMesh = GS.activePlanet ? solarScene.getObjectByName(GS.activePlanet) : null;
    if (planetMesh) {
      const pp = planetMesh.position;
      const offset = new THREE.Vector3(pp.x, 40, pp.z + 50).normalize().multiplyScalar(60);
      transTo.set(pp.x + offset.x, 50, pp.z + offset.z);
      transTargTo.set(pp.x, 0, pp.z);
    } else {
      transTo.set(0, 100, 150);
      transTargTo.set(0, 0, 0);
    }
    transCallback = () => {
      GS.view = 'solar';
      GS.activeZone = null;
      renderPass.scene = solarScene;
      controls.minDistance = 30; controls.maxDistance = 300; controls.maxPolarAngle = Math.PI * 0.45;
      heatPass.enabled = false;
      bloomPass.strength = 0.5;
      renderer.toneMappingExposure = 1.2;
      showSolarUI();
    };
  }
}

function updateTransition(dt) {
  if (GS.view !== 'transitioning') return;
  transProgress += dt * 1.5; // faster, more fluid
  const t = smoothstep(Math.min(transProgress, 1));
  camera.position.lerpVectors(transFrom, transTo, t);
  controls.target.lerpVectors(transTargFrom, transTargTo, t);
  if (transProgress >= 1 && transCallback) { transCallback(); transCallback = null; }
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

// ============================================================
// PARTICLES
// ============================================================
function createEmberParticles() {
  const count = 300;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), life = new Float32Array(count);
  for (let i = 0; i < count; i++) resetEmber(pos, vel, life, i);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData = { vel, life };
  const mat = new THREE.PointsMaterial({ color: 0xff6600, size: 0.4, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const p = new THREE.Points(geo, mat);
  planetScene.add(p);
  return p;
}

function resetEmber(pos, vel, life, i) {
  pos[i*3] = (Math.random()-0.5)*80; pos[i*3+1] = -0.5+Math.random()*0.5; pos[i*3+2] = (Math.random()-0.5)*80;
  vel[i*3] = (Math.random()-0.5)*0.5; vel[i*3+1] = 1+Math.random()*2; vel[i*3+2] = (Math.random()-0.5)*0.5;
  life[i] = Math.random()*3;
}

function updateEmbers(p, dt) {
  const pos = p.geometry.attributes.position.array;
  const { vel, life } = p.geometry.userData;
  for (let i = 0; i < life.length; i++) {
    life[i] -= dt;
    if (life[i] <= 0) { resetEmber(pos, vel, life, i); continue; }
    pos[i*3] += vel[i*3]*dt; pos[i*3+1] += vel[i*3+1]*dt; pos[i*3+2] += vel[i*3+2]*dt;
  }
  p.geometry.attributes.position.needsUpdate = true;
}

// ============================================================
// UI
// ============================================================
const $ = id => document.getElementById(id);
const els = {
  resourceBar: $('resource-bar'),
  energyVal: $('energy-value'), energyRate: $('energy-rate'),
  mineralsVal: $('minerals-value'), mineralsRate: $('minerals-rate'),
  popVal: $('population-value'), popRate: $('population-rate'),
  buildMenu: $('build-menu'), buildOptions: $('build-options'),
  infoPanel: $('info-panel'), infoPanelTitle: $('info-panel-title'), infoPanelLevel: $('info-panel-level'),
  infoPanelDesc: $('info-panel-desc'), infoPanelStats: $('info-panel-stats'),
  infoPanelUpgrade: $('info-panel-upgrade'), infoPanelClose: $('info-panel-close'),
  btnBackToSolar: $('btn-back-to-solar'), btnBuild: $('btn-build'),
  planetInfo: $('planet-info'), planetInfoName: $('planet-info-name'), planetInfoType: $('planet-info-type'), planetInfoLand: $('planet-info-land'),
  placementIndicator: $('placement-indicator'),
  // New UI
  techPanel: $('tech-panel'), techOptions: $('tech-options'), techProgress: $('tech-progress-bar'),
  eventLog: $('event-log'), eventList: $('event-list'),
  scoreDisplay: $('score-display'),
  btnTech: $('btn-tech'),
  tutorialOverlay: $('tutorial-overlay'), tutorialText: $('tutorial-text'), tutorialDismiss: $('tutorial-dismiss'),
  // Shipyard
  shipyardPanel: $('shipyard-panel'), shipOptions: $('ship-options'),
  shipQueueStatus: $('ship-queue-status'), shipFleetSummary: $('ship-fleet-summary'),
  // HUD sidebars
  colonyStatus: $('colony-status'), systemStatus: $('system-status'), statusBar: $('status-bar'),
  csDefenseBar: $('cs-defense-bar'), csDefenseVal: $('cs-defense-val'),
  csShieldStatus: $('cs-shield-status'), csBuildingCount: $('cs-building-count'),
  csZoneName: $('cs-zone-name'), csThreatLevel: $('cs-threat-level'),
  csTechCount: $('cs-tech-count'), csTradeCount: $('cs-trade-count'),
  sbViewLabel: $('sb-view-label'), sbPowerStatus: $('sb-power-status'),
  csFleetSummary: $('cs-fleet-summary'),
  planetInfoFleet: $('planet-info-fleet'),
};

function hideAllUI() {
  els.btnBackToSolar?.classList.add('hidden');
  els.btnBuild?.classList.add('hidden');
  els.buildMenu?.classList.add('hidden');
  els.infoPanel?.classList.add('hidden');
  els.btnTech?.classList.add('hidden');
  els.techPanel?.classList.add('hidden');
  $('btn-back-to-overview')?.classList.add('hidden');
  if (els.resourceBar) els.resourceBar.style.display = 'none';
  if (els.colonyStatus) els.colonyStatus.style.display = 'none';
  if (els.systemStatus) els.systemStatus.style.display = 'none';
  els.shipyardPanel?.classList.add('hidden');
}

function showSolarUI() {
  hideAllUI();
  if (els.sbViewLabel) els.sbViewLabel.textContent = 'SOLAR';
}

function showOverviewUI() {
  hideAllUI();
  els.btnBackToSolar?.classList.remove('hidden');
  if (els.resourceBar) els.resourceBar.style.display = '';
  if (els.colonyStatus) els.colonyStatus.style.display = '';
  if (els.systemStatus) els.systemStatus.style.display = '';
  if (els.sbViewLabel) els.sbViewLabel.textContent = 'OVERVIEW';
  if (els.csZoneName) els.csZoneName.textContent = 'ALL';
}

function showZoneUI() {
  hideAllUI();
  const backBtn = $('btn-back-to-overview');
  if (backBtn) {
    backBtn.classList.remove('hidden');
    const planetZones = ZONES.filter(z => z.planet === GS.activePlanet);
    backBtn.textContent = planetZones.length === 1 ? '↑ Solar System' : '↑ Planet Overview';
  }
  els.btnBuild?.classList.remove('hidden');
  els.btnTech?.classList.remove('hidden');
  if (els.resourceBar) els.resourceBar.style.display = '';
  if (els.colonyStatus) els.colonyStatus.style.display = '';
  if (els.systemStatus) els.systemStatus.style.display = '';
  if (els.sbViewLabel) els.sbViewLabel.textContent = 'ZONE';
  const zone = ZONES[GS.activeZone] || ZONES[0];
  if (els.csZoneName) els.csZoneName.textContent = zone.name.toUpperCase();
}

function updateUI() {
  const rates = getProductionRates();
  const cap = getStorageCap();
  GS.storageCap = cap;
  if (els.energyVal) els.energyVal.textContent = Math.floor(GS.resources.energy);
  if (els.energyRate) els.energyRate.textContent = `+${rates.energy.toFixed(1)}/s`;
  if (els.mineralsVal) els.mineralsVal.textContent = Math.floor(GS.resources.minerals);
  if (els.mineralsRate) els.mineralsRate.textContent = `+${rates.minerals.toFixed(1)}/s`;
  if (els.popVal) els.popVal.textContent = Math.floor(GS.population);
  if (els.popRate) els.popRate.textContent = `/${GS.maxPopulation}`;
  if (els.scoreDisplay) els.scoreDisplay.textContent = Math.floor(GS.score);

  // HUD sidebar updates
  if (els.csDefenseVal) els.csDefenseVal.textContent = GS.defenseRating;
  if (els.csDefenseBar) els.csDefenseBar.style.width = Math.min(GS.defenseRating, 100) + '%';
  if (els.csShieldStatus) {
    els.csShieldStatus.textContent = GS.shieldActive ? 'ACTIVE' : 'OFFLINE';
    els.csShieldStatus.classList.toggle('online', GS.shieldActive);
  }
  if (els.csBuildingCount) els.csBuildingCount.textContent = GS.buildings.length;
  if (els.csThreatLevel) {
    const threat = GS.defenseRating > 30 ? 'LOW' : GS.defenseRating > 0 ? 'MODERATE' : 'NONE';
    els.csThreatLevel.textContent = threat;
  }
  if (els.csTechCount) els.csTechCount.textContent = `${GS.researchedTechs.size} / ${Object.keys(TechTree).length}`;
  if (els.csTradeCount) els.csTradeCount.textContent = `${GS.tradeRoutes.length} route${GS.tradeRoutes.length !== 1 ? 's' : ''}`;
  if (els.csFleetSummary) {
    const total = GS.ships.fighter + GS.ships.transport + GS.ships.colonyShip;
    els.csFleetSummary.textContent = total === 0 ? '0 ships' : `${GS.ships.fighter}F ${GS.ships.transport}T ${GS.ships.colonyShip}C`;
  }
  if (els.sbPowerStatus) {
    els.sbPowerStatus.textContent = rates.energy > 0 ? 'GENERATING' : 'STABLE';
  }

  // Tech progress bar — fix: toggle #research-bar, not #research-track
  const researchBar = $('research-bar');
  const researchLabel = $('research-label');
  if (GS.currentResearch && els.techProgress) {
    const tech = TechTree[GS.currentResearch];
    const pct = Math.min(GS.researchProgress / tech.time * 100, 100);
    els.techProgress.style.width = pct + '%';
    if (researchLabel) researchLabel.textContent = `Researching: ${tech.name} (${Math.floor(pct)}%)`;
    researchBar?.classList.remove('hidden');
  } else {
    researchBar?.classList.add('hidden');
  }
}

function getAvailableBuildings() {
  const available = {};
  const unlocked = new Set();
  GS.researchedTechs.forEach(techId => {
    const tech = TechTree[techId];
    if (tech?.unlocks) tech.unlocks.forEach(b => unlocked.add(b));
  });
  // Command center always available
  unlocked.add('command_center');

  Object.entries(BuildingDefs).forEach(([key, def]) => {
    if (!unlocked.has(key)) return;
    if (def.unique && GS.buildings.some(b => b.type === key)) return;
    available[key] = def;
  });
  return available;
}

function populateBuildMenu(category = 'all') {
  if (!els.buildOptions) return;
  els.buildOptions.innerHTML = '';
  // Update tab active state
  document.querySelectorAll('.build-cat-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cat === category);
    tab.onclick = () => populateBuildMenu(tab.dataset.cat);
  });
  const available = getAvailableBuildings();
  Object.entries(available).forEach(([key, def]) => {
    if (category !== 'all' && def.category !== category) return;
    const canAfford = GS.resources.energy >= def.cost.energy && GS.resources.minerals >= def.cost.minerals;
    const opt = document.createElement('div');
    opt.className = 'build-option' + (canAfford ? '' : ' disabled');
    opt.innerHTML = `<div class="build-option-icon">${def.icon}</div><div class="build-option-name">${def.name}</div><div class="build-option-cost">⚡${def.cost.energy} 💎${def.cost.minerals}</div><div style="font-size:9px;color:#666;margin-top:4px">${def.desc}</div>`;
    opt.addEventListener('click', () => {
      if (!canAfford) return;
      GS.placingBuilding = key;
      els.buildMenu?.classList.add('hidden');
      els.placementIndicator?.classList.remove('hidden');
      document.body.classList.add('placement-active');
    });
    els.buildOptions.appendChild(opt);
  });
}

function populateTechMenu() {
  if (!els.techOptions) return;
  els.techOptions.innerHTML = '';
  Object.entries(TechTree).forEach(([key, tech]) => {
    const researched = GS.researchedTechs.has(key);
    const inProgress = GS.currentResearch === key;
    const reqs = tech.requires.every(r => GS.researchedTechs.has(r));
    const canAfford = reqs && Object.entries(tech.cost).every(([r, v]) => GS.resources[r] >= v);

    const opt = document.createElement('div');
    let stateClass = '', stateBadge = '';
    if (researched) { stateClass = ' researched'; stateBadge = '<span style="color:#4f4;font-size:10px">✓ DONE</span>'; }
    else if (inProgress) { stateClass = ' in-progress'; const pct = Math.floor(GS.researchProgress / tech.time * 100); stateBadge = `<span style="color:#0cf;font-size:10px">⏳ ${pct}%</span>`; }
    else if (!reqs) { stateClass = ' locked'; stateBadge = '<span style="color:#666;font-size:10px">🔒 LOCKED</span>'; }
    else if (!canAfford) { stateClass = ' disabled'; stateBadge = ''; }

    opt.className = 'build-option' + stateClass;
    const unlockNames = (tech.unlocks || []).map(u => BuildingDefs[u]?.name || u).join(', ');
    const reqNames = (tech.requires || []).map(r => TechTree[r]?.name || r).join(', ');
    const costStr = Object.entries(tech.cost).map(([r, v]) => (r === 'energy' ? '⚡' : '💎') + v).join(' ');

    opt.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">${stateBadge}</div>
      <div class="build-option-icon">🔬</div>
      <div class="build-option-name">${tech.name}</div>
      <div class="build-option-cost">${costStr} | ${tech.time}s</div>
      <div style="font-size:9px;color:#888;margin-top:4px">${tech.desc}</div>
      ${unlockNames ? `<div style="font-size:9px;color:#4ade80;margin-top:2px">Unlocks: ${unlockNames}</div>` : ''}
      ${reqNames ? `<div style="font-size:9px;color:#f97316;margin-top:1px">Requires: ${reqNames}</div>` : ''}
    `;

    if (!researched && !inProgress && reqs && canAfford && !GS.currentResearch) {
      opt.addEventListener('click', () => {
        Object.entries(tech.cost).forEach(([r, v]) => GS.resources[r] -= v);
        GS.currentResearch = key;
        GS.researchProgress = 0;
        els.techPanel?.classList.add('hidden');
        showNotification(`Researching: ${tech.name}`);
      });
    }
    els.techOptions.appendChild(opt);
  });
}

function showBuildingInfo(building) {
  GS.selectedBuilding = building;
  if (els.infoPanelTitle) els.infoPanelTitle.textContent = building.def.name;
  if (els.infoPanelLevel) els.infoPanelLevel.textContent = `Level ${building.level} / ${building.def.maxLevel}`;
  if (els.infoPanelDesc) els.infoPanelDesc.textContent = building.def.desc;

  let html = '';
  if (building.def.production.energy) html += `<div class="stat-row"><span class="stat-label">⚡ Energy</span><span class="stat-value">+${(building.def.production.energy * building.level).toFixed(1)}/s</span></div>`;
  if (building.def.production.minerals) html += `<div class="stat-row"><span class="stat-label">💎 Minerals</span><span class="stat-value">+${(building.def.production.minerals * building.level).toFixed(1)}/s</span></div>`;
  if (building.def.maxPopBonus) html += `<div class="stat-row"><span class="stat-label">👥 Capacity</span><span class="stat-value">+${building.def.maxPopBonus * building.level}</span></div>`;
  if (building.def.effect === 'turret') html += `<div class="stat-row"><span class="stat-label">🗼 Defense</span><span class="stat-value">+${10 * building.level}</span></div>`;
  if (building.def.effect === 'shield') html += `<div class="stat-row"><span class="stat-label">🛡️ Shield</span><span class="stat-value">Active</span></div>`;

  if (building.level < building.def.maxLevel) {
    const uc = { energy: building.def.cost.energy * (building.level + 1), minerals: building.def.cost.minerals * (building.level + 1) };
    html += `<div class="stat-row" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px"><span class="stat-label">Upgrade</span><span class="stat-value amber">⚡${uc.energy} 💎${uc.minerals}</span></div>`;
  }

  if (els.infoPanelStats) els.infoPanelStats.innerHTML = html;
  if (els.infoPanelUpgrade) els.infoPanelUpgrade.style.display = building.level >= building.def.maxLevel ? 'none' : '';
  els.infoPanel?.classList.remove('hidden');
}

// ============================================================
// SHIPYARD PANEL
// ============================================================
function canBuildShip(type) {
  const def = ShipDefs[type];
  if (!def) return false;
  if (type === 'colonyShip' && !GS.researchedTechs.has('colonization')) return 'locked';
  if (type === 'transport' && !GS.researchedTechs.has('trade_networks')) return 'locked';
  if (type === 'fighter' && !GS.researchedTechs.has('military_science')) return 'locked';
  if (GS.resources.energy < def.cost.energy || GS.resources.minerals < def.cost.minerals) return 'disabled';
  return true;
}

function populateShipyardPanel() {
  if (!els.shipOptions) return;
  els.shipOptions.innerHTML = '';

  Object.entries(ShipDefs).forEach(([type, def]) => {
    const status = canBuildShip(type);
    const div = document.createElement('div');
    div.className = 'ship-option' + (status === 'disabled' ? ' disabled' : '') + (status === 'locked' ? ' locked' : '');
    div.innerHTML = `
      <span class="ship-option-icon">${def.icon}</span>
      <div class="ship-option-info">
        <div class="ship-option-name">${def.name}</div>
        ${status === 'locked'
          ? `<div class="ship-option-lock">REQUIRES RESEARCH</div>`
          : `<div class="ship-option-cost">⚡${def.cost.energy} 💎${def.cost.minerals} · ${def.buildTime}s</div>`
        }
      </div>
    `;
    if (status === true) {
      div.addEventListener('click', () => {
        GS.resources.energy -= def.cost.energy;
        GS.resources.minerals -= def.cost.minerals;
        GS.shipQueue.push({ type, progress: 0, buildTime: def.buildTime });
        populateShipyardPanel();
      });
    }
    els.shipOptions.appendChild(div);
  });

  updateShipyardQueue();
  updateFleetSummary();
}

function updateShipyardQueue() {
  if (!els.shipQueueStatus) return;
  if (GS.shipQueue.length === 0) {
    els.shipQueueStatus.innerHTML = '<div class="sq-queue-item">IDLE — NO SHIPS IN QUEUE</div>';
    return;
  }
  els.shipQueueStatus.innerHTML = '';
  GS.shipQueue.forEach((item, i) => {
    const def = ShipDefs[item.type];
    if (i === 0) {
      const pct = Math.min(item.progress / item.buildTime * 100, 100);
      const div = document.createElement('div');
      div.className = 'sq-building';
      div.innerHTML = `
        <div class="sq-building-name">${def.icon} BUILDING ${def.name.toUpperCase()} · ${Math.floor(pct)}%</div>
        <div class="sq-building-bar"><div class="sq-building-fill" style="width:${pct}%"></div></div>
      `;
      els.shipQueueStatus.appendChild(div);
    } else {
      const div = document.createElement('div');
      div.className = 'sq-queue-item sq-queue-cancelable';
      div.innerHTML = `<span>${def.icon} ${def.name} — queued</span><span class="sq-cancel-btn">✕</span>`;
      div.querySelector('.sq-cancel-btn').addEventListener('click', () => {
        GS.shipQueue.splice(i, 1);
        GS.resources.energy += def.cost.energy;
        GS.resources.minerals += def.cost.minerals;
        showNotification(`${def.name} cancelled — resources refunded`);
        populateShipyardPanel();
      });
      els.shipQueueStatus.appendChild(div);
    }
  });
}

function updateFleetSummary() {
  if (!els.shipFleetSummary) return;
  els.shipFleetSummary.innerHTML = `
    <div class="fleet-title">FLEET</div>
    ${Object.entries(ShipDefs).map(([type, def]) =>
      `<div class="fleet-row"><span class="fleet-row-name">${def.icon} ${def.name}</span><span class="fleet-row-count">${GS.ships[type] || 0}</span></div>`
    ).join('')}
  `;
}

function showShipyardPanel() {
  els.infoPanel?.classList.add('hidden');
  populateShipyardPanel();
  els.shipyardPanel?.classList.remove('hidden');
}

// ============================================================
// EVENT HANDLERS
// ============================================================
els.btnBuild?.addEventListener('click', () => { populateBuildMenu(); els.buildMenu?.classList.toggle('hidden'); els.techPanel?.classList.add('hidden'); els.shipyardPanel?.classList.add('hidden'); });
els.btnBackToSolar?.addEventListener('click', () => transitionToView('solar'));
$('btn-back-to-overview')?.addEventListener('click', () => {
  const planetZones = ZONES.filter(z => z.planet === GS.activePlanet);
  if (planetZones.length === 1) {
    transitionToView('solar');
  } else {
    transitionToView('planet_overview');
  }
});
els.infoPanelClose?.addEventListener('click', () => { els.infoPanel?.classList.add('hidden'); GS.selectedBuilding = null; });
els.infoPanelUpgrade?.addEventListener('click', () => {
  if (!GS.selectedBuilding) return;
  const b = GS.selectedBuilding;
  const cost = { energy: b.def.cost.energy * (b.level + 1), minerals: b.def.cost.minerals * (b.level + 1) };
  if (GS.resources.energy >= cost.energy && GS.resources.minerals >= cost.minerals) {
    GS.resources.energy -= cost.energy; GS.resources.minerals -= cost.minerals;
    b.level++;
    b.mesh.scale.setScalar(1 + (b.level - 1) * 0.08);
    recalcMaxPop(); recalcDefense();
    showBuildingInfo(b);
  }
});
els.btnTech?.addEventListener('click', () => { populateTechMenu(); els.techPanel?.classList.toggle('hidden'); els.buildMenu?.classList.add('hidden'); });
// Save button removed — auto-save handles it
els.tutorialDismiss?.addEventListener('click', () => { els.tutorialOverlay?.classList.add('hidden'); advanceTutorial(); });

// ============================================================
// RAYCASTING
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', (e) => {
  if (e.target !== canvas) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const scene = GS.view === 'solar' ? solarScene : planetScene;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(scene.children, true);

  if (GS.view === 'solar') {
    els.planetInfo?.classList.add('hidden');
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData.planet) obj = obj.parent;
      if (obj?.userData.planet) {
        const p = obj.userData.planet;
        if (els.planetInfoName) els.planetInfoName.textContent = p.name;
        if (els.planetInfoType) els.planetInfoType.textContent = p.type;

        // Description
        const descEl = $('planet-info-desc');
        if (descEl) descEl.textContent = p.desc || '';

        // Stats grid
        const statsEl = $('planet-info-stats');
        if (statsEl) statsEl.innerHTML = `
          <div class="pi-stat"><span class="pi-label">Temperature</span><span class="pi-val">${p.temperature}</span></div>
          <div class="pi-stat"><span class="pi-label">Gravity</span><span class="pi-val">${p.gravity}</span></div>
          <div class="pi-stat"><span class="pi-label">Threat Level</span><span class="pi-val pi-threat-${(p.threat||'').toLowerCase()}">${p.threat}</span></div>
          <div class="pi-stat"><span class="pi-label">Status</span><span class="pi-val" style="color:${p.colonized?'#4ade80':'#888'}">${p.colonized ? 'Colonized' : 'Uncolonized'}</span></div>
        `;

        // Resource concentrations
        const resEl = $('planet-info-resources');
        if (resEl && p.resources) {
          const ratingColor = (r) => ({ 'Very High': '#ff8c00', 'High': '#4ade80', 'Medium': '#eab308', 'Low': '#888', 'None': '#444' }[r] || '#888');
          resEl.innerHTML = `<div class="pi-res-title">RESOURCE CONCENTRATION</div>` +
            Object.entries(p.resources).map(([k, v]) =>
              `<div class="pi-res-row"><span class="pi-res-name">${k === 'rare' ? 'Rare Elements' : k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="pi-res-val" style="color:${ratingColor(v)}">${v}</span></div>`
            ).join('');
        }

        // Fleet info
        const fleetEl = els.planetInfoFleet;
        if (fleetEl) {
          const total = GS.ships.fighter + GS.ships.transport + GS.ships.colonyShip;
          if (total > 0 || GS.shipQueue.length > 0) {
            fleetEl.innerHTML = `<div class="pi-fleet-title">YOUR FLEET</div>` +
              Object.entries(ShipDefs).map(([type, def]) => {
                const count = GS.ships[type] || 0;
                return `<div class="pi-fleet-row"><span class="pi-fleet-name">${def.icon} ${def.name}</span><span class="pi-fleet-count${count > 0 ? ' has-ships' : ''}">${count}</span></div>`;
              }).join('') +
              (GS.shipQueue.length > 0 ? `<div class="pi-fleet-row"><span class="pi-fleet-name">In queue</span><span class="pi-fleet-count">${GS.shipQueue.length}</span></div>` : '');
          } else {
            fleetEl.innerHTML = `<div class="pi-fleet-title">YOUR FLEET</div><div class="pi-fleet-row"><span class="pi-fleet-name" style="color:var(--text-dim)">No ships — build at Shipyard</span></div>`;
          }
        }

        if (els.planetInfoLand) {
          if (p.colonized) {
            els.planetInfoLand.textContent = 'Descend to Surface';
            els.planetInfoLand.style.display = '';
            els.planetInfoLand.className = 'btn btn-primary';
            els.planetInfoLand.onclick = () => {
              GS.activePlanet = p.name;
              els.planetInfo?.classList.add('hidden');
              transitionToView('planet_overview');
            };
          } else {
            els.planetInfoLand.style.display = '';
            if (GS.ships.colonyShip > 0) {
              els.planetInfoLand.textContent = `Colonize (1 Colony Ship)`;
              els.planetInfoLand.className = 'btn btn-danger';
              els.planetInfoLand.onclick = () => {
                GS.ships.colonyShip--;
                p.colonized = true;
                GS.colonies.push(p.name);
                colonizePlanet(p);
                els.planetInfo?.classList.add('hidden');
                showNotification(`${p.name} colonized!`);
                addEvent(`Colonized ${p.name}`);
              };
            } else {
              els.planetInfoLand.textContent = 'Requires Colony Ship';
              els.planetInfoLand.className = 'btn btn-secondary';
              els.planetInfoLand.onclick = null;
            }
          }
        }
        els.planetInfo?.classList.remove('hidden');
        return;
      }
    }
  } else if (GS.view === 'planet_overview') {
    // Click zone markers to enter zones
    for (const hit of hits) {
      if (hit.object?.userData?.isZoneMarker) {
        transitionToView('zone', hit.object.userData.zoneId);
        return;
      }
    }
  } else if (GS.view === 'zone') {
    if (GS.placingBuilding) {
      for (const hit of hits) {
        let obj = hit.object;
        while (obj && !obj.userData.isHex) obj = obj.parent;
        if (obj?.userData.isHex) {
          if (placeBuilding(GS.placingBuilding, obj.userData.gridQ, obj.userData.gridR, false, obj.userData.zoneId)) {
            GS.placingBuilding = null;
            document.body.classList.remove('placement-active');
            els.placementIndicator?.classList.add('hidden');
          }
          return;
        }
      }
      return;
    }
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData.type) obj = obj.parent;
      if (obj?.userData.type) {
        const b = GS.grid.get(gridKey(obj.userData.q, obj.userData.r, obj.userData.zoneId));
        if (b) {
          if (b.type === 'shipyard') { showShipyardPanel(); return; }
          showBuildingInfo(b);
          return;
        }
      }
    }
    els.infoPanel?.classList.add('hidden');
    els.shipyardPanel?.classList.add('hidden');
    GS.selectedBuilding = null;
  }
});

// Hover
let hoveredHex = null, ghostBuilding = null;
const highlightMat = new THREE.MeshStandardMaterial({ color: 0x00aacc, emissive: 0x006688, emissiveIntensity: 0.3, roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.5 });

canvas.addEventListener('mousemove', (e) => {
  if (GS.view !== 'zone' || !GS.placingBuilding) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (hoveredHex) { hoveredHex.material = hoveredHex.userData.originalMat; hoveredHex = null; }
  if (ghostBuilding) { planetScene.remove(ghostBuilding); ghostBuilding = null; }

  const hits = raycaster.intersectObjects(planetScene.children, true);
  for (const hit of hits) {
    let obj = hit.object;
    while (obj && !obj.userData.isHex) obj = obj.parent;
    if (obj?.userData.isHex) {
      const key = gridKey(obj.userData.gridQ, obj.userData.gridR, obj.userData.zoneId);
      if (!GS.grid.has(key)) {
        if (!obj.userData.originalMat) obj.userData.originalMat = obj.material;
        obj.material = highlightMat;
        hoveredHex = obj;
        // Ghost building
        const gen = buildingGenerators[GS.placingBuilding];
        if (gen) {
          ghostBuilding = gen();
          ghostBuilding.traverse(c => { if (c.isMesh) c.material = hologramShader; });
          const { x, z } = hexWorldPos(obj.userData.gridQ, obj.userData.gridR, obj.userData.zoneId);
          ghostBuilding.position.set(x, 0.5, z);
          planetScene.add(ghostBuilding);
        }
      }
      break;
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (GS.placingBuilding) { GS.placingBuilding = null; document.body.classList.remove('placement-active'); els.placementIndicator?.classList.add('hidden'); }
    els.buildMenu?.classList.add('hidden');
    els.infoPanel?.classList.add('hidden');
    els.planetInfo?.classList.add('hidden');
    els.techPanel?.classList.add('hidden');
    els.shipyardPanel?.classList.add('hidden');
    if (hoveredHex) { hoveredHex.material = hoveredHex.userData.originalMat; hoveredHex = null; }
    if (ghostBuilding) { planetScene.remove(ghostBuilding); ghostBuilding = null; }
  }
  if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveGame(); }
});

// ============================================================
// GAME UPDATE LOOP
// ============================================================
function updateGame(dt) {
  if (GS.matchEnded) return;
  const adt = dt * GS.gameSpeed; // game-speed-adjusted dt

  // Match timer (wall clock, not game speed)
  if (GS.matchMode) {
    GS.matchTimeRemaining -= dt;
    const timerEl = $('match-timer');
    const timerVal = $('match-time-value');
    if (timerEl && timerVal) {
      timerEl.classList.remove('hidden');
      const mins = Math.max(0, Math.floor(GS.matchTimeRemaining / 60));
      const secs = Math.max(0, Math.floor(GS.matchTimeRemaining % 60));
      timerVal.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (GS.matchTimeRemaining <= 30) timerVal.style.color = '#ff3344';
    }
    if (GS.matchTimeRemaining <= 0 || GS.score >= GS.matchTargetScore) {
      endMatch();
      return;
    }
  }

  const rates = getProductionRates();
  const cap = getStorageCap();
  GS.resources.energy = Math.min(GS.resources.energy + rates.energy * adt, cap.energy);
  GS.resources.minerals = Math.min(GS.resources.minerals + rates.minerals * adt, cap.minerals);

  // Population growth
  if (GS.population < GS.maxPopulation) {
    GS.population = Math.min(GS.population + 0.2 * adt, GS.maxPopulation);
  }

  // Research
  if (GS.currentResearch) {
    GS.researchProgress += adt * getResearchSpeed();
    const tech = TechTree[GS.currentResearch];
    if (GS.researchProgress >= tech.time) {
      GS.researchedTechs.add(GS.currentResearch);
      showNotification(`Research complete: ${tech.name}`);
      addEvent(`Researched ${tech.name}`);
      GS.currentResearch = null;
      GS.researchProgress = 0;
    }
  }

  // Ship build queue
  if (GS.shipQueue.length > 0) {
    const current = GS.shipQueue[0];
    current.progress += adt;
    if (current.progress >= current.buildTime) {
      GS.ships[current.type] = (GS.ships[current.type] || 0) + 1;
      showNotification(`${ShipDefs[current.type].name} constructed!`);
      addEvent(`Built ${ShipDefs[current.type].name}`);
      GS.shipQueue.shift();
    }
    // Update shipyard panel if visible
    if (!els.shipyardPanel?.classList.contains('hidden')) {
      updateShipyardQueue();
      updateFleetSummary();
    }
  }

  // Score
  GS.score += (GS.buildings.length * 0.1 + rates.energy * 0.05 + rates.minerals * 0.05) * adt;

  // Events
  GS.lastEventTime += adt;
  if (GS.lastEventTime > GS.eventCooldown && GS.buildings.length >= 3) {
    GS.lastEventTime = 0;
    GS.eventCooldown = 45 + Math.random() * 60;
    triggerEvent();
  }

  // Silent auto-save every 30 seconds
  if (!GS._autoSaveTimer) GS._autoSaveTimer = 0;
  GS._autoSaveTimer += dt;
  if (GS._autoSaveTimer >= 30) {
    GS._autoSaveTimer = 0;
    safe(() => saveGame(true), 'autosave');
  }
}

// ============================================================
// EVENT SYSTEM (Phase 3)
// ============================================================
function addEvent(msg) {
  GS.events.unshift({ msg, time: GS.time });
  if (GS.events.length > 20) GS.events.pop();
  if (els.eventList) {
    els.eventList.innerHTML = GS.events.slice(0, 5).map(e => `<div class="event-item">${e.msg}</div>`).join('');
  }
}

function triggerEvent() {
  const events = [
    { name: 'Pirate Raid', type: 'combat', strength: 10 + Math.floor(GS.time / 30) },
    { name: 'Meteor Shower', type: 'hazard', strength: 5 },
    { name: 'Trade Caravan', type: 'bonus', bonus: { energy: 30, minerals: 20 } },
    { name: 'Refugee Ship', type: 'bonus', popBonus: 3 },
    { name: 'Solar Flare', type: 'hazard', strength: 8 },
  ];

  const event = events[Math.floor(Math.random() * events.length)];

  if (event.type === 'combat') {
    if (GS.defenseRating >= event.strength) {
      addEvent(`⚔️ ${event.name} repelled! (Defense: ${GS.defenseRating})`);
      showNotification(`${event.name} repelled!`);
      GS.score += event.strength;
    } else {
      const loss = Math.min((event.strength - GS.defenseRating) * 2, GS.resources.minerals);
      GS.resources.minerals -= loss;
      addEvent(`⚔️ ${event.name}! Lost ${Math.floor(loss)} minerals`);
      showNotification(`${event.name}! Lost ${Math.floor(loss)} minerals`);
      // Trigger shield impact visual
      solarScene.traverse(c => {
        if (c.name === 'colony-shield' && c.material?.uniforms?.uImpactTime) {
          c.material.uniforms.uImpactTime.value = GS.time;
          c.material.uniforms.uImpactPoint.value.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(4);
        }
      });
    }
  } else if (event.type === 'bonus') {
    if (event.bonus) {
      GS.resources.energy += event.bonus.energy || 0;
      GS.resources.minerals += event.bonus.minerals || 0;
      addEvent(`🎁 ${event.name}: +${event.bonus.energy || 0}⚡ +${event.bonus.minerals || 0}💎`);
    }
    if (event.popBonus) {
      GS.population = Math.min(GS.population + event.popBonus, GS.maxPopulation);
      addEvent(`🎁 ${event.name}: +${event.popBonus} colonists`);
    }
    showNotification(event.name);
  } else if (event.type === 'hazard') {
    const dmg = GS.shieldActive ? Math.floor(event.strength * 0.3) : event.strength;
    const loss = Math.min(dmg * 1.5, GS.resources.energy);
    GS.resources.energy -= loss;
    addEvent(`☄️ ${event.name}! Lost ${Math.floor(loss)} energy` + (GS.shieldActive ? ' (shielded)' : ''));
    showNotification(event.name + (GS.shieldActive ? ' (shielded!)' : ''));
  }
}

// ============================================================
// TUTORIAL (Phase 5)
// ============================================================
const tutorialSteps = [
  'Welcome to Ignisium! Click a planet in the solar system to inspect it, then land on your colony.',
  'Your colony needs resources. Open the Build menu and place a Thermal Extractor on an empty hex.',
  'Great! Keep building to grow your colony. Research new tech with the Research button. Events will start happening as your colony grows.',
];

function advanceTutorial() {
  if (GS.tutorialDone) return;
  GS.tutorialStep++;
  if (GS.tutorialStep >= tutorialSteps.length) { GS.tutorialDone = true; return; }
  if (els.tutorialText) els.tutorialText.textContent = tutorialSteps[GS.tutorialStep];
  els.tutorialOverlay?.classList.remove('hidden');
}

function showTutorial() {
  if (GS.tutorialDone || !els.tutorialOverlay) return;
  if (els.tutorialText) els.tutorialText.textContent = tutorialSteps[0];
  els.tutorialOverlay?.classList.remove('hidden');
}

// ============================================================
// ANIMATIONS
// ============================================================
function animateSolarSystem(time) {
  solarScene.children.forEach(c => {
    if (c.userData.planet) {
      c.userData.orbitAngle += c.userData.planet.speed * 0.005;
      const a = c.userData.orbitAngle, d = c.userData.planet.dist;
      c.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      c.rotation.y += 0.003;
      // For triplanar-shaded planets, point the lit hemisphere at the
      // sun (origin in solar scene). Light dir is from planet -> sun in
      // world space, then rotated into the planet's local frame so it
      // tracks correctly as the planet rotates on its own axis.
      if (c.material && c.material.uniforms && c.material.uniforms.uLightDir) {
        const toSunWorld = c.position.clone().multiplyScalar(-1).normalize();
        const inv = new THREE.Matrix4().copy(c.matrixWorld).invert();
        const toSunLocal = toSunWorld.transformDirection(inv);
        c.material.uniforms.uLightDir.value.copy(toSunLocal);
      }
    }
  });
}

function animateBuildings(time) {
  GS.buildings.forEach(b => {
    b.mesh.traverse(c => {
      if (c.name === 'energy-core' || c.name === 'antenna-light' || c.name === 'shield-emitter')
        c.scale.setScalar(1 + Math.sin(time * 3) * 0.15);
      if (c.name === 'energy-ring') c.rotation.z = time * 1.5;
      if (c.name === 'drill-arm') c.rotation.y = time * 2;
      if (c.name === 'turret-barrel') c.rotation.y = Math.sin(time * 0.5) * 0.5;
      if (c.name === 'turret-light') c.scale.setScalar(1 + Math.sin(time * 5) * 0.3);
      if (c.name === 'holo-display') { c.material.opacity = 0.4 + Math.sin(time * 2) * 0.2; c.rotation.y = time * 0.3; }
      if (c.name === 'trade-pad') c.rotation.y = time * 0.5;
    });
  });
}

// ============================================================
// MATCH SYSTEM
// ============================================================
function endMatch() {
  GS.matchEnded = true;
  const endEl = $('match-end');
  const scoreEl = $('match-final-score');
  if (scoreEl) scoreEl.textContent = Math.floor(GS.score);
  endEl?.classList.remove('hidden');
}

function startGame(matchMode, speed) {
  GS.gameSpeed = speed;
  GS.matchMode = matchMode;
  GS.matchTimeRemaining = GS.matchDuration;
  GS.matchEnded = false;
  GS.gameStarted = true;
  $('start-screen')?.remove();
  if (!matchMode) $('match-timer')?.classList.add('hidden');
}

// ============================================================
// INIT
// ============================================================
safe(() => buildSolarSystem(), 'buildSolarSystem');
safe(() => buildPlanetSurface(), 'buildPlanetSurface');
const embers = safe(() => createEmberParticles(), 'createEmbers');

// Start screen handlers
$('btn-sandbox')?.addEventListener('click', () => {
  const speed = parseInt($('game-speed-select')?.value || '1');
  startGame(false, speed);
});
$('btn-match')?.addEventListener('click', () => {
  const speed = parseInt($('game-speed-select')?.value || '5');
  startGame(true, speed);
});
$('btn-new-game')?.addEventListener('click', () => {
  localStorage.removeItem('ignisium_save');
  location.reload();
});

// Try loading saved game
const loaded = safe(() => loadGame(), 'loadGame');
if (!loaded) showTutorial();

showSolarUI();
controls.minDistance = 30; controls.maxDistance = 300;

// ============================================================
// MAIN LOOP
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();
  GS.time = time;

  // Update all shader uniforms
  allShaders.forEach(s => { if (s.uniforms?.uTime) s.uniforms.uTime.value = time; });
  buildingShaders.forEach(s => { if (s.uniforms?.uTime) s.uniforms.uTime.value = time; });
  if (heatPass.uniforms?.uTime) heatPass.uniforms.uTime.value = time;
  if (gradePass.uniforms?.uTime) gradePass.uniforms.uTime.value = time;

  controls.update();
  updateTransition(dt);

  if (GS.view === 'solar' || GS.view === 'transitioning') animateSolarSystem(time);
  if (GS.view === 'zone') {
    animateBuildings(time);
    if (embers) updateEmbers(embers, dt);
  }
  // Economy always runs (resources grow even in solar view)
  if (GS.gameStarted && !GS.matchEnded) {
    updateGame(dt);
    if (GS.view === 'zone' || GS.view === 'planet_overview') updateUI();
  }

  const activeScene = (GS.view === 'solar' || (GS.view === 'transitioning' && transProgress < 0.5)) ? solarScene : planetScene;
  renderPass.scene = activeScene;
  composer.render();
}

animate();

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// TOUCH SUPPORT (Phase 5)
// ============================================================
let touchStart = null;
canvas.addEventListener('touchstart', (e) => { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
canvas.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
    // Simulate click
    canvas.dispatchEvent(new MouseEvent('click', { clientX: touch.clientX, clientY: touch.clientY }));
  }
  touchStart = null;
}, { passive: true });
