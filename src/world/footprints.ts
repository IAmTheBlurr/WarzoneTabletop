import * as THREE from 'three';
import { GAME } from '../constants';
import {
  BATTLEFIELD_LAYOUT,
  boardInchesToWorld,
  getFootprintSpec,
  type FootprintPlacement,
} from './layout';
import { PALETTE } from './palette';

const DECAL_HEIGHT = 0.02;
const BORDER_HEIGHT = 0.035;
const TRIANGLE_SAGITTA_BOARD_INCHES = 0.25;

function centeredRectangle(width: number, depth: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  return shape;
}

function truncatedTriangle(width: number, depth: number): THREE.Shape {
  const triangleSpec = GAME.footprints.pieces.find((piece) => piece.id === 'largeTri');
  const truncatedTip = boardInchesToWorld(
    triangleSpec && 'truncatedTipBoardInches' in triangleSpec
      ? (triangleSpec.truncatedTipBoardInches ?? 1.5)
      : 1.5,
  );
  const startX = width / 2;
  const startZ = -depth / 2;
  const endX = -width / 2 + truncatedTip;
  const endZ = depth / 2;
  const dx = endX - startX;
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dz);
  const sagitta = boardInchesToWorld(TRIANGLE_SAGITTA_BOARD_INCHES);
  const controlX = (startX + endX) / 2 + (dz / length) * sagitta * 2;
  const controlZ = (startZ + endZ) / 2 - (dx / length) * sagitta * 2;

  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(startX, startZ);
  shape.quadraticCurveTo(controlX, controlZ, endX, endZ);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  return shape;
}

function shapeForPlacement(placement: FootprintPlacement): THREE.Shape {
  const spec = getFootprintSpec(placement.footprintId);
  const width = boardInchesToWorld(spec.boardInches[0]);
  const depth = boardInchesToWorld(spec.boardInches[1]);
  return placement.footprintId === 'largeTri'
    ? truncatedTriangle(width, depth)
    : centeredRectangle(width, depth);
}

function addRegistrationMarks(
  group: THREE.Group,
  placement: FootprintPlacement,
  width: number,
  depth: number,
): void {
  const markMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.templateDark,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const markGeometry = new THREE.PlaneGeometry(Math.min(width, depth) * 0.12, 0.12);
  const angle = THREE.MathUtils.degToRad(placement.rotationDegrees);
  for (const direction of [-1, 1]) {
    const localZ = direction * depth * 0.32;
    const mark = new THREE.Mesh(markGeometry, markMaterial);
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = angle;
    mark.position.set(
      boardInchesToWorld(placement.boardX) + localZ * Math.sin(angle),
      BORDER_HEIGHT + 0.002,
      boardInchesToWorld(placement.boardZ) + localZ * Math.cos(angle),
    );
    group.add(mark);
  }
}

export function createFootprints(root: THREE.Group): THREE.Group {
  const group = new THREE.Group();
  group.name = 'footprint-decals--excluded-from-ground-rays';
  root.add(group);

  const fillMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.templateTan,
    roughness: 0.88,
    metalness: 0,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color: PALETTE.templateDark,
    transparent: true,
    opacity: 0.78,
  });

  for (const placement of BATTLEFIELD_LAYOUT) {
    const shape = shapeForPlacement(placement);
    const geometry = new THREE.ShapeGeometry(shape, 24);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, fillMaterial);
    mesh.position.set(
      boardInchesToWorld(placement.boardX),
      DECAL_HEIGHT,
      boardInchesToWorld(placement.boardZ),
    );
    mesh.rotation.y = THREE.MathUtils.degToRad(placement.rotationDegrees);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    mesh.name = `footprint-${placement.key}`;
    group.add(mesh);

    const outlinePoints = shape
      .getPoints(32)
      .map((point) => new THREE.Vector3(point.x, BORDER_HEIGHT, -point.y));
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outlinePoints),
      lineMaterial,
    );
    outline.position.x = mesh.position.x;
    outline.position.z = mesh.position.z;
    outline.rotation.y = mesh.rotation.y;
    outline.renderOrder = 2;
    group.add(outline);

    const spec = getFootprintSpec(placement.footprintId);
    addRegistrationMarks(
      group,
      placement,
      boardInchesToWorld(spec.boardInches[0]),
      boardInchesToWorld(spec.boardInches[1]),
    );
  }

  group.userData.pieceCount = BATTLEFIELD_LAYOUT.length;

  return group;
}
