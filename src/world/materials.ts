import * as THREE from 'three';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for procedural materials.');
  return [canvas, context];
}

function textureFromCanvas(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

export function createBattleMatMaterial(): THREE.MeshStandardMaterial {
  const texture = new THREE.TextureLoader().load('/assets/textures/battle-mat-fiber.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 4);
  texture.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 0.035,
    color: 0xd7ddc8,
    roughness: 0.96,
    metalness: 0,
  });
}

export function createPlasterMaterial(): THREE.MeshStandardMaterial {
  const [canvas, context] = canvas2d(256);
  const random = seededRandom(0x57a11);
  context.fillStyle = '#bdb7aa';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 5600; index += 1) {
    const shade = 150 + Math.floor(random() * 75);
    context.fillStyle = `rgba(${shade}, ${shade - 4}, ${shade - 10}, ${0.035 + random() * 0.09})`;
    const size = 0.35 + random() * 1.5;
    context.fillRect(random() * 256, random() * 256, size, size);
  }
  for (let index = 0; index < 14; index += 1) {
    context.strokeStyle = `rgba(105, 98, 88, ${0.025 + random() * 0.025})`;
    context.lineWidth = 0.45;
    context.beginPath();
    const startX = random() * 256;
    const startY = random() * 256;
    context.moveTo(startX, startY);
    context.lineTo(startX + random() * 42 - 21, startY + random() * 54 - 27);
    context.stroke();
  }
  const plasterTexture = textureFromCanvas(canvas, 6, 4);
  return new THREE.MeshStandardMaterial({
    map: plasterTexture,
    bumpMap: plasterTexture,
    bumpScale: 0.28,
    color: 0xf0e8dc,
    roughness: 0.98,
  });
}

export function createRubbleFootprintMaterial(): THREE.MeshStandardMaterial {
  const [canvas, context] = canvas2d(512);
  const random = seededRandom(0xb45e5);
  context.fillStyle = '#625f55';
  context.fillRect(0, 0, 512, 512);

  for (let index = 0; index < 9200; index += 1) {
    const shade = 68 + Math.floor(random() * 78);
    const warm = Math.floor(random() * 14);
    context.fillStyle = `rgba(${shade + warm}, ${shade + Math.floor(warm * 0.6)}, ${shade - 8}, ${0.08 + random() * 0.34})`;
    const radius = 0.35 + random() * 2.4;
    context.beginPath();
    context.arc(random() * 512, random() * 512, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let stone = 0; stone < 180; stone += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const radius = 2 + random() * 9;
    const sides = 4 + Math.floor(random() * 4);
    context.fillStyle = `rgba(${92 + Math.floor(random() * 45)}, ${88 + Math.floor(random() * 38)}, ${76 + Math.floor(random() * 34)}, ${0.38 + random() * 0.42})`;
    context.beginPath();
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const jitter = radius * (0.65 + random() * 0.5);
      const px = x + Math.cos(angle) * jitter;
      const py = y + Math.sin(angle) * jitter;
      if (side === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  }

  for (let crack = 0; crack < 34; crack += 1) {
    const x = random() * 512;
    const y = random() * 512;
    context.strokeStyle = `rgba(34, 32, 29, ${0.18 + random() * 0.22})`;
    context.lineWidth = 0.5 + random() * 1.1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + random() * 46 - 23, y + random() * 46 - 23);
    context.lineTo(x + random() * 74 - 37, y + random() * 74 - 37);
    context.stroke();
  }

  const texture = textureFromCanvas(canvas, 2.4, 2.4);
  return new THREE.MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 0.12,
    color: 0xd1c8b4,
    roughness: 0.98,
    metalness: 0,
  });
}

export function createImageMaterial(
  path: string,
  emissiveIntensity = 0.18,
): THREE.MeshStandardMaterial {
  const texture = new THREE.TextureLoader().load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity,
    roughness: 0.82,
    metalness: 0,
  });
}

export function createWoodMaterial(): THREE.MeshStandardMaterial {
  const [canvas, context] = canvas2d(512);
  const random = seededRandom(0xdecaf);
  context.fillStyle = '#65442f';
  context.fillRect(0, 0, 512, 512);
  const plankHeight = 64;
  for (let row = 0; row < 8; row += 1) {
    const y = row * plankHeight;
    const light = row % 3 === 0 ? 10 : row % 2 === 0 ? 4 : -3;
    context.fillStyle = `rgb(${101 + light}, ${68 + light}, ${47 + light})`;
    context.fillRect(0, y, 512, plankHeight - 2);
    context.fillStyle = 'rgba(31, 19, 13, 0.58)';
    context.fillRect(0, y + plankHeight - 2, 512, 2);
    const offset = row % 2 === 0 ? 150 : 335;
    context.fillRect(offset, y, 2, plankHeight);
    for (let grain = 0; grain < 22; grain += 1) {
      context.strokeStyle = `rgba(${40 + Math.floor(random() * 50)}, 25, 16, ${0.045 + random() * 0.08})`;
      context.lineWidth = 0.45 + random() * 0.7;
      context.beginPath();
      const grainY = y + 5 + random() * (plankHeight - 12);
      context.moveTo(0, grainY);
      context.bezierCurveTo(160, grainY + random() * 8 - 4, 350, grainY + random() * 8 - 4, 512, grainY);
      context.stroke();
    }
  }
  for (let knot = 0; knot < 12; knot += 1) {
    context.strokeStyle = 'rgba(40, 24, 15, 0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(random() * 512, random() * 512, 3 + random() * 8, 1 + random() * 3, 0, 0, Math.PI * 2);
    context.stroke();
  }
  return new THREE.MeshStandardMaterial({
    map: textureFromCanvas(canvas, 3, 4),
    color: 0xc8ad91,
    roughness: 0.72,
  });
}

export function createFabricMaterial(color: string): THREE.MeshStandardMaterial {
  const [canvas, context] = canvas2d(128);
  const random = seededRandom(Number.parseInt(color.slice(1), 16));
  context.fillStyle = color;
  context.fillRect(0, 0, 128, 128);
  for (let line = 0; line < 128; line += 2) {
    context.fillStyle = `rgba(255, 255, 255, ${0.012 + random() * 0.025})`;
    context.fillRect(line, 0, 1, 128);
    context.fillRect(0, line, 128, 1);
  }
  return new THREE.MeshStandardMaterial({
    map: textureFromCanvas(canvas, 5, 5),
    roughness: 0.94,
  });
}

export function createRugMaterial(): THREE.MeshStandardMaterial {
  const [canvas, context] = canvas2d(512);
  context.fillStyle = '#34333a';
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = '#8b684d';
  context.lineWidth = 18;
  context.strokeRect(20, 20, 472, 472);
  context.strokeStyle = '#b59a72';
  context.lineWidth = 4;
  context.strokeRect(46, 46, 420, 420);
  context.strokeStyle = 'rgba(173, 136, 93, 0.55)';
  context.lineWidth = 3;
  for (let offset = -512; offset < 1024; offset += 64) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + 512, 512);
    context.stroke();
  }
  return new THREE.MeshStandardMaterial({
    map: textureFromCanvas(canvas, 1.7, 1.2),
    roughness: 1,
  });
}

export function createPrintedMaterial(
  title: string,
  primary: string,
  accent: string,
): THREE.MeshStandardMaterial {
  const [canvas, context] = canvas2d(512);
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(1, '#17171c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  context.fillStyle = accent;
  context.fillRect(0, 36, 512, 14);
  context.fillRect(0, 456, 512, 24);
  context.strokeStyle = 'rgba(255,255,255,0.18)';
  context.lineWidth = 3;
  for (let ring = 0; ring < 5; ring += 1) {
    context.beginPath();
    context.arc(350, 255, 45 + ring * 28, -1.2, 2.1);
    context.stroke();
  }
  context.fillStyle = '#f1eadc';
  context.font = '700 54px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(title, 256, 390);
  context.font = '600 20px Arial, sans-serif';
  context.fillStyle = 'rgba(241,234,220,0.78)';
  context.fillText('MINIATURE BATTLE KIT', 256, 426);
  return new THREE.MeshStandardMaterial({
    map: textureFromCanvas(canvas),
    roughness: 0.62,
  });
}

export function createPictureMaterial(seed: number): THREE.MeshStandardMaterial {
  const [canvas, context] = canvas2d(512);
  const random = seededRandom(seed);
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, seed % 2 === 0 ? '#28384b' : '#4a302d');
  gradient.addColorStop(1, seed % 2 === 0 ? '#b06a43' : '#756747');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 22; index += 1) {
    context.fillStyle = `hsla(${20 + random() * 210}, 35%, ${28 + random() * 45}%, ${0.2 + random() * 0.45})`;
    context.beginPath();
    context.arc(random() * 512, random() * 512, 18 + random() * 100, 0, Math.PI * 2);
    context.fill();
  }
  return new THREE.MeshStandardMaterial({ map: textureFromCanvas(canvas), roughness: 0.8 });
}
