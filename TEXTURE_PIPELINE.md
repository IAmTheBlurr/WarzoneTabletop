# TextureWorks → Three.js material pipeline

TextureWorks is a good offline build-stage companion for Warzone Tabletop. It should generate texture maps before Vite runs; it should not ship Python, CUDA, or CuPy to the browser.

## Current machine compatibility

- GPU: NVIDIA GeForce RTX 3070 Laptop GPU
- Compute capability: 8.6
- CUDA toolkit: 13.1
- Free VRAM observed during evaluation: about 8 GB
- Missing prerequisite: `cupy-cuda13x`

That satisfies TextureWorks' RTX 20-series / compute 7.5+ requirement. Installing CuPy and checking out TextureWorks are intentionally left as an explicit asset-tooling setup step rather than silently adding a large GPU dependency to this small web project.

## Suggested asset convention

Place generated sets under:

```text
public/assets/materials/<material-name>/
  <material-name>_albedo.png
  <material-name>_normal.png
  <material-name>_height.png
  <material-name>_ao.png
  <material-name>_roughness.png
  <material-name>_metallic.png
  <material-name>_specular.png
```

Generate a set from a Codex/ImageGen albedo using TextureWorks' PTX backend:

```powershell
python -m textureworks.pipeline <albedo.png> --backend ptx --output <output-directory>
```

## Three.js wiring

`THREE.MeshStandardMaterial` accepts the generated maps directly:

```ts
const loader = new THREE.TextureLoader();
const material = new THREE.MeshStandardMaterial({
  map: loader.load('/assets/materials/plaster/plaster_albedo.png'),
  normalMap: loader.load('/assets/materials/plaster/plaster_normal.png'),
  bumpMap: loader.load('/assets/materials/plaster/plaster_height.png'),
  aoMap: loader.load('/assets/materials/plaster/plaster_ao.png'),
  roughnessMap: loader.load('/assets/materials/plaster/plaster_roughness.png'),
  metalnessMap: loader.load('/assets/materials/plaster/plaster_metallic.png'),
});
```

Albedo textures use `THREE.SRGBColorSpace`; data maps remain linear. AO needs a second UV channel on authored geometry. Height maps are inexpensive as `bumpMap`; true displacement also requires subdivided geometry and costs more at runtime.

Automated metallic inference should be reviewed per material. Drywall, fabric, rubble, wood, and neoprene should remain nonmetallic even when bright or saturated albedo regions could fool a heuristic. Normal, height, AO, and roughness are the highest-value TextureWorks outputs for this scene.

