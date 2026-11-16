/* Iron Compare stage: the WebGL layer.

   One canvas covers the whole window and sits behind the HTML. The page
   layout stays the single source of truth: every frame stage.js measures
   where the layout wants each club and hands that over as a "pose" in window
   pixels, and this file draws the club there. The camera is set up so that
   one unit in the scene is one CSS pixel at the depth the clubs rest at, so
   nothing here needs to know about the layout. Going the other way,
   anchor() reports where a point on a club ended up on screen, so the HTML
   callouts can follow the club instead of guessing.

   There is no 3D model of these clubs. Each club is the manufacturer's own
   face photo and toe photo, set at right angles to each other like the two
   halves of a hinge, and turned as one. Facing the camera you see the face
   photo; a quarter turn later you see the toe photo. */

import * as THREE from './vendor/three.module.min.js';

const FOV = 26;

const CARD_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/* A photo. The texture arrives with its colour already multiplied by its
   transparency. uFade lets the shaft dissolve upwards instead of stopping at
   the edge of the picture; uSweep is a band of light that crosses the club. */
const CARD_FRAG = `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform vec2 uFade;
  uniform float uSweep;
  uniform float uSweepAmt;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float yImg = 1.0 - vUv.y;
    float k = uOpacity * smoothstep(uFade.x, uFade.y, yImg);
    float d = (vUv.x * 0.8 + yImg * 0.6) - mix(-0.3, 1.7, uSweep);
    float band = exp(-d * d / 0.010);
    vec3 col = tex.rgb + tex.a * band * uSweepAmt * vec3(1.0, 0.96, 0.86);
    gl_FragColor = vec4(col * k, tex.a * k);
  }`;

/* Light that adds to whatever is behind it: the glint as a club turns
   edge-on, and the soft pool of light each club hangs in. */
const GLOW_FRAG = `
  precision highp float;
  uniform float uAmt;
  uniform vec3 uColor;
  uniform vec2 uShape;   // x: how thin the bright core is, y: how much soft halo
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float core = exp(-p.x * p.x / uShape.x) * exp(-p.y * p.y / 0.07);
    float halo = exp(-dot(p, p) / 0.045);
    float v = (core * (1.0 - uShape.y) + halo * uShape.y) * uAmt;
    v *= smoothstep(0.5, 0.36, length(p));
    gl_FragColor = vec4(uColor * v, 0.0);
  }`;

const DUST_VERT = `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uBox;
  uniform float uDist;
  uniform float uPx;
  varying float vA;
  void main() {
    vec3 p = aSeed;
    p.y = fract(p.y + uTime * (0.003 + aSeed.z * 0.005));
    p.x = fract(p.x + sin(uTime * 0.06 + aSeed.y * 40.0) * 0.012);
    vec4 mv = modelViewMatrix * vec4((p - 0.5) * uBox, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = mix(1.6, 5.0, fract(aSeed.x * 91.7)) * uPx * (uDist / -mv.z);
    vA = mix(0.08, 0.42, fract(aSeed.x * 37.3)) * (0.65 + 0.35 * sin(uTime * 0.5 + aSeed.x * 60.0));
  }`;

const DUST_FRAG = `
  precision highp float;
  uniform float uAmt;
  varying float vA;
  void main() {
    float f = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * f * vA * uAmt, 0.0);
  }`;

export function createStageScene({ canvas, onLost }) {
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 10000);
  let W = 1, H = 1, dist = 1, ratio = 1;

  const quad = new THREE.PlaneGeometry(1, 1);
  const additive = { transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true, blending: THREE.NormalBlending };

  function cardMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null }, uOpacity: { value: 0 }, uFade: { value: new THREE.Vector2(-1, -0.5) },
        uSweep: { value: 0 }, uSweepAmt: { value: 0 }
      },
      vertexShader: CARD_VERT, fragmentShader: CARD_FRAG,
      transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide
    });
  }

  function glowMaterial(color, shape) {
    return new THREE.ShaderMaterial(Object.assign({
      uniforms: { uAmt: { value: 0 }, uColor: { value: new THREE.Color(color) }, uShape: { value: new THREE.Vector2(shape[0], shape[1]) } },
      vertexShader: CARD_VERT, fragmentShader: GLOW_FRAG
    }, additive));
  }

  /* ---------- dust: a little depth for the clubs to hang in ---------- */

  const DUST = 150;
  const seeds = new Float32Array(DUST * 3);
  let rnd = 20261114;
  function rand() { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; }
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const dustMat = new THREE.ShaderMaterial(Object.assign({
    uniforms: { uTime: { value: 0 }, uBox: { value: new THREE.Vector3(1, 1, 1) }, uDist: { value: 1 }, uPx: { value: 1 }, uAmt: { value: 0 } },
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG
  }, additive));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 1;
  scene.add(dust);

  /* ---------- clubs ---------- */

  function makeClub() {
    const aura = new THREE.Group();      // light around the club: never squashed or turned
    const group = new THREE.Group();     // where the head is, and how big
    const spin = new THREE.Group();      // the turn about the vertical axis
    const face = new THREE.Mesh(quad, cardMaterial());
    const toe = new THREE.Mesh(quad, cardMaterial());
    toe.rotation.y = -Math.PI / 2;       // at right angles to the face photo
    face.renderOrder = 3; toe.renderOrder = 4;
    spin.add(face, toe);
    group.add(spin);

    const pool = new THREE.Mesh(quad, glowMaterial('#2b6b55', [0.08, 1]));
    pool.scale.set(4.2, 3.4, 1); pool.position.z = -40; pool.renderOrder = 0;
    const glint = new THREE.Mesh(quad, glowMaterial('#fff3d6', [0.0007, 0.22]));
    glint.scale.set(2.6, 3.4, 1); glint.renderOrder = 5;
    aura.add(pool, glint);

    scene.add(aura, group);
    return { aura, group, spin, face, toe, pool, glint, meta: null };
  }

  const clubs = { a: makeClub(), b: makeClub() };

  /* Scale and place a photo so its head box is one unit tall and centred on
     the turning axis. "along" is the direction the photo's width runs in. */
  function seat(mesh, head, along) {
    const s = 1 / (head[3] - head[1]);
    const dx = (0.5 - (head[0] + head[2]) / 2) * s;
    const dy = ((head[1] + head[3]) / 2 - 0.5) * s;
    mesh.scale.set(s, s, 1);
    if (along === 'x') mesh.position.set(dx, dy, 0); else mesh.position.set(0, dy, dx);
  }

  /* ---------- photos ---------- */

  const textures = new Map();
  const loader = new THREE.TextureLoader();
  let warmed = false;

  function load(url) {
    if (textures.has(url)) return textures.get(url);
    const p = new Promise((resolve, reject) => {
      loader.load(url, (t) => {
        t.colorSpace = THREE.NoColorSpace;      // the photos go to the screen as they are
        t.premultiplyAlpha = true;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = maxAniso;
        t.needsUpdate = true;
        renderer.initTexture(t);                // upload now, not on the first frame that shows it
        resolve(t);
      }, undefined, () => reject(new Error('Could not load ' + url)));
    });
    textures.set(url, p);
    return p;
  }

  function preload(urls) { return Promise.all(urls.map(load)); }

  /* Put a club's two photos on a side. The photos must already be loaded. */
  async function setClub(side, meta) {
    const c = clubs[side];
    if (!meta) { c.meta = null; return; }
    const [faceTex, toeTex] = await Promise.all([load(meta.face.file), load(meta.toe.file)]);
    c.face.material.uniforms.uMap.value = faceTex;
    c.toe.material.uniforms.uMap.value = toeTex;
    seat(c.face, meta.face.head, 'x');
    seat(c.toe, meta.toe.head, 'z');
    c.meta = meta;
    if (!warmed) { warmed = true; renderer.compile(scene, camera); }   // build the shaders now, not on the frame the turn starts
  }

  /* ---------- drawing ---------- */

  function resize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt((2560 * 1440 * 1.3) / (W * H)));
    renderer.setPixelRatio(ratio);
    renderer.setSize(W, H, false);
    dist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.aspect = W / H;
    camera.near = dist / 20; camera.far = dist * 4;
    camera.updateProjectionMatrix();
    dustMat.uniforms.uBox.value.set(W * 1.35, H * 1.35, Math.min(W, H) * 0.9);
    dustMat.uniforms.uDist.value = dist;
    dustMat.uniforms.uPx.value = ratio * Math.max(0.6, H / 1080);
  }

  function place(c, p) {
    c.group.visible = c.aura.visible = !!(p && c.meta);
    if (!c.group.visible) return;
    const x = p.cx - W / 2, y = H / 2 - p.cy;
    c.group.position.set(x, y, p.lift);
    c.group.scale.set(p.hh * p.flipX, p.hh, p.hh);
    c.group.rotation.z = p.roll;
    c.spin.rotation.y = p.theta;
    c.aura.position.set(x, y, p.lift);
    c.aura.scale.setScalar(p.hh);

    const fu = c.face.material.uniforms, tu = c.toe.material.uniforms;
    fu.uOpacity.value = p.opacity * p.faceO; tu.uOpacity.value = p.opacity * p.toeO;
    fu.uFade.value.set(p.faceFade[0], p.faceFade[1]); tu.uFade.value.set(p.toeFade[0], p.toeFade[1]);
    fu.uSweep.value = tu.uSweep.value = p.sweep;
    fu.uSweepAmt.value = tu.uSweepAmt.value = p.sweepAmt;
    c.face.visible = fu.uOpacity.value > 0.002; c.toe.visible = tu.uOpacity.value > 0.002;
    c.pool.material.uniforms.uAmt.value = p.opacity * p.pool;
    c.glint.material.uniforms.uAmt.value = p.opacity * p.glint;
    c.glint.visible = p.glint > 0.002;
  }

  function render(frame) {
    camera.position.set(frame.driftX, frame.driftY, dist);
    camera.lookAt(0, 0, 0);
    place(clubs.a, frame.a);
    place(clubs.b, frame.b);
    dustMat.uniforms.uTime.value = frame.time;
    dustMat.uniforms.uAmt.value = frame.dust;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
  }

  /* Where a point on a club's toe photo is on screen right now, in window
     pixels. uv is a position in the photo (0,0 top left to 1,1 bottom right). */
  const v = new THREE.Vector3();
  function anchor(side, uv) {
    const c = clubs[side];
    if (!c.meta || !c.group.visible) return null;
    v.set(uv[0] - 0.5, 0.5 - uv[1], 0);
    c.toe.localToWorld(v);
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (onLost) onLost(); });

  return { kind: 'webgl', preload, setClub, resize, render, anchor };
}
