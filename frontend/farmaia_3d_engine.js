/* =========================================================================
   FARMA-IA 3D INTERACTIVE ROBOT CANVAS ENGINE (Three.js WebGL)
   Renderiza un modelo 3D estilizado y fiel al robot médico:
   - Cabeza esférica/monitor con visera oscura y ojos/sonrisa verde esmeralda luminiscente
   - Auriculares/headphones aqua metalizados con antenitas superiores
   - Cuerpo esférico/ovoide blanco con la cruz médica 3D en el pecho iluminada
   - Brazos robóticos articulados con brazaletes cian y manos abiertas
   - Base esférica azul marino flotante
   - Partículas flotantes de energía médica
   - Animaciones interactivas:
     * Flotación y balanceo en tiempo real (idle hover)
     * Seguimiento de la mirada y cabeza con el cursor del mouse/toque (lookAt mouse)
     * Modos de animación: 'saludo' (wave), 'feliz' (jump/cheer), 'analizando' (scan), 'medico' (pulse cruz)
   ========================================================================= */

class FarmaIa3DViewer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.width = options.width || this.container.clientWidth || 240;
    this.height = options.height || this.container.clientHeight || 240;
    this.interactive = options.interactive !== false;
    this.autoRotate = options.autoRotate || false;
    this.mode = options.initialMode || 'idle';
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.time = 0;
    this.init();
  }

  init() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js no está cargado. Se mantiene fallback 3D.');
      return;
    }

    // Scene & Renderer
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 100);
    this.camera.position.set(0, 0.4, 4.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Clear previous children
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Lights
    this.setupLights();

    // Robot Hierarchy
    this.robotRoot = new THREE.Group();
    this.scene.add(this.robotRoot);

    this.buildRobot();

    // Floating particles
    this.buildParticles();

    // Mouse events
    if (this.interactive) {
      this.bindEvents();
    }

    // Animation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(2, 4, 3);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const cyanRim = new THREE.PointLight(0x2dd4bf, 3.5, 8);
    cyanRim.position.set(-2, 1, -1.5);
    this.scene.add(cyanRim);

    const bottomGlow = new THREE.PointLight(0x34d399, 3.0, 5);
    bottomGlow.position.set(0, -1.6, 0.5);
    this.scene.add(bottomGlow);
  }

  buildRobot() {
    // Materials
    const whitePlastic = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.18,
      metalness: 0.12,
    });

    const navyMetal = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.25,
      metalness: 0.7,
    });

    const aquaMetal = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.22,
      metalness: 0.8,
    });

    const screenGlass = new THREE.MeshStandardMaterial({
      color: 0x050811,
      roughness: 0.08,
      metalness: 0.9,
    });

    const neonGreenGlow = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
    });

    const crossGlowMat = new THREE.MeshStandardMaterial({
      color: 0x5eead4,
      emissive: 0x2dd4bf,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    // 1. TORSO / BODY
    this.bodyGroup = new THREE.Group();
    this.robotRoot.add(this.bodyGroup);

    // Torso sphere (upper white)
    const upperBodyGeo = new THREE.SphereGeometry(0.82, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const upperBody = new THREE.Mesh(upperBodyGeo, whitePlastic);
    upperBody.position.y = -0.15;
    this.bodyGroup.add(upperBody);

    // Lower body (navy egg bottom)
    const lowerBodyGeo = new THREE.SphereGeometry(0.8, 32, 24, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, navyMetal);
    lowerBody.position.y = -0.15;
    this.bodyGroup.add(lowerBody);

    // Torso cyan division belt
    const beltGeo = new THREE.TorusGeometry(0.81, 0.035, 16, 48);
    beltGeo.rotateX(Math.PI / 2);
    const belt = new THREE.Mesh(beltGeo, aquaMetal);
    belt.position.y = -0.22;
    this.bodyGroup.add(belt);

    // Medical Cross in chest
    const crossGroup = new THREE.Group();
    crossGroup.position.set(0, 0.02, 0.78);
    const crossVert = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.06), crossGlowMat);
    const crossHoriz = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.06), crossGlowMat);
    crossGroup.add(crossVert);
    crossGroup.add(crossHoriz);
    this.crossMesh = crossGroup;
    this.bodyGroup.add(crossGroup);

    // 2. HEAD & SCREEN
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.95, 0);
    this.robotRoot.add(this.headGroup);

    // Outer helmet
    const helmetGeo = new THREE.SphereGeometry(0.78, 36, 28);
    helmetGeo.scale(1.08, 0.94, 1.0);
    const helmet = new THREE.Mesh(helmetGeo, whitePlastic);
    this.headGroup.add(helmet);

    // Dark Visor Face Screen (flattened front sphere)
    const visorGeo = new THREE.SphereGeometry(0.68, 32, 24, 0, Math.PI, 0, Math.PI);
    visorGeo.scale(1.02, 0.82, 0.38);
    visorGeo.rotateY(-Math.PI / 2);
    const visor = new THREE.Mesh(visorGeo, screenGlass);
    visor.position.set(0, 0.02, 0.58);
    this.headGroup.add(visor);

    // Eyes: Curved happy arcs ^ ^
    this.eyesGroup = new THREE.Group();
    this.eyesGroup.position.set(0, 0.08, 0.78);

    const eyeArcGeo = new THREE.TorusGeometry(0.11, 0.028, 12, 24, Math.PI * 0.9);
    eyeArcGeo.rotateZ(Math.PI * 0.05);

    const leftEye = new THREE.Mesh(eyeArcGeo, neonGreenGlow);
    leftEye.position.set(-0.25, 0.02, 0);
    this.eyesGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeArcGeo.clone(), neonGreenGlow);
    rightEye.position.set(0.25, 0.02, 0);
    this.eyesGroup.add(rightEye);

    // Smile: Arc below
    const mouthGeo = new THREE.TorusGeometry(0.09, 0.024, 12, 20, Math.PI * 0.7);
    mouthGeo.rotateZ(Math.PI * 1.15);
    const mouth = new THREE.Mesh(mouthGeo, neonGreenGlow);
    mouth.position.set(0, -0.15, 0);
    this.eyesGroup.add(mouth);

    this.headGroup.add(this.eyesGroup);

    // Headphones (Aqua metal pads on sides)
    const padGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.16, 28);
    padGeo.rotateZ(Math.PI / 2);

    const leftPad = new THREE.Mesh(padGeo, aquaMetal);
    leftPad.position.set(-0.84, 0.04, 0);
    this.headGroup.add(leftPad);

    const rightPad = new THREE.Mesh(padGeo, aquaMetal);
    rightPad.position.set(0.84, 0.04, 0);
    this.headGroup.add(rightPad);

    // Headphone headband
    const bandGeo = new THREE.TorusGeometry(0.82, 0.045, 12, 36, Math.PI);
    const band = new THREE.Mesh(bandGeo, aquaMetal);
    band.position.set(0, 0.08, 0);
    this.headGroup.add(band);

    // Antennas on headphone pads
    const antGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.28, 12);
    const tipGeo = new THREE.SphereGeometry(0.045, 12, 12);

    const leftAnt = new THREE.Mesh(antGeo, aquaMetal);
    leftAnt.position.set(-0.84, 0.28, 0);
    leftAnt.rotateZ(-0.2);
    const leftTip = new THREE.Mesh(tipGeo, neonGreenGlow);
    leftTip.position.y = 0.14;
    leftAnt.add(leftTip);
    this.headGroup.add(leftAnt);

    const rightAnt = new THREE.Mesh(antGeo, aquaMetal);
    rightAnt.position.set(0.84, 0.28, 0);
    rightAnt.rotateZ(0.2);
    const rightTip = new THREE.Mesh(tipGeo, neonGreenGlow);
    rightTip.position.y = 0.14;
    rightAnt.add(rightTip);
    this.headGroup.add(rightAnt);

    // 3. ARMS & HANDS
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.78, 0.1, 0);
    this.bodyGroup.add(this.leftArmGroup);

    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.78, 0.1, 0);
    this.bodyGroup.add(this.rightArmGroup);

    this.buildArm(this.leftArmGroup, -1, whitePlastic, navyMetal, aquaMetal);
    this.buildArm(this.rightArmGroup, 1, whitePlastic, navyMetal, aquaMetal);
  }

  buildArm(armGroup, dir, whiteMat, navyMat, aquaMat) {
    // Shoulder joint ball
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), navyMat);
    armGroup.add(shoulder);

    // Upper arm
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 16), whiteMat);
    upper.position.set(dir * 0.18, 0.08, 0);
    upper.rotateZ(dir * -0.55);
    armGroup.add(upper);

    // Glowing wrist ring
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5eead4 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.18, 18), ringMat);
    ring.position.set(dir * 0.36, 0.18, 0.04);
    ring.rotateZ(dir * -0.65);
    armGroup.add(ring);

    // Hand palm
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), whiteMat);
    palm.position.set(dir * 0.52, 0.28, 0.08);
    armGroup.add(palm);

    // Fingers
    const fingerGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10);
    for (let i = -1; i <= 2; i++) {
      const f = new THREE.Mesh(fingerGeo, navyMat);
      f.position.set(dir * (0.58 + Math.abs(i) * 0.02), 0.34 + i * 0.06, 0.08);
      f.rotateZ(dir * -0.7 + i * 0.1);
      armGroup.add(f);
    }
  }

  buildParticles() {
    const pCount = 28;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 2.8;
      pos[i + 1] = (Math.random() - 0.5) * 2.4 - 0.2;
      pos[i + 2] = (Math.random() - 0.5) * 1.8;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x2dd4bf,
      size: 0.07,
      transparent: true,
      opacity: 0.75,
    });
    this.particles = new THREE.Points(pGeo, pMat);
    this.scene.add(this.particles);
  }

  bindEvents() {
    this.container.addEventListener('mousemove', (e) => {
      const rect = this.container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.mouse.targetX = x * 0.6;
      this.mouse.targetY = y * 0.4;
    });

    this.container.addEventListener('mouseleave', () => {
      this.mouse.targetX = 0;
      this.mouse.targetY = 0;
    });

    this.container.addEventListener('click', () => {
      this.triggerSalute();
    });
  }

  setMode(modeKey) {
    this.mode = modeKey || 'idle';
    if (this.crossMesh) {
      if (modeKey === 'presion_azucar_peso') {
        this.crossMesh.children.forEach(m => m.material.color.setHex(0xf43f5e));
      } else if (modeKey === 'cronicos_5d') {
        this.crossMesh.children.forEach(m => m.material.color.setHex(0xfbbf24));
      } else if (modeKey === 'principio_activo') {
        this.crossMesh.children.forEach(m => m.material.color.setHex(0x6366f1));
      } else {
        this.crossMesh.children.forEach(m => m.material.color.setHex(0x5eead4));
      }
    }
  }

  triggerSalute() {
    this.saluteProgress = 1.0;
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.time += 0.035;

    // Smooth mouse follow
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.1;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.1;

    // Hover Float (Bobbing & Tilt)
    const floatY = Math.sin(this.time * 1.8) * 0.08;
    const floatRotZ = Math.sin(this.time * 1.2) * 0.035;
    this.robotRoot.position.y = floatY;
    this.robotRoot.rotation.z = floatRotZ;

    // Head looks at cursor
    this.headGroup.rotation.y = this.mouse.x * 0.9;
    this.headGroup.rotation.x = -this.mouse.y * 0.6;

    // Subtle torso follow
    this.bodyGroup.rotation.y = this.mouse.x * 0.35;

    // Salute wave animation on click
    if (this.saluteProgress > 0) {
      this.saluteProgress -= 0.02;
      const wave = Math.sin(this.saluteProgress * Math.PI * 4) * 0.35;
      this.rightArmGroup.rotation.z = 0.5 + wave;
      this.leftArmGroup.rotation.z = -0.2;
    } else {
      // Idle breathing arms
      this.rightArmGroup.rotation.z = Math.sin(this.time * 1.5) * 0.08;
      this.leftArmGroup.rotation.z = -Math.sin(this.time * 1.5) * 0.08;
      this.rightArmGroup.position.y = 0.1 + Math.cos(this.time * 1.5) * 0.02;
      this.leftArmGroup.position.y = 0.1 + Math.cos(this.time * 1.5) * 0.02;
    }

    // Cross pulsing glow
    if (this.crossMesh) {
      const pulse = 0.85 + Math.sin(this.time * 3.5) * 0.3;
      this.crossMesh.scale.set(pulse, pulse, pulse);
    }

    // Rotate particles slowly
    if (this.particles) {
      this.particles.rotation.y = this.time * 0.12;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.FarmaIa3DViewer = FarmaIa3DViewer;
