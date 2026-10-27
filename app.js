/* Beachcombing
 * One fixed WebGL stage, driven by scroll. 1 scene unit = 100 mm.
 * Chapters (in vh of scroll): shore 0 · gathering 110 · drying 250 · learning 400 · sorting 560 · laying 730 · finishing 900–1190
 * Shore, gathering and drying are v1's; learning onward is new in v3.
 */
// trial type sets: ?font=0…6 loads the set and puts its class on <body> (see style.css). The default is Gap Sans, served locally.
const FONT_SETS = {
  0: "family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=EB+Garamond:ital,wght@0,400;0,500;1,400",
  1: "family=Ibarra+Real+Nova:ital,wght@0,400..700;1,400..700&family=Fragment+Mono",
  2: "family=Imbue:opsz,wght@10..100,100..900&family=Piazzolla:ital,opsz,wght@0,8..30,100..900;1,8..30,100..900",
  3: "family=Brygada+1918:ital,wght@0,400..700;1,400..700",
  4: "family=Syne:wght@400..800&family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..900",
  5: "family=Familjen+Grotesk:ital,wght@0,400..700;1,400..700&family=Fragment+Mono:ital@0;1",
  6: "family=Funnel+Display:wght@300..800&family=Funnel+Sans:ital,wght@0,300..800;1,300..800",
};
{
  const f = new URLSearchParams(location.search).get("font");
  if (FONT_SETS[f]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${FONT_SETS[f]}&display=swap`;
    document.head.appendChild(link);
    document.body.classList.add(`font-${f}`);
  }
}
(() => {
  "use strict";
  const THREE = window.THREE;
  const D = window.BEACH_DATA;
  const N = D.shells.length;
  const EXAG = 2.0; // relief drawn at 2× for legibility (stated in the field notes)
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ───────────────────────── helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (s, a, b) => clamp((s - a) / (b - a));
  const smooth = (t) => t * t * (3 - 2 * t);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const outCubic = (t) => 1 - Math.pow(1 - t, 3);
  const stagger = (t, d, spread = 0.55) => ease(clamp(t * (1 + spread) - d * spread));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => [...document.querySelectorAll(q)];

  // ───────────────────────── renderer, scene, camera
  const canvas = $("#stage");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    $("#veil .veil-sub").textContent = "This artwork needs WebGL, which is unavailable in this browser.";
    return;
  }
  // the pixel ratio starts at the screen's (up to 1.75); it steps down only if frames are clearly slow and back up
  // once they are fast again (see adaptResolution)
  const PR_MAX = Math.min(devicePixelRatio, 1.75), PR_MIN = Math.min(PR_MAX, 0.75);
  let pixelRatio = PR_MAX;
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders write display colours directly
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  const loadTex = (src) =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const t = new THREE.Texture(img);
        t.needsUpdate = true;
        t.anisotropy = 4;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        res(t);
      };
      img.src = src;
    });

  // ───────────────────────── shared GLSL
  const GLSL_NOISE = `
    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return s; }
    // three octaves, for broad slow patterns whose fine octaves are not visible anyway (rescaled to the same range)
    float fbm3(vec2 p){ float a=.5, s=0.; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return s * (.96875/.875); }
    float revealField(vec2 xz){ return length(xz)/14. + (fbm(xz*.32)-.5)*.32; }
  `;
  // the sea the finished islands stand in: the finish's ground colour, crossed by engraved ripple lines
  const GLSL_SEA = `
    vec3 seaCol(vec2 p, vec3 base, float t){
      float lum = dot(base, vec3(.3,.59,.11));
      vec3 ink = lum > .5 ? base * vec3(.62,.64,.68) : base + vec3(.07,.08,.09);
      float y = p.y*2.4 + .5*sin(p.x*.45 + t*.2) + (fbm3(p*.2 + t*.01) - .5)*1.6;
      float w = fwidth(y);
      float dl = min(fract(y), 1. - fract(y));                       // distance to the nearest ripple line
      float line = 1. - smoothstep(.01, .01 + w*1.2, dl);
      line *= 1. - smoothstep(.12, .35, w);                          // far away the lines fade rather than alias
      line *= smoothstep(.45, .65, fbm3(vec2(p.x*.5, p.y*1.4) + t*.02));
      return mix(base * (.97 + .05*fbm3(p*.3)), ink, line * .4);
    }
  `;

  // ───────────────────────── the shore (sand, sea, digital foam); at the end, the sea of the finished islands
  const sandU = {
    uTime: { value: 0 },
    uFront: { value: -4 },
    uReach: { value: -4 },
    uEdge: { value: new THREE.Vector3() }, // phases of the wave edge
    uRecede: { value: 0 },
    uTide: { value: 1 },
    uSunX: { value: -40 },
    uSun: { value: 0 },
    uGround: { value: new THREE.Color(0.05, 0.047, 0.042) },
    uBoard: { value: 0 },
    uSea: { value: 0 },
  };
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: sandU,
      vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.); vP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `
        ${GLSL_NOISE}
        ${GLSL_SEA}
        uniform float uTime, uFront, uReach, uRecede, uTide, uSunX, uSun, uBoard, uSea;
        uniform vec3 uEdge, uGround;
        varying vec3 vP;
        float edge(float x){ return .5*sin(x*.29+uEdge.x) + .28*sin(x*.71+uEdge.y) + .12*sin(x*1.7+uEdge.z); }
        // foam intensity evaluated at a point (used once per "digital" dot cell)
        // each noise term is only evaluated where its weight is not zero (the same picture, far fewer fbm calls)
        float foamAt(vec2 p){
          float fz = uFront + edge(p.x);
          float d = fz - p.y;                       // > 0 under water
          float band = exp(-abs(d)*5.5) * (1. - uRecede*.55);
          float lace = 0., swell = 0., wake = 0.;
          if (d > 0. && d < 2.6) lace = smoothstep(.52, .78, fbm(vec2(p.x*.9, p.y*1.6 - uTime*.35))) * smoothstep(2.6, 0., d);
          if (d > 0.) {
            float crest = pow(.5+.5*sin((p.y - uTime*.9 + .6*edge(p.x*1.3))*2.4), 30.) * smoothstep(0., 3.5, d);
            if (crest > .002) swell = crest * (.18 + .22*fbm(p*.6 + uTime*.1));
          } else if (p.y < uReach + .4 && uRecede < 1.) {
            wake = smoothstep(.62, .9, fbm(p*vec2(1.1, 2.4) + 3.)) * smoothstep(uReach+.4, uReach-1.5, p.y) * smoothstep(-.4, .9, -d) * .35 * (1.-uRecede);
          }
          return clamp(band + lace + swell + wake, 0., 1.) * uTide;
        }
        void main(){
          vec2 p = vP.xz;
          // once the shore has become the workshop floor, skip the sand, the water and the sun
          if (uBoard > .999) {
            vec3 floorCol = uGround * (.92 + .16*fbm3(p*.7)) + (hash(p*211.)-.5)*.02;
            gl_FragColor = vec4(uSea > .001 ? mix(floorCol, seaCol(p, uGround, uTime), uSea) : floorCol, 1.);
            return;
          }
          float fz = uFront + edge(p.x);
          float water = smoothstep(fz-.06, fz+.06, p.y) ; water = 1. - water;   // 1 where p.y < front
          // sand: near-black, grainy, with sparse pale grains
          float grain = hash(floor(p*55.)) ;
          float tone = fbm(p*.18) * .5 + fbm(p*2.1)*.25;
          vec3 col = vec3(.052,.048,.043) * (.75 + .5*tone) + vec3(.06,.055,.05)*smoothstep(.93,1.,grain) + (hash(p*331.7)-.5)*.018;
          // wet sand left by the backwash
          float wet = step(fz, p.y) * smoothstep(uReach+.25, uReach-2.2, p.y) * uTide;
          col *= 1. - wet*.42;
          if (wet > .001) col += wet * .05 * pow(fbm(p*vec2(.6,3.)+uTime*.05), 3.);
          // the sea
          if (water * uTide > .001) col = mix(col, vec3(.018,.021,.024) + .012*fbm(p*.5+uTime*.08), water * uTide);
          // digital foam: a lattice of dots whose size follows foam intensity
          if (uTide > .001) {
            float cell = .085;
            vec2 g = p/cell; vec2 id = floor(g); vec2 f = fract(g)-.5;
            float I = foamAt((id+.5)*cell);
            I *= .75 + .5*hash(id);
            float r = .48*sqrt(I);
            float dotm = smoothstep(r+.09, r-.09, length(f)) * step(.04, I);
            float line = exp(-abs(fz - p.y)*40.) * uTide * (1.-uRecede*.6);
            col = mix(col, vec3(.95,.94,.9), clamp(dotm*.92 + line*.75, 0., 1.));
          }
          // the sun of chapter II: a warm drying light that sweeps across
          float sun = exp(-pow((p.x - uSunX)/5.5, 2.)) * uSun;
          col += vec3(.20,.13,.06) * sun * (.6 + .4*tone);
          col += vec3(.03,.02,.01) * smoothstep(uSunX, uSunX-6., p.x) * uSun;
          // later chapters: the shore darkens into the workshop floor, and at the end into a sea
          if (uBoard > .001) col = mix(col, uGround * (.92 + .16*fbm(p*.7)) + (hash(p*211.)-.5)*.02, uBoard);
          if (uSea > .001) col = mix(col, seaCol(p, uGround, uTime), uSea);
          gl_FragColor = vec4(col, 1.);
        }`,
    })
  );
  // drawn after the other opaque things (shells, the relief), so the depth test skips every sand pixel they cover
  sand.renderOrder = 10;
  scene.add(sand);

  // ───────────────────────── shells (instanced reliefs)
  const shellU = {
    uRgb: { value: null },
    uDepth: { value: null },
    uRecon: { value: null },
    uAtlas: { value: new THREE.Vector2(D.cols, D.rows) },
    uInset: { value: 0.6 / D.cell },
    uExag: { value: EXAG },
    uLight: { value: new THREE.Vector3(-0.55, 0.72, -0.42).normalize() },
    uReveal: { value: 0 },
    uValShow: { value: 0 },
  };
  // aState: alpha, dried, relief, base   aB: rebuilt by the network (chapter III), held out, —, —
  const SHELL_VS = `
    uniform sampler2D uDepth, uRecon; uniform vec2 uAtlas; uniform float uInset, uExag;
    attribute vec2 aCell; attribute vec4 aState, aB;
    varying vec2 vAuv, vUv; varying vec3 vFlat; varying vec4 vState, vB;
    void main(){
      vec2 l = mix(vec2(uInset), vec2(1.-uInset), uv);
      vAuv = vec2((aCell.x + l.x)/uAtlas.x, 1. - (aCell.y + 1. - l.y)/uAtlas.y);
      vUv = uv; vState = aState; vB = aB;
      float d = mix(texture2D(uDepth, vAuv).r, texture2D(uRecon, vAuv).r, aB.x);
      float h = (aState.w*6. + aState.z*18.*d) * .01 * uExag;
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
      vFlat = w.xyz;
      w.y += h;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const shellMat = new THREE.ShaderMaterial({
    uniforms: shellU,
    vertexShader: SHELL_VS,
    fragmentShader: `
      ${GLSL_NOISE}
      uniform sampler2D uRgb, uDepth, uRecon; uniform float uExag, uReveal, uValShow; uniform vec3 uLight;
      varying vec2 vAuv, vUv; varying vec3 vFlat; varying vec4 vState, vB;
      void main(){
        vec4 dm = texture2D(uDepth, vAuv);
        float m = mix(dm.a, 1., vB.x);                                    // the network rebuilds the whole square
        float frame = step(.455, max(abs(vUv.x - .5), abs(vUv.y - .5))) * vB.y * uValShow;
        if (m < .45 && frame < .5) discard;
        if (hash(gl_FragCoord.xy) > vState.x) discard;                  // dithered arrival
        if (uReveal > 0. && revealField(vFlat.xz) < uReveal*1.5 - .12) discard; // fused into the relief
        float d = mix(dm.r, texture2D(uRecon, vAuv).r, vB.x);
        float h = (vState.w*6. + vState.z*18.*d) * .01 * uExag;
        vec3 P = vec3(vFlat.x, vFlat.y + h, vFlat.z);
        vec3 n = normalize(cross(dFdx(P), dFdy(P))); if (n.y < 0.) n = -n;
        vec3 photo = texture2D(uRgb, vAuv).rgb / max(dm.a, .5);
        vec3 bone = mix(vec3(.14,.125,.11), vec3(.95,.925,.865), pow(d, .85));
        vec3 base = mix(photo, bone, vState.y);
        float ndl = max(dot(n, uLight), 0.);
        float lit = mix(1., .38 + .82*ndl, clamp(vState.z*1.3, 0., 1.));
        gl_FragColor = vec4(mix(base * lit, vec3(.72,.24,.14), frame), 1.);
      }`,
  });
  const shellGeo = new THREE.PlaneGeometry(1, 1, 32, 32).rotateX(-Math.PI / 2); // a shell is rarely over 100 px on screen
  const aCell = new Float32Array(N * 2);
  D.shells.forEach((s, i) => {
    aCell[i * 2] = i % D.cols;
    aCell[i * 2 + 1] = Math.floor(i / D.cols);
  });
  const cellAttr = new THREE.InstancedBufferAttribute(aCell, 2);
  const stateArr = new Float32Array(N * 4);
  const stateAttr = new THREE.InstancedBufferAttribute(stateArr, 4).setUsage(THREE.DynamicDrawUsage);
  const bArr = new Float32Array(N * 4);
  D.shells.forEach((s, i) => (bArr[i * 4 + 1] = s.val ? 1 : 0));
  const bAttr = new THREE.InstancedBufferAttribute(bArr, 4).setUsage(THREE.DynamicDrawUsage);
  shellGeo.setAttribute("aCell", cellAttr);
  shellGeo.setAttribute("aState", stateAttr);
  shellGeo.setAttribute("aB", bAttr);
  const shells = new THREE.InstancedMesh(shellGeo, shellMat, N);
  shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shells.frustumCulled = false;
  shells.renderOrder = 2;
  scene.add(shells);

  // soft cast shadows: the same instances, mask sampled from a blurry mip and pushed away from the light
  const shadowGeo = new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
  shadowGeo.setAttribute("aCell", cellAttr);
  shadowGeo.setAttribute("aState", stateAttr);
  shadowGeo.setAttribute("aB", bAttr);
  const shadows = new THREE.InstancedMesh(
    shadowGeo,
    new THREE.ShaderMaterial({
      uniforms: shellU,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform vec2 uAtlas; uniform float uInset; uniform vec3 uLight;
        attribute vec2 aCell; attribute vec4 aState, aB; varying vec2 vAuv; varying vec4 vState, vB; varying vec3 vW;
        void main(){
          vec2 l = mix(vec2(uInset), vec2(1.-uInset), uv);
          vAuv = vec2((aCell.x + l.x)/uAtlas.x, 1. - (aCell.y + 1. - l.y)/uAtlas.y);
          vState = aState; vB = aB;
          vec4 w = modelMatrix * instanceMatrix * vec4(position*1.06, 1.);
          vec4 c = modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
          float lift = c.y + .06 + aState.z*.18;
          w.xz -= uLight.xz / uLight.y * lift;
          w.y = .004;
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        ${GLSL_NOISE}
        uniform sampler2D uDepth; uniform float uReveal; varying vec2 vAuv; varying vec4 vState, vB; varying vec3 vW;
        void main(){
          float m = mix(texture2D(uDepth, vAuv, 2.6).a, 1., vB.x);
          if (uReveal > 0. && revealField(vW.xz) < uReveal*1.5 - .12) discard;
          gl_FragColor = vec4(0., 0., 0., m * .62 * vState.x);
        }`,
    }),
    N
  );
  shadows.instanceMatrix = shells.instanceMatrix;
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;
  scene.add(shadows);

  // chapter III: the line the tray passes through; past it, each shell is shown as the network rebuilds it
  const scan = new THREE.Group();
  const scanCore = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 17.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf3efe6, transparent: true, depthWrite: false }));
  const scanGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 17.4).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { uO: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ float g = exp(-pow((vUv.x-.5)*7., 2.)) * smoothstep(0., .04, vUv.y) * smoothstep(1., .96, vUv.y); gl_FragColor = vec4(vec3(.95,.9,.8) * g * .35 * uO, 1.); }`,
  }));
  scan.add(scanGlow, scanCore);
  scanCore.renderOrder = 4; scanGlow.renderOrder = 4;
  scene.add(scan);

  // ───────────────────────── the finished relief: additive height field rendered on the GPU
  // free: islands only (z = Σ 18·depth), standing in a sea. grid: each tile carries its own 6 mm base.
  const BOARD = D.freeWidthMm / 100; // 21 units
  const RT_RES = 1024;
  const heightRT = new THREE.WebGLRenderTarget(RT_RES, RT_RES, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const rtScene = new THREE.Scene();
  const rtCam = new THREE.OrthographicCamera(-BOARD / 2, BOARD / 2, BOARD / 2, -BOARD / 2, 0.1, 20);
  rtCam.position.set(0, 10, 0);
  rtCam.up.set(0, 0, -1);
  rtCam.lookAt(0, 0, 0);
  const addBlend = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false };
  const rtShellGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  rtShellGeo.setAttribute("aCell", cellAttr);
  const rtShellState = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
  rtShellGeo.setAttribute("aGrid", rtShellState);
  const rtShells = new THREE.InstancedMesh(
    rtShellGeo,
    new THREE.ShaderMaterial({
      uniforms: { ...shellU },
      ...addBlend,
      vertexShader: `
        uniform vec2 uAtlas; uniform float uInset; attribute vec2 aCell; attribute float aGrid; varying vec2 vAuv; varying float vGrid;
        void main(){
          vec2 l = mix(vec2(uInset), vec2(1.-uInset), uv);
          vAuv = vec2((aCell.x + l.x)/uAtlas.x, 1. - (aCell.y + 1. - l.y)/uAtlas.y);
          vGrid = aGrid;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.);
        }`,
      fragmentShader: `
        uniform sampler2D uDepth; varying vec2 vAuv; varying float vGrid;
        void main(){
          vec4 d = texture2D(uDepth, vAuv, -1.);
          // r: height in mm. g: tile coverage (grid only). b: shell coverage
          gl_FragColor = vec4(${D.reliefMm.toFixed(1)}*d.r*smoothstep(.25, .75, d.a) + ${D.baseMm.toFixed(1)}*vGrid, vGrid, d.a, 0.);
        }`,
    }),
    N
  );
  rtShells.frustumCulled = false;
  rtScene.add(rtShells);

  // the blurs the finishes need depend only on the height field, so they are taken once per redraw, not per pixel per frame
  // r: height blurred at 4 texels, g: at 14, b: shell coverage near the coast (9 and 20), a: coverage at 7
  const blurRT = new THREE.WebGLRenderTarget(RT_RES, RT_RES, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  const blurScene = new THREE.Scene();
  const blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  blurScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uH: { value: heightRT.texture }, uTexel: { value: 1 / RT_RES } },
    depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      uniform sampler2D uH; uniform float uTexel; varying vec2 vUv;
      vec4 T(vec2 o){ return texture2D(uH, vUv + o*uTexel); }
      vec4 ring(float r){ return (T(vec2(r,0))+T(vec2(-r,0))+T(vec2(0,r))+T(vec2(0,-r))+T(vec2(r,r)*.7)+T(vec2(-r,r)*.7)+T(vec2(r,-r)*.7)+T(vec2(-r,-r)*.7))*.125; }
      void main(){ gl_FragColor = vec4(ring(4.).r, ring(14.).r, ring(9.).b*.6 + ring(20.).b*.4, ring(7.).b); }`,
  })));
  function drawHeight() {
    renderer.setRenderTarget(heightRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(rtScene, rtCam);
    renderer.setRenderTarget(blurRT);
    renderer.render(blurScene, blurCam);
    renderer.setRenderTarget(null);
  }

  // in the order they are shown; id is the shader's index
  const FINISHES = [
    { id: 3, name: "Contour", text: "Read as a chart of islands: a line for every 2 mm of rise, and a heavier one every 10 mm.", bg: [0.045, 0.047, 0.05], paper: false },
    { id: 2, name: "Line", text: "Pen and sepia, the way an engraver draws a plate: an outline, the ribs, and hatching for shade.", bg: [0.93, 0.91, 0.86], paper: true },
    { id: 4, name: "Plaster", text: "A plaster cast, white and patient. All colour has gone to shadow.", bg: [0.16, 0.165, 0.175], paper: false },
    { id: 0, name: "Fossil", text: "Pressed into dark stone and freed with a groove, the way a preparator works a fossil out of slate.", bg: [0.16, 0.152, 0.137], paper: false },
    { id: 5, name: "Nacre", text: "Mother-of-pearl set in black lacquer, as shell is returned to shell.", bg: [0.025, 0.022, 0.02], paper: false },
    { id: 1, name: "Rubbing", text: "Gyotaku: Prussian ink dabbed over damp cotton. Only what stands proud takes the colour.", bg: [0.925, 0.905, 0.855], paper: true },
  ];

  const terrU = {
    uH: { value: heightRT.texture },
    uB: { value: blurRT.texture },
    uExag: { value: EXAG },
    uTexel: { value: 1 / RT_RES },
    uWorld: { value: BOARD },
    uLight: shellU.uLight,
    uReveal: { value: 0 },
    uFinA: { value: 3 },
    uFinB: { value: 3 },
    uWipe: { value: 0 },
    uGrid: { value: 0 },
    uSeaBase: sandU.uGround,
    uTime: sandU.uTime,
  };
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD, BOARD, 360, 360).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: terrU,
      vertexShader: `
        uniform sampler2D uH; uniform float uExag, uTexel;
        varying vec2 vUv; varying vec3 vP;
        void main(){
          vUv = uv;
          // a light blur, so the steep walls of each island do not break into spikes between vertices
          vec2 o = vec2(uTexel*1.3, 0.);
          float h = (2.*texture2D(uH, uv).r + texture2D(uH, uv + o).r + texture2D(uH, uv - o).r + texture2D(uH, uv + o.yx).r + texture2D(uH, uv - o.yx).r) / 6.;
          vec3 p = position; p.y = h * .01 * uExag + .002;
          vec4 w = modelMatrix * vec4(p, 1.);
          vP = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        ${GLSL_NOISE}
        ${GLSL_SEA}
        uniform sampler2D uH, uB; uniform float uExag, uTexel, uWorld, uReveal, uFinA, uFinB, uWipe, uGrid, uTime; uniform vec3 uLight, uSeaBase;
        varying vec2 vUv; varying vec3 vP;
        vec4 T(vec2 o){ return texture2D(uH, vUv + o*uTexel); }
        float H(vec2 o){ return T(o).r; }
        float h, hb, sh, ao, cav, lap; vec3 n, V; vec4 bl;
        float blurAt(float r){ return (H(vec2(r,0))+H(vec2(-r,0))+H(vec2(0,r))+H(vec2(0,-r))+H(vec2(r,r)*.7)+H(vec2(-r,r)*.7)+H(vec2(r,-r)*.7)+H(vec2(-r,-r)*.7))*.125; }

        vec3 fossil(){
          vec2 p = vP.xz;
          // dark slate with mottled grains, and a prepared groove around every shell
          vec3 slate = vec3(.17,.16,.145) * (.8 + .35*fbm(p*3.5)) + .05*smoothstep(.6,.8, fbm(p*11.));
          vec3 shellStone = vec3(.6,.58,.5) * (.78 + .35*fbm(p*14. + 2.));
          float ring = clamp(bl.a*1.6, 0., 1.) * (1. - smoothstep(.02, .3, sh));
          vec3 col = mix(slate, shellStone, smoothstep(.05, .35, sh));
          col *= 1. - ring*.55;
          return col * (.35 + .85*max(dot(n, uLight), 0.)) * ao * (1. - cav*.3);
        }
        vec3 rubbing(){
          vec2 p = vP.xz;
          float weave = .5 + .25*sin(p.x*260.) + .25*sin(p.y*260.);
          vec3 cloth = vec3(.935,.915,.865) * (.97 + .03*weave - .03*fbm(p*.8));
          float proud = smoothstep(-.1, 1.6, h - blurAt(3.))*.8 + smoothstep(.3, 4., h - blurAt(10.))*.45;
          float dab = .55 + .45*fbm(p*7.5);                          // the pad leaves uneven ink
          float ink = clamp(proud*dab*1.2, 0., 1.) * smoothstep(.25, .6, n.y) * smoothstep(.02, .2, sh);
          ink *= smoothstep(.3, .5, vnoise(p*130.)*.35 + .45 + weave*.1);
          return mix(cloth, vec3(.12,.23,.33), ink) * (.95 + .05*max(dot(n, uLight), 0.));
        }
        vec3 lineArt(){
          vec2 p = vP.xz;
          vec3 paper = vec3(.94,.92,.865) * (.975 + .04*fbm(p*vec2(24.,3.)));
          vec2 o = vec2(1.5, 0.);
          float sgrad = length(vec2(T(o).b - T(-o).b, T(o.yx).b - T(-o.yx).b));
          float outline = smoothstep(.18, .45, sgrad);                    // the silhouette of each shell
          float crease = smoothstep(1.6, 3.2, abs(lap)) * .6;             // ribs and lips
          float shade = 1. - max(dot(n, uLight), 0.);
          vec2 q = p * 30.;
          float h1 = 1. - smoothstep(.06, .16, abs(fract(q.x*.7 + q.y*.7) - .5));
          float h2 = 1. - smoothstep(.06, .16, abs(fract(q.x*.7 - q.y*.7) - .5));
          float hatch = (h1*smoothstep(.45,.6,shade) + h2*smoothstep(.65,.8,shade)) * smoothstep(.1, .4, sh);
          float level = smoothstep(.3, .7, n.y);                          // walls keep a light wash, not a block of ink
          float ink = clamp(outline + (crease + hatch*.55) * level, 0., 1.) * (.7 + .3*vnoise(p*60.));
          return mix(paper * mix(.86, 1., level), vec3(.29,.2,.13), ink);
        }
        vec3 contour(){
          vec3 bg = vec3(.045,.047,.05) * (.85 + .3*fbm3(vP.xz*.6));
          float hs = .55 + .45*max(dot(n, uLight), 0.);
          float f = hb / 2., F = hb / 10.;
          float minor = 1. - smoothstep(0., fwidth(f)*1.25, .5 - abs(fract(f) - .5));
          float major = 1. - smoothstep(0., fwidth(F)*2.2, .5 - abs(fract(F) - .5));
          minor *= step(.4, hb); major *= step(.4, hb);
          vec3 col = bg * hs;
          col = mix(col, vec3(.86,.8,.68), minor*.55);
          col = mix(col, vec3(.98,.95,.88), major);
          float coast = 1. - smoothstep(0., fwidth(hb)*1.5, abs(hb - .3));  // the shoreline of each island
          return mix(col, vec3(.98,.95,.88), coast*.8);
        }
        vec3 plaster(){
          vec3 c = vec3(.94,.925,.89) * (.97 + .04*fbm(vP.xz*16.));
          float ndl = dot(n, uLight) * .5 + .5;                    // wrapped light, chalky
          return c * (.18 + .9*pow(ndl, 1.4)) * mix(1., ao, .85) * (1. - cav*.25);
        }
        vec3 nacre(){
          vec2 p = vP.xz;
          vec3 R = reflect(-V, n);
          float spec = pow(max(dot(R, uLight), 0.), 60.);
          float fres = pow(1. - max(dot(n, V), 0.), 4.);
          vec3 lacquer = vec3(.05,.032,.026) * (.85 + .3*fbm(p*3.)) + spec*vec3(.55,.5,.45) + fres*vec3(.12,.1,.09);
          float t = dot(n, V)*1.7 + fbm(p*5.5 + h*.05)*1.6 + fbm(p*vec2(28.,3.))*.35 + h*.04;
          vec3 irid = .62 + .38*cos(6.2832*(t + vec3(0., .33, .67)));
          irid = mix(irid, vec3(1.), .25) * (.45 + .75*max(dot(n, uLight), 0.)) + spec*.8;
          return mix(lacquer, irid * mix(.7, 1., ao), smoothstep(.04, .25, sh));
        }
        vec3 finish(float k){
          if (k < .5) return fossil();
          if (k < 1.5) return rubbing();
          if (k < 2.5) return lineArt();
          if (k < 3.5) return contour();
          if (k < 4.5) return plaster();
          return nacre();
        }
        void main(){
          // once fully fused the reveal pattern (5 noise octaves a pixel) no longer matters: it never exceeds 1.23 < thr
          float thr = uReveal*1.5 - .12;
          float rv = uReveal < .999 ? revealField(vP.xz) : 0.;
          if (rv > thr) discard;
          vec4 t0 = T(vec2(0));
          h = t0.r;
          hb = h - 6.*t0.g;                                         // rise above the tile (grid) or the sea (free)
          sh = clamp(t0.b, 0., 1.);
          float wsc = .01*uExag, tw = uWorld*uTexel;
          float dx = (H(vec2(1,0)) - H(vec2(-1,0))) * wsc / (2.*tw);
          float dv = (H(vec2(0,1)) - H(vec2(0,-1))) * wsc / (2.*tw);
          n = normalize(vec3(-dx, 1., dv));
          V = normalize(cameraPosition - vP);
          bl = texture2D(uB, vUv);
          float b1 = bl.r, b2 = bl.g;
          ao = clamp(1. - max(b1 - h, 0.)*.09 - max(b2 - h, 0.)*.05, .35, 1.);
          cav = clamp((b1 - h)*.25, 0., 1.);
          lap = H(vec2(1,0)) + H(vec2(-1,0)) + H(vec2(0,1)) + H(vec2(0,-1)) - 4.*h;
          float land = max(smoothstep(.15, .8, h), smoothstep(.3, .7, t0.g));
          float near = bl.b;
          float nearW = fwidth(near*7.);  // derivatives taken before any branch
          // skip the finish in open sea far from any shell, and the sea deep inside the islands: in both places the
          // skipped colour has no weight, and the boundaries sit well away from the coasts where lines are drawn
          bool farSea = near < .001 && land < .001;
          bool inland = max(smoothstep(.6, 1.6, h), smoothstep(.7, 1., t0.g)) > .999;
          vec3 col = vec3(0.);
          if (!farSea) {
            if (uWipe <= 0.001) col = finish(uFinA);
            else if (uWipe >= .999) col = finish(uFinB);
            else {
              // a polishing pass sweeps diagonally across the work
              float e = (vP.x*.8 - vP.z*.6)/uWorld + .5 + (fbm(vP.xz*.9)-.5)*.08;
              float front = uWipe*1.3 - .15;
              col = mix(finish(uFinA), finish(uFinB), smoothstep(front + .012, front - .012, e));
              col += vec3(1.,.93,.8) * exp(-abs(e - front)*140.) * .55;
            }
          }
          // the sea between the islands, with coastal ripples that echo each shore like a chart
          float lum = dot(uSeaBase, vec3(.3,.59,.11));
          if (!inland) {
            float ring = fract(near*7.);
            float coastal = (1. - smoothstep(0., nearW*1.4, min(ring, 1. - ring))) * smoothstep(.0, .05, near) * (1. - smoothstep(.25, .5, near));
            vec3 sea = seaCol(vP.xz, uSeaBase, uTime);
            sea = mix(sea, lum > .5 ? uSeaBase * vec3(.6,.62,.66) : uSeaBase + vec3(.12,.13,.14), coastal * .6);
            col = mix(sea, col, land);
          }
          // grid: a fine rule around the square wall of tiles
          vec2 e2 = abs(vP.xz);
          float frameD = abs(max(e2.x, e2.y) - 9.12);
          col = mix(col, lum > .5 ? uSeaBase * .45 : vec3(.85,.82,.76), (1. - smoothstep(0., fwidth(vP.x)*1.5 + .005, frameD)) * uGrid * .8);
          // the edge of the fusing front glows like wet sand
          col += vec3(.9,.8,.6) * smoothstep(.05, 0., thr - rv) * step(uReveal, .999) * .6 * land;
          gl_FragColor = vec4(col, 1.);
        }`,
    })
  );
  terrain.renderOrder = 3;
  terrain.visible = false;
  scene.add(terrain);

  // ───────────────────────── per-shell poses
  // the shore: dart-throwing so shells rarely sit on one another
  const BEACH_W = 25, BEACH_Z0 = -7.2, BEACH_Z1 = 6.6;
  const shell = D.shells.map((s, i) => ({
    i,
    s,
    bx: 0, bz: 0, brot: 0,
    fx: s.fx / 100, fz: -s.fy / 100,
    gx: (-850 + 100 * s.gc) / 100, gz: (100 * s.gr - 850) / 100,
    tx: 0, tz: 0, px: 0, pz: 0, rank: 0,
    d1: rand(), d2: rand(), d3: rand(),
    deposited: false, carried: false, arriveT: -1,
  }));
  {
    const placed = [];
    for (const sh of shell) {
      let best = null, bestD = -1;
      for (let k = 0; k < 40; k++) {
        const x = (rand() - 0.5) * BEACH_W, z = lerp(BEACH_Z0, BEACH_Z1, Math.pow(rand(), 0.8));
        let dmin = 1e9;
        for (const q of placed) dmin = Math.min(dmin, Math.hypot(q[0] - x, q[1] - z));
        if (dmin > bestD) { bestD = dmin; best = [x, z]; }
        if (dmin > 1.05) break;
      }
      placed.push(best);
      sh.bx0 = sh.bx = best[0]; sh.bz0 = sh.bz = best[1]; sh.brot = rand() * Math.PI * 2;
    }
  }
  // arrival order: the shore fills from the waterline downwards, loosely
  const queue = shell.slice().sort((a, b) => b.bz + a.d1 * 6 - (a.bz + b.d1 * 6));

  // six piles: the archetype at the centre, then its neighbours by t-SNE distance
  const GROUPS = ["Spires", "Ovals", "Rounds", "Flats", "Open Mouths", "Coils"];
  const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
  const piles = GROUPS.map((name, k) => ({ name, k, members: [], cx: 0, cz: 0, r: 0 }));
  for (const sh of shell) piles[sh.s.cluster - 1].members.push(sh);
  for (const p of piles) {
    const arche = (D.archetypes[p.k + 1] || []).map((id) => id - 1);
    const ref = shell[arche[0]] || p.members[0];
    p.members.sort((a, b) => {
      const ia = arche.indexOf(a.i), ib = arche.indexOf(b.i);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return Math.hypot(a.fx - ref.fx, a.fz - ref.fz) - Math.hypot(b.fx - ref.fx, b.fz - ref.fz);
    });
    p.members.forEach((sh, j) => (sh.rank = j));
    p.r = 0.5 * Math.sqrt(p.members.length) + 0.5;
  }
  let beachZMax = BEACH_Z1, portrait = false;
  function layoutPiles(aspect) {
    portrait = aspect < 0.9;
    // on a tall screen the shore is folded into a narrower, longer strip
    for (const sh of shell) {
      sh.bx = portrait ? sh.bx0 * 0.46 : sh.bx0;
      sh.bz = portrait ? sh.bz0 * 1.25 + 0.4 : sh.bz0;
      // the tray of chapter III
      const cols = portrait ? 12 : 20, rows = Math.ceil(N / cols);
      sh.tx = ((sh.i % cols) - (cols - 1) / 2) * 1.08;
      sh.tz = (Math.floor(sh.i / cols) - (rows - 1) / 2) * 1.08;
    }
    beachZMax = portrait ? BEACH_Z1 * 1.25 + 0.4 : BEACH_Z1;
    piles.forEach((p, k) => {
      const col = portrait ? k % 2 : k % 3, row = portrait ? Math.floor(k / 2) : Math.floor(k / 3);
      p.cx = portrait ? (col - 0.5) * 10.4 : (col - 1) * 11.2;
      p.cz = portrait ? (row - 1) * 11.4 : (row - 0.5) * 12.2 - 0.6;
      p.members.forEach((sh, j) => {
        const r = 0.5 * Math.sqrt(j + 0.35), a = j * 2.39996 + k;
        sh.px = p.cx + Math.cos(a) * r;
        sh.pz = p.cz + Math.sin(a) * r;
        sh.prot = (sh.d2 - 0.5) * 0.8;
      });
    });
  }

  // pile labels in HTML
  const labelBox = $("#pile-labels");
  const labelEls = piles.map((p) => {
    const el = document.createElement("div");
    el.className = "pile-label";
    el.innerHTML = `<b>${ROMAN[p.k]}.</b><span>${p.name}</span><small>${p.members.length} shells</small>`;
    labelBox.appendChild(el);
    return el;
  });
  const scanLabel = document.createElement("div");
  scanLabel.className = "pile-label scan-label";
  scanLabel.innerHTML = `<b>64</b><small>numbers</small>`;
  labelBox.appendChild(scanLabel);

  // the archipelago's names, shown at the bench in the free arrangement only. Each group's largest island (shells
  // within 1.3 units of one another) carries its name, anchored on the member nearest the island's centre so the
  // pin lands on land. A second island of 15 or more gets a minor name.
  const ISLES = [
    { name: "The Spire Marches", text: "Tall, narrow towers wound whorl on whorl, all leaning the same way." },
    { name: "Isle of Ovalness", text: "Smooth, egg-round backs: cowries and cones, and even spined conchs read as ovals here." },
    { name: "The Round Realm", text: "Fans and hearts ribbed from hinge to rim: the scallops, cockles and clams.", minor: "The Far Rounds" },
    { name: "The Low Country", text: "Broad and barely raised: abalone, limpet and drupe pressed close to the ground." },
    { name: "The Gaping Coast", text: "Shells seen mouth-first, their wide openings turned up to the sky." },
    { name: "The Coiled Holds", text: "Snails wound tight as sundials, each spiral turning back on itself." },
  ];
  function islands(members, reach) {
    const pos = (sh) => [sh.fx, sh.fz];
    const left = new Set(members), out = [];
    while (left.size) {
      const first = left.values().next().value, isle = [first], stack = [first];
      left.delete(first);
      while (stack.length) {
        const [ax, az] = pos(stack.pop());
        for (const o of [...left]) {
          const [bx, bz] = pos(o);
          if (Math.hypot(ax - bx, az - bz) < reach) { left.delete(o); isle.push(o); stack.push(o); }
        }
      }
      out.push(isle);
    }
    out.sort((a, b) => b.length - a.length);
    return out.map((isle) => {
      const cx = isle.reduce((t, sh) => t + pos(sh)[0], 0) / isle.length, cz = isle.reduce((t, sh) => t + pos(sh)[1], 0) / isle.length;
      const mid = isle.reduce((m, sh) => (Math.hypot(pos(sh)[0] - cx, pos(sh)[1] - cz) < Math.hypot(pos(m)[0] - cx, pos(m)[1] - cz) ? sh : m));
      return { size: isle.length, at: pos(mid) };
    });
  }
  const isles = [];
  ISLES.forEach((d, k) => {
    const members = shell.filter((sh) => sh.s.cluster === k + 1);
    const free = islands(members, 1.3);
    const make = (cls, html) => {
      const el = document.createElement("div");
      el.className = cls;
      el.innerHTML = html;
      el.addEventListener("click", () => {
        const open = !el.classList.contains("open");
        isles.forEach((o) => o.el.classList.remove("open"));
        el.classList.toggle("open", open);
      });
      labelBox.appendChild(el);
      return el;
    };
    isles.push({
      el: make("isle", `<b>${ROMAN[k]}</b><span>${d.name}</span><em>${d.text}<small>${members.length} shells</small></em>`),
      at: free[0].at,
    });
    if (d.minor && free[1] && free[1].size >= 15)
      isles.push({
        el: make("isle minor", `<span>${d.minor}</span><em>A second shore of the same: ${free[1].size} shells that settled apart.</em>`),
        at: free[1].at,
      });
  });
  const SVG = "http://www.w3.org/2000/svg";
  const leaderSvg = document.createElementNS(SVG, "svg");
  leaderSvg.setAttribute("class", "isles-leaders");
  labelBox.prepend(leaderSvg);
  for (const isle of isles) {
    isle.line = leaderSvg.appendChild(document.createElementNS(SVG, "line"));
    isle.pin = leaderSvg.appendChild(document.createElementNS(SVG, "circle"));
    isle.pin.setAttribute("r", "3");
  }
  let namesOn = false, keepOut = [], keepOutAt = 0; // off until the visitor asks for them
  const hit = (a, b, pad = 0) => a.l < b.r + pad && a.r + pad > b.l && a.t < b.b + pad && a.b + pad > b.t;
  // each name looks for open water near its island: the screen is mapped in 16 px cells marked where shells lie,
  // spots on rings around the island are scored by the shell they would cover, their distance, and any clash with
  // the copy, the controls or a name already placed; the best spot wins, and a name only moves when a spot is
  // clearly better, so names do not jump while the work turns. A line leads from each name back to its island.
  const CELL = 16;
  let occ = new Uint8Array(0), occW = 0, occH = 0;
  function mapShells() {
    occW = Math.ceil(innerWidth / CELL);
    occH = Math.ceil(innerHeight / CELL);
    if (occ.length !== occW * occH) occ = new Uint8Array(occW * occH);
    else occ.fill(0);
    proj.set(0, 0.2, 0).project(camera);
    const ox = proj.x, oy = proj.y;
    proj.set(0.55, 0.2, 0).project(camera);
    const r = Math.max(6, Math.hypot((proj.x - ox) * innerWidth, (proj.y - oy) * innerHeight) / 2); // a shell's radius on screen
    const rc = Math.ceil(r / CELL);
    for (const sh of shell) {
      proj.set(sh.fx, 0.2, sh.fz).project(camera);
      const px = ((proj.x + 1) / 2) * innerWidth, py = ((1 - proj.y) / 2) * innerHeight;
      const ci = Math.floor(px / CELL), cj = Math.floor(py / CELL);
      for (let j = cj - rc; j <= cj + rc; j++) {
        if (j < 0 || j >= occH) continue;
        for (let i = ci - rc; i <= ci + rc; i++) {
          if (i < 0 || i >= occW) continue;
          if (Math.hypot((i + 0.5) * CELL - px, (j + 0.5) * CELL - py) <= r + CELL * 0.5) occ[j * occW + i] = 1;
        }
      }
    }
  }
  function shellUnder(b) {
    let n = 0;
    for (let j = Math.max(0, Math.floor(b.t / CELL)); j <= Math.min(occH - 1, Math.floor(b.b / CELL)); j++)
      for (let i = Math.max(0, Math.floor(b.l / CELL)); i <= Math.min(occW - 1, Math.floor(b.r / CELL)); i++) n += occ[j * occW + i];
    return n;
  }
  const RINGS_WIDE = [0, 70, 130, 200, 280], RINGS_NARROW = [0, 40, 80, 130];
  function updateIsles(show) {
    const placed = [];
    for (const isle of isles) {
      const on = show && gridMix < 0.5; // the names belong to the free arrangement; they fade out for the grid
      isle.el.classList.toggle("on", on);
      isle.line.style.display = isle.pin.style.display = "none";
      if (!on) { isle.el.classList.remove("open"); continue; }
      proj.set(isle.at[0], 0.3, isle.at[1]).project(camera);
      if (proj.z > 1) { isle.el.classList.remove("on"); continue; }
      isle.ax = ((proj.x + 1) / 2) * innerWidth;
      isle.ay = ((1 - proj.y) / 2) * innerHeight;
      if (!isle.w) { isle.w = isle.el.offsetWidth; isle.h = isle.el.offsetHeight; } // the names never change size
      placed.push(isle);
    }
    if (!placed.length) return;
    // the areas names must not cover, measured twice a second rather than every frame
    const now = performance.now();
    if (!keepOutAt || now - keepOutAt > 500) {
      const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
      keepOut = [rectOf($("#bench")), rectOf($(".masthead")), rectOf($(".gauge"))];
      const copy = $(".finish-copy.on");
      if (copy) keepOut.push(rectOf(copy.querySelector(".finish-name")), rectOf(copy.querySelector("h2")), rectOf($("#finish-text")));
      keepOutAt = now;
    }
    mapShells();
    const rings = innerWidth < 720 ? RINGS_NARROW : RINGS_WIDE;
    const taken = [];
    const score = (isle, l, t) => {
      const b = { l, r: l + isle.w, t, b: t + isle.h };
      if (l < 8 || t < 8 || b.r > innerWidth - 8 || b.b > innerHeight - 8) return Infinity;
      let s = shellUnder(b) * 10 + Math.hypot(l + isle.w / 2 - isle.ax, t + isle.h / 2 - isle.ay) * 0.15;
      for (const k of keepOut) if (hit(b, k, 10)) s += 1e4;
      for (const k of taken) if (hit(b, k, 8)) s += 1e4;
      return s;
    };
    for (const isle of placed) {
      let best = Infinity, bl = 0, bt = 0;
      for (const d of rings) {
        const steps = d ? 16 : 1;
        for (let a = 0; a < steps; a++) {
          const ang = (a / steps) * Math.PI * 2;
          const l = isle.ax + Math.cos(ang) * d * 1.3 - isle.w / 2, t = isle.ay + Math.sin(ang) * d * 0.8 - isle.h / 2;
          const s = score(isle, l, t);
          if (s < best) { best = s; bl = l; bt = t; }
        }
      }
      // stay put unless the new spot is clearly better; the old spot follows the island as the work turns
      if (isle.dx !== undefined) {
        const kept = score(isle, isle.ax + isle.dx, isle.ay + isle.dy);
        if (kept <= best * 1.25 + 4) { bl = isle.ax + isle.dx; bt = isle.ay + isle.dy; }
      }
      if (best === Infinity && isle.dx === undefined) { bl = clamp(isle.ax - isle.w / 2, 8, innerWidth - isle.w - 8); bt = clamp(isle.ay - isle.h - 30, 8, innerHeight - isle.h - 8); }
      isle.left = bl; isle.top = bt;
      isle.dx = bl - isle.ax; isle.dy = bt - isle.ay;
      taken.push({ l: bl, r: bl + isle.w, t: bt, b: bt + isle.h });
    }
    for (const isle of placed) {
      isle.el.style.transform = `translate(${isle.left.toFixed(1)}px, ${isle.top.toFixed(1)}px)`;
      // the line leaves the name from the point of its box nearest the island
      const sx = clamp(isle.ax, isle.left + 6, isle.left + isle.w - 6), sy = clamp(isle.ay, isle.top + 2, isle.top + isle.h - 2);
      const set = (el, attrs) => { for (const k in attrs) el.setAttribute(k, attrs[k].toFixed(1)); el.style.display = ""; };
      set(isle.line, { x1: sx, y1: sy, x2: isle.ax, y2: isle.ay });
      set(isle.pin, { cx: isle.ax, cy: isle.ay });
    }
  }

  // ───────────────────────── the tide (waves deposit shells)
  const L0_HERO = -4.6;
  const tide = { t: 0, start: 0, period: 6.2, reach: 0, l0: L0_HERO, from: L0_HERO, wet: L0_HERO, batch: [], ph: [0, 0, 0], waves: 0, paused: false };
  let deposited = 0;
  function edgeAt(x) {
    return 0.5 * Math.sin(x * 0.29 + tide.ph[0]) + 0.28 * Math.sin(x * 0.71 + tide.ph[1]) + 0.12 * Math.sin(x * 1.7 + tide.ph[2]);
  }
  function newWave(target, l0) {
    // the new wave starts exactly where the last one drained to, so nothing jumps
    tide.from = tide.waves ? tide.l0 : l0;
    tide.start = tide.t;
    tide.waves++;
    tide.l0 = l0;
    const need = Math.max(0, target - deposited);
    let n = need > 0 ? Math.min(need, Math.max(7, Math.ceil(need * 0.5))) : 0;
    tide.batch = [];
    for (const sh of queue) {
      if (tide.batch.length >= n) break;
      if (!sh.deposited && !sh.carried && sh.bz > l0 + 0.7) tide.batch.push(sh);
    }
    let reach = l0 + 3.5 + rand() * 4.5;
    for (const sh of tide.batch) {
      sh.carried = true;
      reach = Math.max(reach, sh.bz + 0.9 - edgeAt(sh.bx));
    }
    tide.reach = Math.min(reach, beachZMax + 1.2);
    tide.period = need > 60 ? 2.9 : need > 20 ? 4.2 : 6.4;
  }
  function frontNow() {
    const u = (tide.t - tide.start) / tide.period;
    // the foam of a draining wave fades back up gently as the next one gathers, instead of switching on
    if (u < 0.5) return { z: lerp(tide.from, tide.reach, outCubic(u / 0.5)), recede: 1 - smooth(clamp(u / 0.2)), u };
    return { z: lerp(tide.reach, tide.l0, ease((u - 0.5) / 0.5)), recede: (u - 0.5) / 0.5, u };
  }
  // shells brought by a wave are already visible; ones placed directly (fast scrolling) fade in
  function settle(sh, now, fade = false) {
    if (sh.deposited) return;
    sh.deposited = true;
    sh.carried = false;
    sh.arriveT = fade ? now : -1e9;
    deposited++;
  }

  // ───────────────────────── camera choreography
  // phi: tilt from straight down; th: turn about the vertical; w/h: the patch of ground to frame
  const K = (t, phi, th, w, h) => ({ t, phi, th, w, h });
  const KEYS = [
    [0, K([0, 0, 0.8], 0.0, 0, 23, 13.5)],
    [110, K([0, 0, 0.8], 0.0, 0, 23, 13.5)],
    [235, K([0, 0, 0.3], 0.0, 0, 27.5, 15.5)],
    [335, K([0, 0, 1.4], 0.66, -0.34, 20, 12)],
    [400, K([-3, 0, 0.6], 0.45, -0.12, 30, 16)],
    [455, K([-7.4, 0, 0.3], 0.38, 0, 38, 18.5)],
    [540, K([-7.4, 0, 0.3], 0.46, 0.06, 38, 18.5)],
    [600, K([-6.5, 0, 0.4], 0.45, 0.08, 42, 23)],
    [685, K([-7, 0, 0.6], 0.48, 0.08, 44, 25)],
    [735, K([-7, 0, 0.6], 0.5, 0.06, 44, 25)],
    [865, K([-4.2, 0, 0.2], 0.3, 0, 31, 22)],
    [905, K([-4.2, 0, 0.2], 0.3, 0, 31, 22)],
    [990, K([0.4, 0, 0.8], 0.92, -0.6, 17, 13)],
    [1200, K([0, 0, 0.3], 0.7, 0.55, 21, 17)],
  ];
  // phones: a narrower patch of shore, piles stacked in three rows, the board filling the width
  const KEYS_P = [
    [0, K([0, 0, 1.0], 0.0, 0, 11.5, 16)],
    [110, K([0, 0, 1.0], 0.0, 0, 11.5, 16)],
    [235, K([0, 0, 0.6], 0.0, 0, 13, 18)],
    [335, K([0, 0, 1.6], 0.62, -0.3, 10, 12)],
    [400, K([0, 0, 0.6], 0.45, -0.1, 13, 18)],
    [455, K([0, 0, 0], 0.3, 0, 14, 28)],
    [540, K([0, 0, 0], 0.36, 0.04, 14, 28)],
    [685, K([0, 0, 0], 0.42, 0.05, 22, 34)],
    [735, K([0, 0, 0], 0.44, 0.04, 22, 34)],
    [865, K([0, 0, 0.2], 0.3, 0, 23.5, 21.5)],
    [905, K([0, 0, 0.2], 0.3, 0, 23.5, 21.5)],
    [990, K([0.3, 0, 0.6], 0.85, -0.6, 16, 13)],
    [1200, K([0, 0, 0.3], 0.7, 0.55, 20, 16)],
  ];
  function camKey(s) {
    const keys = portrait ? KEYS_P : KEYS;
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (s > keys[i + 1][0]) continue;
      const A = keys[i][1], B = keys[i + 1][1], t = ease(seg(s, keys[i][0], keys[i + 1][0]));
      return K(A.t.map((v, k) => lerp(v, B.t[k], t)), lerp(A.phi, B.phi, t), lerp(A.th, B.th, t), lerp(A.w, B.w, t), lerp(A.h, B.h, t));
    }
    return keys[keys.length - 1][1];
  }
  const view = { dTh: 0, dPhi: 0, zoom: 1, preset: null };
  function placeCamera(s, mx, my) {
    const k = camKey(s);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // on phones the copy fills the lower half, so the work is framed in the upper part of the screen
    let lift = 0, room = 1;
    if (portrait) {
      const inChapters = smooth(seg(s, 70, 118)) * (1 - smooth(seg(s, 895, 950)));
      const inFinish = smooth(seg(s, 895, 950));
      lift = 0.21 * inChapters;
      room = lerp(1, 0.56, inChapters) * (1 - inFinish) + 0.5 * inFinish;
      if (benchOn) room = 0.52;
    }
    if (lift > 0.001) camera.setViewOffset(innerWidth, innerHeight, 0, lift * innerHeight, innerWidth, innerHeight);
    else camera.clearViewOffset();
    const tx = portrait ? 0 : k.t[0]; // on wide screens the work sits right of the copy
    const hEff = k.h * lerp(1, Math.cos(k.phi), 0.6);
    let dist = Math.max(hEff / 2 / (tan * room), k.w / 2 / (tan * camera.aspect)) * 1.04;
    let phi = k.phi + my * 0.035 + view.dPhi;
    let th = k.th + mx * 0.06 + view.dTh;
    if (view.preset === "top") { phi = 0.02; th = 0; }
    phi = clamp(phi, 0, 1.35);
    dist *= view.zoom;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    camera.position.set(tx + dist * sp * Math.sin(th), k.t[1] + dist * cp, k.t[2] + dist * sp * Math.cos(th));
    camera.up.set(-cp * Math.sin(th), sp, -cp * Math.cos(th));
    camera.lookAt(tx, k.t[1], k.t[2]);
    camera.updateMatrixWorld();
  }

  // ───────────────────────── interface state
  let sTarget = 0, sNow = 0;
  let mouseX = 0, mouseY = 0, mxS = 0, myS = 0;
  let gridTarget = 0, gridMix = 0, gridMixDrawn = -1;
  let finishManual = null, wipeAnim = null, finishShown = -1;
  let benchOn = false, captureNext = false;
  const vhPx = () => Math.max(1, innerHeight) / 100;
  addEventListener("scroll", () => (sTarget = scrollY / vhPx()), { passive: true });
  addEventListener("pointermove", (e) => {
    mouseX = (e.clientX / innerWidth) * 2 - 1;
    mouseY = (e.clientY / innerHeight) * 2 - 1;
    hover.x = e.clientX; hover.y = e.clientY; hover.dirty = true;
  });

  $$(".layout-switch button").forEach((b) =>
    b.addEventListener("click", () => setLayout(b.dataset.layout))
  );
  function setLayout(mode) {
    gridTarget = mode === "grid" ? 1 : 0;
    $$(".layout-switch button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.layout === mode)));
    $("#layout-note").textContent =
      mode === "grid"
        ? "Grid: the same shells assigned to an 18 × 18 wall of 100 mm tiles. 300 are occupied and 24 left empty."
        : "Free: an archipelago at the original t-SNE positions. Where shells overlap, their heights add.";
  }
  $$(".finishes button").forEach((b) =>
    b.addEventListener("click", () => {
      const k = +b.dataset.finish;
      const from = currentFinish();
      if (k === from && !wipeAnim) return;
      finishManual = k;
      wipeAnim = { from, to: k, t0: performance.now() };
    })
  );
  $$("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      view.preset = b.dataset.view === "top" ? "top" : null;
      view.dTh = 0; view.dPhi = 0; view.zoom = b.dataset.view === "top" ? 1.02 : 1;
    })
  );
  $("#save").addEventListener("click", () => (captureNext = true));
  $("#tide").addEventListener("click", (e) => {
    tide.paused = !tide.paused;
    e.currentTarget.setAttribute("aria-pressed", String(tide.paused));
    e.currentTarget.textContent = tide.paused ? "Let the tide run" : "Still the tide";
  });
  const notes = $("#notes");
  $("#isle-names").addEventListener("click", (e) => {
    namesOn = !namesOn;
    e.currentTarget.setAttribute("aria-pressed", String(namesOn));
  });
  $("#notes-open").addEventListener("click", () => notes.showModal());
  $("#notes-close").addEventListener("click", () => notes.close());
  notes.addEventListener("click", (e) => { if (e.target === notes) notes.close(); });

  // the training figures, from the data
  {
    const T = D.training;
    $("#n-train").textContent = T.train;
    $("#n-epochs").textContent = T.epochs;
    $("#n-best").textContent = T.best;
    $("#reduction").textContent = `${T.reduction}%`;
    $("#trust").textContent = D.tsneTrust.toFixed(2);
    const tr = T.trainLoss, va = T.valLoss, n = tr.length;
    const all = tr.concat(va), lo = Math.log(Math.min(...all)), hi = Math.log(Math.max(...all));
    const X = (i) => 30 + (i / (n - 1)) * 282, Y = (v) => 10 + (1 - (Math.log(v) - lo) / (hi - lo)) * 80;
    const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    const bx = X(T.best - 1).toFixed(1);
    $("#loss").innerHTML =
      `<path class="ax" d="M30,6V92H312"/>` +
      `<path class="tr" d="${path(tr)}"/><path class="va" d="${path(va)}"/>` +
      `<line class="best" x1="${bx}" x2="${bx}" y1="10" y2="92"/>` +
      `<text x="30" y="106">1</text><text x="312" y="106" text-anchor="end">${n}</text>` +
      `<text x="${+bx - 4}" y="18" text-anchor="end">best · ${T.best}</text>` +
      `<text x="36" y="14">error (log)</text>` +
      `<text class="k-tr" x="312" y="${(Y(tr[n - 1]) + 13).toFixed(1)}" text-anchor="end">training</text>` +
      `<text class="k-va" x="312" y="${(Y(va[n - 1]) - 6).toFixed(1)}" text-anchor="end">held out</text>`;
  }

  // mouse and pen: drag to move through the story, with a little glide on release.
  // wheel, touchpad and touch keep the browser's own scrolling.
  let scrollDrag = null, glide = null;
  const NO_DRAG = "button, a, input, select, textarea, label, dialog, .bench, .gauge, .masthead";
  const DRAG_GAIN = 2.2; // a drag across the full screen height moves 2.2 screens of the story
  addEventListener("pointerdown", (e) => {
    glide = null;
    if (e.pointerType === "touch" || e.button !== 0) return;
    if (benchOn && e.target === canvas) return; // at the bench, dragging turns the work (below)
    if (e.target.closest(NO_DRAG)) return;
    e.preventDefault(); // no text selection while dragging
    scrollDrag = { y: e.clientY, top: scrollY, moved: false, samples: [[performance.now(), e.clientY]] };
    document.body.classList.add("dragging");
  });
  addEventListener("pointermove", (e) => {
    if (!scrollDrag) return;
    if (Math.abs(e.clientY - scrollDrag.y) > 3) scrollDrag.moved = true;
    scrollTo(0, scrollDrag.top - (e.clientY - scrollDrag.y) * DRAG_GAIN);
    const t = performance.now();
    scrollDrag.samples.push([t, e.clientY]);
    while (scrollDrag.samples.length > 2 && t - scrollDrag.samples[0][0] > 90) scrollDrag.samples.shift();
  });
  const endScrollDrag = () => {
    if (!scrollDrag) return;
    const S = scrollDrag.samples, [t0, y0] = S[0], [tl, y1] = S[S.length - 1], t1 = performance.now();
    // px of scroll per ms over the last moments of the drag; none if the pointer was held still before release.
    // capped so a flick glides at most about one and a half screens
    const vMax = (1.5 * innerHeight) / 260;
    const v = t1 - tl < 80 && tl - t0 > 8 ? clamp((-(y1 - y0) * DRAG_GAIN) / (tl - t0), -vMax, vMax) : 0;
    if (scrollDrag.moved && Math.abs(v) > 0.2 && !reduceMotion) glide = { v, t: t1 };
    scrollDrag = null;
    document.body.classList.remove("dragging");
  };
  addEventListener("pointerup", endScrollDrag);
  addEventListener("pointercancel", endScrollDrag);
  addEventListener("blur", endScrollDrag);
  addEventListener("wheel", () => (glide = null), { passive: true });
  addEventListener("keydown", () => (glide = null));
  function stepGlide(now) {
    if (!glide) return;
    const dt = Math.min(50, now - glide.t);
    glide.t = now;
    const before = scrollY;
    scrollBy(0, glide.v * dt);
    glide.v *= Math.exp(-dt / 260);
    if (Math.abs(glide.v) < 0.03 || scrollY === before) glide = null; // slowed down, or reached either end
  }

  // drag to turn the finished work
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!benchOn) return;
    drag = { x: e.clientX, y: e.clientY, th: view.dTh, phi: view.dPhi };
    view.preset = null;
    canvas.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.dTh = drag.th - ((e.clientX - drag.x) / innerWidth) * 3.2;
    if (e.pointerType === "mouse") view.dPhi = clamp(drag.phi - ((e.clientY - drag.y) / innerHeight) * 1.6, -0.7, 0.6);
  });
  const endDrag = () => {
    drag = null;
    document.body.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", (e) => {
    if (!benchOn || !e.ctrlKey) return;
    e.preventDefault();
    view.zoom = clamp(view.zoom * Math.exp(e.deltaY * 0.002), 0.45, 1.6);
  }, { passive: false });

  // hover: a specimen tag
  const hover = { x: 0, y: 0, dirty: false, t: 0 };
  const raycaster = new THREE.Raycaster();
  const hoverNdc = new THREE.Vector2();
  const tag = $("#specimen");
  function updateHover(s, now) {
    if (!hover.dirty || drag || scrollDrag || now - hover.t < 50) return;
    hover.dirty = false;
    hover.t = now;
    let id = -1;
    if (s > 60 && s < 915) {
      // picked against the flat shadow quads (2 triangles each), which share the shells' matrices,
      // rather than the 44 × 44 relief meshes; instances move every frame, so the bounds are recomputed
      shadows.boundingSphere = null;
      raycaster.setFromCamera(hoverNdc.set((hover.x / innerWidth) * 2 - 1, -(hover.y / innerHeight) * 2 + 1), camera);
      const hit = raycaster.intersectObject(shadows, false)[0];
      if (hit && stateArr[hit.instanceId * 4] > 0.5) id = hit.instanceId;
    }
    if (id < 0) return tag.classList.remove("on");
    const s0 = D.shells[id];
    $("#sp-no").textContent = String(s0.id).padStart(3, "0");
    $("#sp-name").textContent = s0.species;
    $("#sp-group").textContent = s > 400 && s < 570
      ? `${s0.val ? "Held out" : "Training"} · Group ${ROMAN[s0.cluster - 1]}`
      : `Group ${ROMAN[s0.cluster - 1]} · ${GROUPS[s0.cluster - 1]}`;
    tag.style.left = Math.min(hover.x, innerWidth - 230) + "px";
    tag.style.top = Math.min(hover.y, innerHeight - 90) + "px";
    tag.classList.add("on");
  }

  // ───────────────────────── chapter copy + gauge
  const copies = $$(".chapter-copy");
  const RANGES = [[-1, 72], [118, 238], [262, 392], [412, 552], [575, 718], [745, 895], [912, 1e9]];
  const CH_START = [0, 110, 250, 400, 560, 730, 900];
  const gaugeLinks = $$(".gauge a");
  const gaugeFill = $("#gauge-fill");
  // the gauge doubles as a scrub bar: drag the knob, or press anywhere on the line, to move through the story.
  // 0–1 along the line is 0–1190 vh of scroll, as the fill shows; the view eases there like any other scroll.
  const S_END = 1190;
  const gaugeTrack = $("#gauge-track"), gaugeKnob = $("#gauge-knob");
  let gaugeLen = 0, gaugeShown = -1, scrub = null;
  const measureGauge = () => (gaugeLen = gaugeFill.parentElement.getBoundingClientRect().height - 8);
  function setGauge(s) {
    const p = clamp(s / S_END);
    if (Math.abs(p - gaugeShown) < 0.0005) return; // write only when it has moved
    gaugeShown = p;
    if (!gaugeLen) measureGauge();
    gaugeFill.style.transform = `scaleY(${p.toFixed(4)})`;
    gaugeKnob.style.transform = `translateY(${(p * gaugeLen).toFixed(1)}px)`;
    gaugeKnob.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  }
  const scrubTo = (clientY) => {
    const top = gaugeFill.parentElement.getBoundingClientRect().top + 4;
    scrollTo(0, clamp((clientY - top) / gaugeLen) * S_END * vhPx());
  };
  for (const el of [gaugeTrack, gaugeKnob]) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      glide = null;
      measureGauge();
      scrub = e.pointerId;
      el.setPointerCapture(e.pointerId);
      document.body.classList.add("scrubbing");
      scrubTo(e.clientY);
    });
    el.addEventListener("pointermove", (e) => { if (scrub === e.pointerId) scrubTo(e.clientY); });
    const end = (e) => { if (scrub !== e.pointerId) return; scrub = null; document.body.classList.remove("scrubbing"); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  gaugeKnob.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 10, ArrowRight: 10, ArrowUp: -10, ArrowLeft: -10, PageDown: 60, PageUp: -60 }[e.key];
    if (step === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const s = e.key === "Home" ? 0 : e.key === "End" ? S_END : clamp(scrollY / vhPx() + step, 0, S_END);
    scrollTo(0, s * vhPx());
  });
  const tally = $("#tally");
  let lastTally = -1;
  function currentFinish() {
    if (wipeAnim) return wipeAnim.to;
    if (benchOn && finishManual !== null) return finishManual;
    return finishFromScroll(sNow).to;
  }
  function finishFromScroll(s) {
    const fs = clamp(seg(s, 950, 1180) * 6, 0, 5.999);
    const k = Math.floor(fs), local = fs - k;
    return k === 0 ? { from: 0, to: 0, wipe: 0 } : { from: k - 1, to: k, wipe: smooth(clamp(local / 0.42)) };
  }
  function updateCopy(s) {
    copies.forEach((c) => {
      const [a, b] = RANGES[+c.dataset.ch];
      c.classList.toggle("on", s > a && s < b);
    });
    let ch = 0;
    CH_START.forEach((v, i) => { if (s >= v - 30) ch = i; });
    gaugeLinks.forEach((a, i) => {
      a.classList.toggle("on", i <= ch);
      a.classList.toggle("current", i === ch);
    });
    setGauge(s);
    const nowBench = s > 1178;
    if (nowBench !== benchOn) {
      benchOn = nowBench;
      $("#bench").classList.toggle("on", benchOn);
      $("#bench").inert = !benchOn;
      document.body.classList.toggle("at-bench", benchOn);
      if (!benchOn) { finishManual = null; view.dTh = 0; view.dPhi = 0; view.zoom = 1; view.preset = null; }
    }
    document.body.classList.toggle("past-shore", s > 250);
    if (deposited !== lastTally) { lastTally = deposited; tally.textContent = String(deposited).padStart(3, "0"); }
  }

  // ───────────────────────── frame
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const groundCol = new THREE.Color();
  const angLerp = (a, b, t) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * t;
  let last = performance.now();
  const proj = new THREE.Vector3();

  function update(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    sNow = reduceMotion ? sTarget : lerp(sNow, sTarget, 1 - Math.exp(-dt * 5.5));
    if (Math.abs(sNow - sTarget) < 0.02) sNow = sTarget;
    const s = sNow;
    mxS = lerp(mxS, mouseX, 1 - Math.exp(-dt * 2.5));
    myS = lerp(myS, mouseY, 1 - Math.exp(-dt * 2.5));
    gridMix += clamp(gridTarget - gridMix, -dt * 0.8, dt * 0.8);

    // ── stage scalars
    const gather = seg(s, 70, 232);
    const tideAmt = 1 - smooth(seg(s, 252, 300));
    const dryT = seg(s, 262, 372);
    const learnIn = seg(s, 408, 465);
    const scanT = seg(s, 478, 532);
    const sortT = seg(s, 568, 688);
    const layT = seg(s, 745, 860);
    const boardT = smooth(seg(s, 400, 520));
    const fuse = seg(s, 908, 975);

    // ── tide and arrivals
    if (!tide.paused) tide.t += dt * (reduceMotion ? 0.6 : 1);
    const idleTarget = Math.min(96, 14 + tide.waves * 9);
    const target = Math.max(idleTarget, Math.round(N * gather));
    const l0 = lerp(L0_HERO, -9.6, smooth(gather));
    if (tide.t - tide.start > tide.period || tide.waves === 0) {
      for (const sh of tide.batch) settle(sh, now);
      newWave(target, l0);
    }
    const fr = frontNow();
    if (s > 240) for (const sh of queue) if (!sh.deposited) settle(sh, now, true);
    // the shape of the wave edge drifts continuously rather than being re-drawn for each wave
    tide.ph = [tide.t * 0.23 + 1.1, tide.t * -0.31 + 2.7, tide.t * 0.47 + 4.2];
    // the wet sand follows the water up and dries back slowly, so its edge never jumps between waves
    tide.wet = Math.max(fr.z, tide.wet - dt * 0.35);

    sandU.uTime.value = tide.t;
    sandU.uFront.value = lerp(-16, fr.z, tideAmt);
    sandU.uReach.value = lerp(-16, tide.wet, tideAmt);
    sandU.uEdge.value.set(...tide.ph);
    sandU.uRecede.value = fr.recede;
    sandU.uTide.value = tideAmt;
    const sunSpan = camera.aspect < 0.9 ? 12 : 22;
    const sunX = lerp(-sunSpan, sunSpan, dryT);
    sandU.uSunX.value = sunX;
    sandU.uSun.value = Math.sin(Math.PI * dryT);
    shellU.uValShow.value = smooth(seg(s, 445, 470)) * (1 - smooth(seg(s, 560, 590)));

    // ── finishes, background, theme
    let fin = finishFromScroll(s);
    if (benchOn && finishManual !== null) fin = { from: finishManual, to: finishManual, wipe: 0 };
    if (wipeAnim) {
      const u = clamp((now - wipeAnim.t0) / 1700);
      fin = { from: wipeAnim.from, to: wipeAnim.to, wipe: smooth(u) };
      if (u >= 1) wipeAnim = null;
    }
    terrU.uFinA.value = FINISHES[fin.from].id;
    terrU.uFinB.value = FINISHES[fin.to].id;
    terrU.uWipe.value = fin.from === fin.to ? 0 : fin.wipe;
    const shownFinish = fin.wipe > 0.5 ? fin.to : fin.from;
    const A = FINISHES[fin.from].bg, B = FINISHES[fin.to].bg;
    const fuseBg = smooth(seg(s, 920, 990));
    groundCol.setRGB(...[0.05, 0.047, 0.042].map((v, k) => lerp(v, lerp(A[k], B[k], fin.wipe), fuseBg)));
    sandU.uGround.value.copy(groundCol);
    sandU.uBoard.value = boardT;
    sandU.uSea.value = fuseBg;
    terrU.uGrid.value = gridMix;
    renderer.setClearColor(groundCol);
    const paper = s > 950 && FINISHES[shownFinish].paper;
    document.body.classList.toggle("theme-paper", paper);
    document.body.classList.toggle("theme-dark", !paper);
    if (shownFinish !== finishShown) {
      finishShown = shownFinish;
      $("#finish-name").textContent = FINISHES[shownFinish].name;
      $("#finish-text").textContent = FINISHES[shownFinish].text;
      $$(".finishes button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.finish === shownFinish)));
    }

    // ── shells
    const fz = fr.z;
    const scanX = portrait ? lerp(-14.6, 14.6, scanT) : lerp(-11.4, 11.4, scanT);
    for (const sh of shell) {
      const i = sh.i;
      // shore pose (and riding in on a wave)
      let x = sh.bx, z = sh.bz, rot = sh.brot, y = 0, alpha = 0;
      if (sh.deposited) {
        alpha = clamp((now - sh.arriveT) / 700);
      } else if (sh.carried && fr.u < 0.5) {
        const fzx = lerp(-16, fz, tideAmt) + edgeAt(sh.bx) - 0.35;
        z = Math.min(fzx, sh.bz);
        alpha = smooth(seg(z, tide.l0 - 0.2, tide.l0 + 1.4));
        rot = sh.brot + (sh.bz - z) * 0.35 * (sh.d3 - 0.5);
        if (z >= sh.bz - 1e-3) settle(sh, now);
      }
      const dried = smooth(clamp((sunX - sh.bx) / 6 + 0.15)); // dried once the sun has passed over it
      // III: into the tray, and through the line
      const t1 = stagger(learnIn, sh.d1);
      x = lerp(x, sh.tx, t1); z = lerp(z, sh.tz, t1); rot = angLerp(rot, 0, t1);
      y += Math.sin(Math.PI * t1) * (0.8 + sh.d2);
      const passed = smooth(clamp(((scanX - (portrait ? sh.tz : sh.tx)) * 1.2 + 0.5))) * (scanT > 0 ? 1 : 0);
      // IV: to the piles
      const t2 = stagger(sortT, sh.d2);
      x = lerp(x, sh.px, t2); z = lerp(z, sh.pz, t2); rot = angLerp(rot, sh.prot, t2);
      y += Math.sin(Math.PI * t2) * (1.2 + sh.d2);
      // V: onto the board
      const t3 = stagger(layT, sh.d3);
      const gm = ease(clamp(gridMix * 1.6 - sh.d3 * 0.6));
      const lx = lerp(sh.fx, sh.gx, gm), lz = lerp(sh.fz, sh.gz, gm);
      x = lerp(x, lx, t3); z = lerp(z, lz, t3); rot = angLerp(rot, 0, t3);
      y += Math.sin(Math.PI * t3) * (1.0 + sh.d1);
      y += Math.sin(Math.PI * clamp(gridMix * 1.6 - sh.d3 * 0.6)) * 0.35 * t3; // a small hop when switching free ↔ grid
      const scale = lerp(0.97, lerp(0.97, 1.0, gm), t3);
      // a tiny stagger in height, so shells that overlap never share a plane
      y += 0.004 + i * 0.00035 + (60 - sh.rank) * 0.002 * t2 * (1 - t3);
      q4.setFromAxisAngle(yAxis, rot);
      m4.compose(v3.set(x, y, z), q4, sc3.set(scale, 1, scale));
      shells.setMatrixAt(i, m4);
      stateArr[i * 4] = alpha;
      stateArr[i * 4 + 1] = dried;
      stateArr[i * 4 + 2] = dried * (0.55 + 0.45 * t3);
      stateArr[i * 4 + 3] = gm * t3; // only grid tiles carry a base; the free work is islands in a sea
      bArr[i * 4] = passed * (1 - smooth(clamp((s - 548) / 14 - sh.d2 * 0.6))); // back to the real shell before the sorting
      // the GPU height field always follows the board layout
      m4.compose(v3.set(lx, 0, lz), q4.identity(), sc3.set(lerp(D.freeFootprintMm / 100, 1, gm), 1, lerp(D.freeFootprintMm / 100, 1, gm)));
      rtShells.setMatrixAt(i, m4);
      rtShellState.array[i] = gm;
    }
    shells.instanceMatrix.needsUpdate = true;
    stateAttr.needsUpdate = true;
    bAttr.needsUpdate = true;

    // ── fuse into one relief
    shellU.uReveal.value = fuse;
    terrU.uReveal.value = fuse;
    terrain.visible = fuse > 0;
    shells.visible = fuse < 1;
    shadows.visible = fuse < 1;
    if (terrain.visible && Math.abs(gridMix - gridMixDrawn) > 1e-4) {
      rtShells.instanceMatrix.needsUpdate = true;
      rtShellState.needsUpdate = true;
      drawHeight();
      renderer.setClearColor(groundCol, 1);
      gridMixDrawn = gridMix;
    }

    // ── light: low and raking; in the finishing chapter it travels slowly
    const la = -2.2 + seg(s, 900, 1190) * 1.2 + (benchOn ? Math.sin(now * 0.00012) * 0.25 : 0);
    shellU.uLight.value.set(Math.cos(la) * 0.75, 0.62, Math.sin(la) * 0.75).normalize();

    // ── the line of chapter III
    const scanOn = smooth(seg(s, 470, 482)) * (1 - smooth(seg(s, 535, 552)));
    scan.visible = scanOn > 0.01;
    scanCore.material.opacity = 0.9 * scanOn;
    scanGlow.material.uniforms.uO.value = scanOn;
    scan.rotation.y = portrait ? Math.PI / 2 : 0;
    scan.position.set(portrait ? 0 : scanX, 0.26, portrait ? scanX : 0);

    // ── camera, labels, copy
    placeCamera(s, mxS, myS);
    if (portrait) proj.set(-6.9, 0.3, scanX); else proj.set(scanX, 0.3, -8.6);
    proj.project(camera);
    scanLabel.style.left = ((proj.x + 1) / 2) * innerWidth + "px";
    scanLabel.style.top = ((1 - proj.y) / 2) * innerHeight - 48 + "px";
    scanLabel.classList.toggle("on", scanOn > 0.5);
    const labelsOn = s > 630 && s < 750;
    piles.forEach((p, k) => {
      proj.set(p.cx, 0, p.cz + p.r + 0.5).project(camera);
      const el = labelEls[k];
      el.style.left = ((proj.x + 1) / 2) * innerWidth + "px";
      el.style.top = ((1 - proj.y) / 2) * innerHeight + "px";
      el.classList.toggle("on", labelsOn);
    });
    updateIsles(benchOn && namesOn);
    updateCopy(s);
    updateHover(s, now);

    renderer.render(scene, camera);
    if (captureNext) {
      captureNext = false;
      const a = document.createElement("a");
      a.download = `beachcombing-${FINISHES[shownFinish].name.toLowerCase()}-${gridTarget ? "grid" : "free"}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    }
  }
  // the resolution follows how the machine copes, both ways. Frames are averaged in windows of 40 (about 2/3 s):
  // clearly slow (under ~38 fps) steps the resolution down; four fast windows in a row (60 fps) step it back up.
  // If a step up is followed at once by a step down, it stops trying to go up for half a minute, so it never flickers.
  // Nothing is measured in the first 3 s, while textures and shaders settle, and one-off hitches are ignored.
  const perf = { sum: 0, n: 0, prev: 0, start: 0, fast: 0, upAt: -1e9, holdUntil: 0 };
  function setPixelRatio(r) {
    pixelRatio = r;
    renderer.setPixelRatio(r);
    renderer.setSize(innerWidth, innerHeight, false);
  }
  function adaptResolution(now) {
    const dt = now - perf.prev;
    perf.prev = now;
    if (!perf.start) perf.start = now;
    if (dt <= 0 || dt > 400 || document.hidden || now - perf.start < 3000) return; // >400 ms: a tab switch, not slowness
    perf.sum += dt; perf.n++;
    if (perf.n < 40 && perf.sum < 1000) return; // a window is 40 frames, or one second on a slow machine
    const avg = perf.sum / perf.n;
    perf.sum = 0; perf.n = 0;
    if (avg > 26 && pixelRatio > PR_MIN) {
      if (now - perf.upAt < 4000) perf.holdUntil = now + 30000; // that step up was too much
      perf.fast = 0;
      setPixelRatio(Math.max(PR_MIN, pixelRatio * (avg > 45 ? 0.72 : 0.85)));
    } else if (avg < 18.5 && pixelRatio < PR_MAX && now > perf.holdUntil) {
      if (++perf.fast >= 4) {
        perf.fast = 0;
        perf.upAt = now;
        setPixelRatio(Math.min(PR_MAX, pixelRatio / 0.85));
      }
    } else {
      perf.fast = 0;
    }
  }
  // while nothing is being done (no scroll easing, drag, scrub, wipe or layout switch, and no input for a second)
  // the scene is drawn every other frame: the tide and the light still move smoothly at 30 fps, at half the GPU work.
  // The resolution check times every animation frame, drawn or skipped: on a machine that keeps up they all come at the
  // display's rate, so the halving is not mistaken for slowness, while a slow draw still lengthens the frame after it.
  let lastInput = 0, skipNext = false;
  for (const ev of ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"]) addEventListener(ev, () => (lastInput = performance.now()), { passive: true });
  function frame(now) {
    const idle = sNow === sTarget && !drag && !scrollDrag && !glide && scrub === null && !wipeAnim &&
      Math.abs(gridMix - gridTarget) < 1e-3 && now - lastInput > 1000;
    if (!(idle && skipNext)) {
      stepGlide(now);
      update(now);
    }
    adaptResolution(now);
    skipNext = idle && !skipNext;
    requestAnimationFrame(frame);
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    layoutPiles(camera.aspect);
    isles.forEach((isle) => { isle.w = 0; isle.dx = isle.dy = undefined; }); // the names are smaller on a phone; place them afresh
    keepOutAt = 0;
    gaugeLen = 0; gaugeShown = -1; // the gauge's length follows the window height
    sTarget = scrollY / vhPx();
  }
  addEventListener("resize", resize);

  // compile every shader and draw everything once behind the loading veil, so no chapter stalls the first time it appears
  // (the finished relief's shader is large; compiled on first sight it froze the page on slower machines)
  async function warmUp() {
    const hidden = [terrain, scan, shells, shadows].filter((o) => !o.visible);
    hidden.forEach((o) => (o.visible = true));
    placeCamera(0, 0, 0);
    try {
      if (renderer.compileAsync) {
        await renderer.compileAsync(rtScene, rtCam);
        await renderer.compileAsync(blurScene, blurCam);
        await renderer.compileAsync(scene, camera);
      }
    } catch (e) { /* fall back to compiling on first draw */ }
    drawHeight(); // also uploads the textures
    renderer.render(scene, camera);
    hidden.forEach((o) => (o.visible = false));
  }

  Promise.all([loadTex(D.rgbAtlas), loadTex(D.depthAtlas), loadTex(D.reconAtlas)]).then(async ([rgb, dep, rec]) => {
    shellU.uRgb.value = rgb;
    shellU.uDepth.value = dep;
    shellU.uRecon.value = rec;
    resize();
    await warmUp();
    // deep links: ?chapter=3, any scroll position in vh (?s=505), or the finished work, e.g. ?finish=nacre&layout=grid&names
    const q = new URLSearchParams(location.search);
    const fq = FINISHES.findIndex((f) => f.name.toLowerCase() === (q.get("finish") || "").toLowerCase());
    if (q.has("names")) { namesOn = true; $("#isle-names").setAttribute("aria-pressed", "true"); }
    if (fq >= 0 || q.has("layout")) {
      scrollTo(0, document.documentElement.scrollHeight);
      if (fq >= 0) finishManual = fq;
      if (q.get("layout") === "grid") { setLayout("grid"); gridMix = 1; }
    } else if (q.has("chapter")) {
      scrollTo(0, (CH_START[clamp(+q.get("chapter"), 0, 6)] + 40) * vhPx());
    } else if (q.has("s")) {
      scrollTo(0, clamp(+q.get("s"), 0, 1200) * vhPx());
    }
    sTarget = scrollY / vhPx();
    sNow = sTarget;
    requestAnimationFrame((t) => {
      last = t;
      perf.prev = t;
      frame(t);
      document.body.classList.add("ready");
    });
  });
})();
