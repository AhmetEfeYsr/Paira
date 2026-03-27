import * as THREE from 'three';

function createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#081409'; 
    ctx.fillRect(0, 0, 512, 512);
    
    for (let i = 0; i < 4000; i++) {
        const isLight = Math.random() > 0.5;
        ctx.fillStyle = isLight ? '#0c1f0d' : '#050d06';
        ctx.beginPath();
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const radius = 2 + Math.random() * 8;
        ctx.ellipse(x, y, radius, radius * 0.4, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(100, 100); 
    return texture;
}

class PlayerModel {
    constructor(colorHex, index, totalPlayers, houseRadius, fireRadius, playerId, playerName) {
        this.index = index;
        this.playerId = playerId;
        this.playerName = playerName;
        const angle = (index / totalPlayers) * Math.PI * 2;

        this.homePos = new THREE.Vector3(Math.cos(angle) * houseRadius, 1.0, Math.sin(angle) * houseRadius);
        this.firePos = new THREE.Vector3(Math.cos(angle) * fireRadius, 1.0, Math.sin(angle) * fireRadius);
        this.targetPos = this.firePos.clone();
        this.velocity = new THREE.Vector3();
        this.maxSpeed = 2.5;
        this.maxForce = 8.0;
        this.arriveRadius = 1.0;
        this.isDead = false;
        
        // For animations
        this.animState = 'idle'; // idle, walk, hit, blocked, trapped, hang
        this.animTimer = 0;

        this.meshGroup = new THREE.Group();
        this.meshGroup.userData = { id: playerId, type: 'player' };
        
        this.buildCharacter(colorHex);

        this.meshGroup.position.copy(this.firePos);
        this.meshGroup.lookAt(0, 1, 0);
        
        // Add name tag
        this.addNameTag(playerName);
    }
    
    addNameTag(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.roundRect(0, 0, 256, 64, 10);
        ctx.fill();
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 128, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
        this.nameSprite = new THREE.Sprite(mat);
        this.nameSprite.scale.set(2.0, 0.5, 1);
        this.nameSprite.position.y = 1.6;
        this.meshGroup.add(this.nameSprite);
    }

    buildCharacter(colorHex) {
        const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        this.body = new THREE.Group();
        const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.4, 4, 8), mat);
        bodyMesh.castShadow = true;
        this.body.add(bodyMesh);
        this.meshGroup.add(this.body);

        this.head = new THREE.Group();
        this.head.position.y = 0.55;
        const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), mat);
        headMesh.castShadow = true;
        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), blackMat);
        leftEye.position.set(-0.18, 0.1, 0.4);
        const rightEye = leftEye.clone();
        rightEye.position.set(0.18, 0.1, 0.4);

        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12, Math.PI * 0.78), blackMat);
        mouth.position.set(0, -0.09, 0.41);
        mouth.rotation.z = Math.PI * 0.92;

        this.head.add(headMesh, leftEye, rightEye, mouth);
        this.body.add(this.head);

        const createLimb = (radius, length) => {
            const pivot = new THREE.Group();
            const limbMesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 6), mat);
            limbMesh.position.y = -(length / 2);
            limbMesh.castShadow = true;
            pivot.add(limbMesh);
            return pivot;
        };

        this.leftArm = createLimb(0.12, 0.4);
        this.leftArm.position.set(-0.45, 0.2, 0);
        this.rightArm = createLimb(0.12, 0.4);
        this.rightArm.position.set(0.45, 0.2, 0);
        this.body.add(this.leftArm, this.rightArm);

        this.leftLeg = createLimb(0.14, 0.45);
        this.leftLeg.position.set(-0.2, -0.3, 0);
        this.rightLeg = createLimb(0.14, 0.45);
        this.rightLeg.position.set(0.2, -0.3, 0);
        this.meshGroup.add(this.leftLeg, this.rightLeg);
        
        // Trap visual (hidden by default)
        this.trapMesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.05, 8, 24),
            new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 })
        );
        this.trapMesh.rotation.x = Math.PI / 2;
        this.trapMesh.position.y = -0.4;
        this.trapMesh.visible = false;
        this.meshGroup.add(this.trapMesh);

        // Tombstone (hidden by default)
        this.tombstone = new THREE.Group();
        const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.2), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }));
        stone.position.y = 0.5;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 }));
        base.position.y = 0.1;
        this.tombstone.add(stone, base);
        this.tombstone.visible = false;
        this.meshGroup.add(this.tombstone);
    }
    
    setHighlight(isSelected) {
        if (this.isDead) return;
        if(isSelected) {
            this.nameSprite.material.color.setHex(0xffff00); // Yellow name
            if(this.body.children[0]) {
                this.body.children[0].material.emissive.setHex(0x333333);
                this.body.children[0].material.emissiveIntensity = 0.5;
            }
        } else {
            this.nameSprite.material.color.setHex(0xffffff);
            if(this.body.children[0]) {
                this.body.children[0].material.emissive.setHex(0x000000);
                this.body.children[0].material.emissiveIntensity = 0;
            }
        }
    }

    setDead(isDead) {
        this.isDead = isDead;
        if (isDead) {
            this.body.visible = false;
            this.leftLeg.visible = false;
            this.rightLeg.visible = false;
            this.tombstone.visible = true;
            this.meshGroup.rotation.x = 0;
            this.meshGroup.position.y = 0.0;
            this.nameSprite.position.y = 1.4;
            this.nameSprite.position.z = 0.0;
            this.nameSprite.material.opacity = 0.6;
        } else {
            this.body.visible = true;
            this.leftLeg.visible = true;
            this.rightLeg.visible = true;
            this.tombstone.visible = false;
            this.meshGroup.rotation.x = 0;
            this.meshGroup.position.y = 1.0;
            this.nameSprite.position.y = 1.6;
            this.nameSprite.position.z = 0;
            this.nameSprite.material.opacity = 1.0;
        }
    }

    setTarget(position, maxSpeed = 2.5) {
        if (this.isDead && this.animState !== 'hang') return;
        this.maxSpeed = maxSpeed;
        this.targetPos.copy(position);
    }

    playAnim(state, duration) {
        this.animState = state;
        this.animTimer = duration;
        if(state === 'trapped') this.trapMesh.visible = true;
        else this.trapMesh.visible = false;
    }

    update(delta, time) {
        if (this.isDead && this.animState !== 'hang') return;
        
        if (this.animTimer > 0) {
            this.animTimer -= delta;
            if (this.animTimer <= 0) {
                // Reset emissive from hit flash
                if(this.animState === 'hit' && this.body.children[0]) {
                    this.body.children[0].material.emissive.setHex(0x000000);
                    this.body.children[0].material.emissiveIntensity = 0;
                }
                // Reset head rotation from blocked
                if(this.animState === 'blocked') {
                    this.head.rotation.y = 0;
                }
                // Don't auto-revert hang — external code calls setDead
                if(this.animState !== 'hang') {
                    this.animState = 'idle';
                }
                this.trapMesh.visible = false;
            }
        }
        
        if(this.animState === 'hit') {
            this.meshGroup.position.x += (Math.random() - 0.5) * 0.2;
            this.meshGroup.position.z += (Math.random() - 0.5) * 0.2;
            // Flash red using emissive — no new material created
            if(this.body.children[0]) {
                this.body.children[0].material.emissive.setHex(0xff0000);
                this.body.children[0].material.emissiveIntensity = Math.sin(time * 30) * 0.5 + 0.5;
            }
        }
        
        if(this.animState === 'blocked') {
            this.head.rotation.y = Math.sin(time * 15) * 0.3;
            return;
        }
        
        if(this.animState === 'trapped') {
            this.meshGroup.position.y = 1.0 + Math.sin(time * 20) * 0.05; // Struggle
            return;
        }
        
        if(this.animState === 'hang') {
            this.meshGroup.position.y = 1.5;
            this.meshGroup.rotation.z = Math.sin(time * 5) * 0.1;
        }
        
        const toTarget = this.targetPos.clone().sub(this.meshGroup.position);
        const distance = toTarget.length();

        if (distance > 0.06) {
            const desiredSpeed = distance < this.arriveRadius
                ? this.maxSpeed * (distance / this.arriveRadius)
                : this.maxSpeed;
            const desiredVelocity = toTarget.normalize().multiplyScalar(desiredSpeed);
            const steering = desiredVelocity.sub(this.velocity).clampLength(0, this.maxForce * delta);

            this.velocity.add(steering);
            this.velocity.clampLength(0, this.maxSpeed);
            this.meshGroup.position.addScaledVector(this.velocity, delta);

            if (this.velocity.lengthSq() > 0.0001) {
                const lookTarget = this.meshGroup.position.clone().add(this.velocity);
                lookTarget.y = this.meshGroup.position.y;
                this.meshGroup.lookAt(lookTarget);
            }

            const moveIntensity = THREE.MathUtils.clamp(this.velocity.length() / this.maxSpeed, 0.15, 1);
            const walkFreq = time * (this.maxSpeed > 3 ? 12 : 7);
            const walkAmp = 0.35 * moveIntensity;

            this.leftArm.rotation.x = Math.sin(walkFreq) * walkAmp;
            this.rightArm.rotation.x = -Math.sin(walkFreq) * walkAmp;
            this.leftLeg.rotation.x = -Math.sin(walkFreq) * walkAmp;
            this.rightLeg.rotation.x = Math.sin(walkFreq) * walkAmp;

            this.body.position.y = Math.abs(Math.sin(walkFreq)) * 0.09 * moveIntensity;
            this.body.rotation.x = 0.06 * moveIntensity;
        } else {
            this.velocity.multiplyScalar(Math.max(0, 1 - delta * 8));
            // Keep looking at center when idle at fire
            if (this.targetPos.distanceTo(this.firePos) < 0.1 && !this.isNight) {
                this.meshGroup.lookAt(0, 1, 0);
            }

            const breath = Math.sin(time * 1.5 + this.index);
            this.body.position.y = breath * 0.04;
            this.body.rotation.x = 0;

            this.leftArm.rotation.x = Math.sin(time * 0.35 + this.index) * 0.04;
            this.rightArm.rotation.x = Math.sin(time * 0.35 + this.index) * 0.04;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
        }
    }
}

class HouseBuilder {
    static build(roofColorHex, windowsArray, playerId) {
        const houseGroup = new THREE.Group();
        houseGroup.userData = { id: playerId, type: 'house' };

        const wallMat = new THREE.MeshStandardMaterial({ color: 0xddcbb8, roughness: 0.9 }); 
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2210, roughness: 0.8 }); 
        const roofMat = new THREE.MeshStandardMaterial({ color: roofColorHex, roughness: 0.7, flatShading: true }); 

        const width = 3.6, depth = 3.6, radius = 0.6;
        const shape = new THREE.Shape();
        shape.moveTo(-width/2, -depth/2 + radius);
        shape.lineTo(-width/2, depth/2 - radius);
        shape.quadraticCurveTo(-width/2, depth/2, -width/2 + radius, depth/2);
        shape.lineTo(width/2 - radius, depth/2);
        shape.quadraticCurveTo(width/2, depth/2, width/2, depth/2 - radius);
        shape.lineTo(width/2, -depth/2 + radius);
        shape.quadraticCurveTo(width/2, -depth/2, width/2 - radius, -depth/2);
        shape.lineTo(-width/2 + radius, -depth/2);
        shape.quadraticCurveTo(-width/2, -depth/2, -width/2, -depth/2 + radius);

        const extrudeSettings = { depth: 2.2, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.1, bevelThickness: 0.1 };
        const wallGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        wallGeo.rotateX(-Math.PI / 2); 

        const walls = new THREE.Mesh(wallGeo, wallMat);
        walls.castShadow = true;
        walls.receiveShadow = true;
        houseGroup.add(walls);

        const roofHeight = 2.0;
        const roofGeo = new THREE.CylinderGeometry(0, 3.2, roofHeight, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 2.3 + (roofHeight/2);
        roof.castShadow = true;

        const trimGeo = new THREE.CylinderGeometry(0, 3.1, 0.2, 4);
        trimGeo.rotateY(Math.PI / 4);
        const trim = new THREE.Mesh(trimGeo, woodMat);
        trim.position.y = - (roofHeight/2) + 0.1;
        roof.add(trim);
        houseGroup.add(roof);

        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x6e3511 }));
        chimney.position.set(-1.2, 2.3 + roofHeight/2, -1.0);
        chimney.castShadow = true;
        houseGroup.add(chimney);

        const doorGroup = new THREE.Group();
        const doorBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.25), woodMat);
        doorBase.position.y = 0.6;
        const doorTop = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 12), woodMat);
        doorTop.rotation.x = Math.PI / 2;
        doorTop.position.y = 1.2;
        doorGroup.add(doorBase, doorTop);

        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffa500, metalness: 0.8, roughness: 0.2 }));
        knob.position.set(0.3, 0.6, 0.15); 
        doorGroup.add(knob);
        doorGroup.position.set(0, 0, depth/2 + 0.02); 
        houseGroup.add(doorGroup);

        const step = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.2, 2, 8), new THREE.MeshStandardMaterial({ color: 0x555555 }));
        step.rotation.z = Math.PI / 2;
        step.position.set(0, 0.1, depth/2 + 0.3);
        step.receiveShadow = true;
        houseGroup.add(step);

        const winMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.2, metalness: 0.8 }); 
        windowsArray.push(winMat);

        const createWindow = (px, py, pz) => {
            const winGroup = new THREE.Group();
            const glassGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12);
            glassGeo.rotateX(Math.PI / 2);
            const glass = new THREE.Mesh(glassGeo, winMat);
            winGroup.add(glass);

            const frameGeo = new THREE.TorusGeometry(0.4, 0.08, 6, 16);
            const frame = new THREE.Mesh(frameGeo, woodMat);
            frame.position.z = 0.05; 
            winGroup.add(frame);

            winGroup.position.set(px, py, pz);
            return winGroup;
        };

        houseGroup.add(createWindow(-1.1, 1.3, depth/2 + 0.02)); 
        houseGroup.add(createWindow(1.1, 1.3, depth/2 + 0.02));  

        return houseGroup;
    }
}

export class GameScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x3a5f7a, 120, 350); 
        
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); 
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.clock = new THREE.Clock();
        this.isNight = false;
        
        this.playerModels = {}; // id -> PlayerModel
        this.houses = {}; // id -> Group
        this.windows = [];
        this.houseRadius = 14;
        this.fireScale = 1.0; 
        this.currentFireRadius = 4.0; 

        // Camera control
        this.localId = null;
        this.cameraMode = 'fire'; // fire, house, follow
        this.cameraFollowTarget = null;
        this.targetCamY = 25;
        this.targetCamZ = 45;
        this.targetCamX = 0;
        this.camera.position.set(0, this.targetCamY, this.targetCamZ);
        this.camera.lookAt(0, 0, 0);
        
        this.flickerTimer = 0;
        this.targetFlicker = 100;
        this.colorCore = new THREE.Color(0xffbb33); 
        this.colorMid = new THREE.Color(0xff4400);  
        this.colorEdge = new THREE.Color(0xaa0000); 

        this.campfireActive = true;

        this.setupEnvironment();
        this.setupRaycaster();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    setupRaycaster() {
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        
        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (!window.onPlayerSelected) return; // Callback must be defined
            
            const rect = this.renderer.domElement.getBoundingClientRect();
            let cx = e.clientX, cy = e.clientY;
            if(e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            
            this.pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
            
            this.raycaster.setFromCamera(this.pointer, this.camera);
            
            // Check players and houses
            let objects = [];
            Object.values(this.playerModels).forEach(p => objects.push(p.meshGroup));
            Object.values(this.houses).forEach(h => objects.push(h));
            
            const intersects = this.raycaster.intersectObjects(objects, true);
            if (intersects.length > 0) {
                // Find nearest parent with userData.id
                let obj = intersects[0].object;
                while(obj && !obj.userData.id) {
                    obj = obj.parent;
                }
                if (obj && obj.userData.id) {
                    window.onPlayerSelected(obj.userData.id);
                }
            }
        });
    }

    setupEnvironment() {
        const grassTexture = createGrassTexture();
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(800, 800),
            new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1.0, metalness: 0.0 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        this.dirtMat = new THREE.MeshStandardMaterial({ color: 0x2b1e16, roughness: 0.95 });
        this.mainDirt = new THREE.Mesh(new THREE.CircleGeometry(15, 32), this.dirtMat);
        this.mainDirt.rotation.x = -Math.PI / 2;
        this.mainDirt.position.y = 0.01;
        this.mainDirt.receiveShadow = true;
        this.scene.add(this.mainDirt);

        this.starsMat = new THREE.PointsMaterial({ color: 0xdde8ff, size: 0.3, transparent: true, opacity: 0, depthWrite: false });
        const starsGeo = new THREE.BufferGeometry();
        const stars = [];
        for (let i = 0; i < 600; i++) { 
            const radius = 80 + Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            stars.push(Math.cos(theta) * radius, 60 + Math.random() * 100, Math.sin(theta) * radius);
        }
        starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
        this.stars = new THREE.Points(starsGeo, this.starsMat);
        this.scene.add(this.stars);

        this.moon = new THREE.Mesh(
            new THREE.SphereGeometry(3.5, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xe5efff, emissive: 0x5a6a88, emissiveIntensity: 0.45, roughness: 0.4 })
        );
        this.moon.position.set(-80, 60, -60);
        this.scene.add(this.moon);

        this.sun = new THREE.Mesh(
            new THREE.SphereGeometry(5.0, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 1.0 })
        );
        this.sun.position.set(60, 70, 60); 
        this.scene.add(this.sun);

        this.fireGroup = new THREE.Group();
        this.flameVisualGroup = new THREE.Group();

        const fireWoodMat = new THREE.MeshStandardMaterial({ color: 0x2b1e16, roughness: 0.95 });
        for(let i=0; i<6; i++) {
            const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.8, 6), fireWoodMat);
            wood.rotation.z = Math.PI / 3 + (Math.random() - 0.5) * 0.08;
            wood.rotation.x = (Math.random() - 0.5) * 0.14;
            wood.rotation.y = (Math.PI / 3) * i;
            wood.position.y = 0.22;
            wood.scale.set(0.95 + Math.random() * 0.18, 1, 0.9 + Math.random() * 0.22);
            wood.castShadow = true;
            this.fireGroup.add(wood);
        }

        this.particleCount = 45;
        this.particles = [];
        const particleGeo = new THREE.IcosahedronGeometry(0.4, 0); 
        const particleMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

        for(let i=0; i<this.particleCount; i++) {
            const pMesh = new THREE.Mesh(particleGeo, particleMat.clone());
            const p = {
                mesh: pMesh, life: Math.random(), speed: 0.4 + Math.random() * 0.6,
                wobbleSpeed: 1.0 + Math.random() * 2.0, wobbleSize: 0.1 + Math.random() * 0.2, 
                xOffset: (Math.random() - 0.5) * 0.5, zOffset: (Math.random() - 0.5) * 0.5,
                rotSpeed: (Math.random() - 0.5) * 2.5
            };
            this.particles.push(p);
            this.flameVisualGroup.add(pMesh);
        }

        this.emberBed = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 12, 10),
            new THREE.MeshStandardMaterial({ color: 0x4b1e0e, emissive: 0xff4d00, emissiveIntensity: 0.8, roughness: 0.9 })
        );
        this.emberBed.scale.set(1.1, 0.35, 1.1);
        this.emberBed.position.y = 0.42;
        this.flameVisualGroup.add(this.emberBed);

        // Spark particles
        this.sparkCount = 30;
        const sparkGeo = new THREE.BufferGeometry();
        const sparkPositions = new Float32Array(this.sparkCount * 3);
        this.sparkData = [];
        for(let i = 0; i < this.sparkCount; i++) {
            sparkPositions[i*3] = (Math.random() - 0.5);
            sparkPositions[i*3+1] = Math.random() * 2;
            sparkPositions[i*3+2] = (Math.random() - 0.5);
            this.sparkData.push({ velocity: new THREE.Vector3((Math.random()-0.5)*1.2, 0.8 + Math.random()*1.2, (Math.random()-0.5)*1.2), life: Math.random() });
        }
        sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
        const sparkMaterial = new THREE.PointsMaterial({ color: 0xffcc44, size: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        this.sparks = new THREE.Points(sparkGeo, sparkMaterial);
        this.flameVisualGroup.add(this.sparks);

        this.fireGroup.add(this.flameVisualGroup);

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight(0x7da4c4, 0x081409, 0.4);
        this.scene.add(this.hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xffeedd, 1.3); 
        this.dirLight.position.set(30, 45, 30);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024; 
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.left = -50;
        this.dirLight.shadow.camera.right = 50;
        this.dirLight.shadow.camera.top = 50;
        this.dirLight.shadow.camera.bottom = -50;
        this.dirLight.shadow.camera.far = 150;
        this.dirLight.shadow.bias = -0.001;
        this.scene.add(this.dirLight);

        this.fireLight = new THREE.PointLight(0xff7a1f, 150, 60, 2.0); 
        this.fireLight.position.set(0, 1.2, 0); 
        this.fireLight.castShadow = true;
        this.fireLight.shadow.camera.near = 0.5;
        this.fireLight.shadow.bias = -0.005;
        this.fireLight.shadow.mapSize.width = 512; 
        this.fireLight.shadow.mapSize.height = 512;
        this.scene.add(this.fireLight);
        
        this.scene.add(this.fireGroup);
    }

    generateColors(count) {
        const colors = [];
        for(let i=0; i<count; i++) {
            const hue = (i / count) * 360;
            const c = new THREE.Color(`hsl(${hue}, 80%, 55%)`);
            colors.push(c.getHex());
        }
        return colors;
    }

    setLocalPlayer(id) {
        this.localId = id;
    }

    updatePlayers(playersData) {
        // playersData is array of { id, name, isAlive }
        const pIds = playersData.map(p => p.id);
        const count = playersData.length;
        if(count === 0) return;

        // Cleanup removed players
        Object.keys(this.playerModels).forEach(id => {
            if(!pIds.includes(id)) {
                this.scene.remove(this.playerModels[id].meshGroup);
                this.scene.remove(this.houses[id]);
                delete this.playerModels[id];
                delete this.houses[id];
            }
        });

        this.fireScale = 0.5 + (count * 0.06); 
        this.fireGroup.scale.set(this.fireScale, this.fireScale, this.fireScale);
        this.currentFireRadius = (3.0 * this.fireScale) + (count * 0.35);
        this.houseRadius = Math.max(12, count * 1.8);
        
        this.mainDirt.scale.setScalar(this.houseRadius / 10);

        const colors = this.generateColors(count);

        playersData.forEach((pData, index) => {
            if(!this.playerModels[pData.id]) {
                const p = new PlayerModel(colors[index], index, count, this.houseRadius, this.currentFireRadius, pData.id, pData.name);
                this.playerModels[pData.id] = p;
                this.scene.add(p.meshGroup);

                const house = HouseBuilder.build(colors[index], this.windows, pData.id);
                house.position.copy(p.homePos);
                house.lookAt(0, 0, 0);
                this.houses[pData.id] = house;
                this.scene.add(house);
            }
            // Update dead status
            this.playerModels[pData.id].setDead(!pData.isAlive);
        });

        this.updatePlayerTargets(this.isNight ? "home" : "fire");
    }

    setCampfireActive(active) {
        this.campfireActive = active;
        if(!active) {
            this.flameVisualGroup.visible = false;
        } else {
            this.flameVisualGroup.visible = true;
        }
    }

    setNight(state) {
        this.isNight = state;
        this.updatePlayerTargets(state ? "home" : "fire");
        
        // Kamera her zaman köyün tamamını (kuşbakışı/ateş merkezli) görecek şekilde kalır
        this.cameraMode = 'fire';
        this.cameraFollowTarget = null;
    }
    
    // Kameralı odaklanmayı kaldırıyoruz, POV aynı kalacak. Sadece animasyonlar kişiye özel gidecek.
    watchHouse(targetId) {
        this.cameraMode = 'fire';
        this.cameraFollowTarget = null;
    }

    getPlayerScreenCoords(playerId) {
        if (!this.playerModels[playerId]) return null;
        const playerPos = this.playerModels[playerId].mesh.position.clone();
        
        // Y offset for head
        playerPos.y += 3.5;
        
        playerPos.project(this.camera);

        const x = (playerPos.x *  .5 + .5) * window.innerWidth;
        const y = (playerPos.y * -.5 + .5) * window.innerHeight;

        return { x, y };
    }

    updatePlayerTargets(mode = "fire") {
        Object.values(this.playerModels).forEach((player, index, arr) => {
            player.isNight = this.isNight;
            if (mode === "home") {
                player.setTarget(player.homePos);
            } else {
                const angle = (index / arr.length) * Math.PI * 2;
                const radius = this.currentFireRadius;
                player.setTarget(new THREE.Vector3(
                    Math.cos(angle) * radius,
                    1.0,
                    Math.sin(angle) * radius
                ));
            }
        });
    }

    // Advanced Animations
    animatePlayerAction(actorId, targetId, actionType, callback) {
        const actor = this.playerModels[actorId];
        const target = this.playerModels[targetId];
        if(!actor || !target || actor.isDead) {
            if(callback) setTimeout(callback, 500);
            return;
        }

        const doorPos = target.homePos.clone();
        doorPos.multiplyScalar(0.85); // Doorstep
        
        const speed = (actionType === 'KILL' || actionType === 'POLICE_BLOCK') ? 15.0 : 10.0;

        // Walk to target
        actor.setTarget(doorPos, speed);

        // Calculate time to arrive approx
        const dist = actor.meshGroup.position.distanceTo(doorPos);
        const walkTime = (dist / speed) * 1000 + 500;

        setTimeout(() => {
            if(actionType === 'KILL') {
                actor.playAnim('hit', 0.5);
                target.playAnim('hit', 0.5);
                // Create slash particle or red flash
            } else if (actionType === 'POLICE_BLOCK') {
                actor.playAnim('blocked', 1.0); // Simple stop and wait
                // Could spawn a police shield icon
            } else if (actionType === 'TRAPPED') {
                actor.playAnim('trapped', 2.0);
            }

            // Wait for action duration
            setTimeout(() => {
                // Send back home
                actor.setTarget(actor.homePos, speed);
                
                setTimeout(() => {
                    if(callback) callback();
                }, walkTime);
                
            }, 1000);
            
        }, walkTime);
    }
    
    // Hang animation for voting
    animateHang(targetId, callback) {
        const target = this.playerModels[targetId];
        if(!target) return;
        
        target.setTarget(new THREE.Vector3(0, 1.0, 0), 2.0); // Walk to fire
        setTimeout(() => {
            target.playAnim('hang', 2.0);
            setTimeout(() => {
                target.setDead(true);
                if(callback) callback();
            }, 2000);
        }, 3000);
    }

    animate() {
        requestAnimationFrame(this.animate);
        const delta = Math.min(this.clock.getDelta(), 0.1); 
        const time = this.clock.getElapsedTime();

        // Camera Update logic
        // POV daima aynı (kuşbakışı) kalır
        this.targetCamX = 0;
        const aspect = window.innerWidth / window.innerHeight;
        // Make camera zoom adaptive to screen aspect ratio and house radius
        // We ensure a minimum radius to keep things looking good, but allow much closer zooms.
        const baseRadius = this.houseRadius + 5; // 5 is margin for UI
        let distanceZ = baseRadius * 1.8;
        let distanceY = baseRadius * 1.2;

        if (aspect < 1.0) {
            // Mobile (portrait) - need to zoom out more to fit width
            distanceZ = (baseRadius * 2.2) / aspect;
            distanceY = (baseRadius * 1.5) / aspect;
        }

        this.targetCamY = Math.max(12, distanceY);
        this.targetCamZ = Math.max(18, distanceZ);

        this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, this.targetCamX, delta * 2);
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, this.targetCamY, delta * 2);
        this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, this.targetCamZ, delta * 2);
        
        if(this.cameraMode === 'fire') {
            this.camera.lookAt(0,0,0);
        } else if (this.cameraFollowTarget) {
            const lookPos = this.cameraFollowTarget.position.clone();
            this.camera.lookAt(lookPos);
        }

        // Environment Colors
        const targetBg = this.isNight ? new THREE.Color(0x020408) : new THREE.Color(0x3a5f7a);
        this.scene.background = this.scene.background || new THREE.Color(0x3a5f7a);
        this.scene.background.lerp(targetBg, delta * 2);
        this.scene.fog.color.lerp(targetBg, delta * 2);

        this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, this.isNight ? 0.05 : 0.5, delta * 2);
        this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, this.isNight ? 0.02 : 0.4, delta * 2);
        this.dirLight.intensity = THREE.MathUtils.lerp(this.dirLight.intensity, this.isNight ? 0.01 : 1.3, delta * 2);
        
        this.starsMat.opacity = THREE.MathUtils.lerp(this.starsMat.opacity, this.isNight ? 0.95 : 0, delta * 1.8);
        this.moon.material.emissiveIntensity = THREE.MathUtils.lerp(this.moon.material.emissiveIntensity, this.isNight ? 0.95 : 0.22, delta * 1.5);
        this.moon.position.y = THREE.MathUtils.lerp(this.moon.position.y, this.isNight ? 60 : 10, delta * 1.5);
        this.sun.material.opacity = THREE.MathUtils.lerp(this.sun.material.opacity, this.isNight ? 0 : 1, delta * 2);
        this.sun.position.y = THREE.MathUtils.lerp(this.sun.position.y, this.isNight ? -20 : 70, delta * 1.5);

        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.renderer.toneMappingExposure, this.isNight ? 0.6 : 1.0, delta * 1.2);

        if(this.campfireActive) {
            this.flickerTimer += delta;
            if (this.flickerTimer > 0.12) {
                const baseIntensity = (this.isNight ? 180 : 80) * this.fireScale;
                const variance = (this.isNight ? 150 : 40) * this.fireScale;
                this.targetFlicker = baseIntensity + Math.random() * variance; 
                this.flickerTimer = 0;
            }
            
            this.fireLight.intensity = THREE.MathUtils.lerp(this.fireLight.intensity, this.targetFlicker, delta * 10);
            this.fireLight.distance = 60 * this.fireScale; 
            this.emberBed.material.emissiveIntensity = 0.6 + (this.fireLight.intensity / (300 * this.fireScale)) * 0.4;

            this.particles.forEach(p => {
                p.life += delta * p.speed;
                if (p.life >= 1.0) { p.life = 0; p.xOffset = (Math.random() - 0.5) * 0.5; p.zOffset = (Math.random() - 0.5) * 0.5; }
                const height = p.life * 2.3; 
                const wobbleX = Math.sin(time * p.wobbleSpeed) * p.wobbleSize * p.life;
                const wobbleZ = Math.cos(time * p.wobbleSpeed * 0.8) * p.wobbleSize * p.life;

                p.mesh.position.set(p.xOffset * (1 - p.life) + wobbleX, 0.4 + height, p.zOffset * (1 - p.life) + wobbleZ);
                p.mesh.rotation.x += delta * p.rotSpeed; p.mesh.rotation.y += delta * p.rotSpeed;

                const scale = Math.max(0.001, 1 - p.life);
                p.mesh.scale.set(scale, scale * 1.4, scale);

                if (p.life < 0.3) {
                    p.mesh.material.color.lerpColors(this.colorCore, this.colorMid, p.life / 0.3);
                    p.mesh.material.opacity = p.life / 0.3; 
                } else {
                    const factor = (p.life - 0.3) / 0.7;
                    p.mesh.material.color.lerpColors(this.colorMid, this.colorEdge, factor);
                    p.mesh.material.opacity = 1.0 - factor;
                }
            });
        } else {
            this.fireLight.intensity = THREE.MathUtils.lerp(this.fireLight.intensity, 0, delta * 5);
        }

        const winColorDay = new THREE.Color(0x4488ff); 
        const winColorNight = new THREE.Color(0xffcc00);
        const winEmissiveDay = new THREE.Color(0x000000);
        const winEmissiveNight = new THREE.Color(0xffaa00);
        this.windows.forEach(win => {
            win.color.lerp(this.isNight ? winColorNight : winColorDay, delta * 2);
            win.emissive.lerp(this.isNight ? winEmissiveNight : winEmissiveDay, delta * 2);
        });

        Object.values(this.playerModels).forEach(p => p.update(delta, time));
        this.renderer.render(this.scene, this.camera);
    }
}

// Global hook
window.initGameScene = (containerId) => {
    window.gameScene = new GameScene(containerId);
};
