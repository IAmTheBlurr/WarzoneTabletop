import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME } from '../constants';
import {
  BATTLEFIELD_LAYOUT,
  boardInchesToWorld,
  getFootprintSpec,
  type FootprintPlacement,
} from './layout';
import { createRubbleFootprintMaterial } from './materials';
import { PALETTE } from './palette';

export const FOOTPRINT_THICKNESS = boardInchesToWorld(1 / 16);
const FOOTPRINT_BASE_HEIGHT = 0.014;
const BORDER_HEIGHT = 0.026;
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

export function createFootprints(root: THREE.Group): THREE.Group {
  const group = new THREE.Group();
  group.name = 'raised-rubble-footprints--excluded-from-ground-rays';
  root.add(group);

  const fillMaterial = createRubbleFootprintMaterial();
  const lineMaterial = new THREE.LineBasicMaterial({
    color: PALETTE.templateDark,
    transparent: true,
    opacity: 0.78,
  });
  const markMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.templateDark,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const fillGeometries: THREE.BufferGeometry[] = [];
  const markGeometries: THREE.BufferGeometry[] = [];
  const outlinePositions: number[] = [];
  const transform = new THREE.Object3D();

  for (const placement of BATTLEFIELD_LAYOUT) {
    const shape = shapeForPlacement(placement);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: FOOTPRINT_THICKNESS,
      bevelEnabled: false,
      curveSegments: 24,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    transform.position.set(
      boardInchesToWorld(placement.boardX),
      FOOTPRINT_BASE_HEIGHT,
      boardInchesToWorld(placement.boardZ),
    );
    transform.rotation.set(0, THREE.MathUtils.degToRad(placement.rotationDegrees), 0);
    transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    fillGeometries.push(geometry);

    const outlinePoints = shape
      .getPoints(32)
      .map(
        (point) =>
          new THREE.Vector3(
            point.x,
            FOOTPRINT_THICKNESS + BORDER_HEIGHT,
            -point.y,
          ),
      );
    for (let index = 0; index < outlinePoints.length; index += 1) {
      const start = outlinePoints[index]!.clone().applyMatrix4(transform.matrix);
      const end = outlinePoints[(index + 1) % outlinePoints.length]!
        .clone()
        .applyMatrix4(transform.matrix);
      outlinePositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }

    const spec = getFootprintSpec(placement.footprintId);
    const width = boardInchesToWorld(spec.boardInches[0]);
    const depth = boardInchesToWorld(spec.boardInches[1]);
    const angle = THREE.MathUtils.degToRad(placement.rotationDegrees);
    for (const direction of [-1, 1]) {
      const localZ = direction * depth * 0.32;
      const mark = new THREE.PlaneGeometry(Math.min(width, depth) * 0.12, 0.12);
      transform.position.set(
        boardInchesToWorld(placement.boardX) + localZ * Math.sin(angle),
        FOOTPRINT_BASE_HEIGHT + FOOTPRINT_THICKNESS + BORDER_HEIGHT + 0.002,
        boardInchesToWorld(placement.boardZ) + localZ * Math.cos(angle),
      );
      transform.rotation.set(-Math.PI / 2, 0, angle);
      transform.updateMatrix();
      mark.applyMatrix4(transform.matrix);
      markGeometries.push(mark);
    }
  }

  const mergedFills = mergeGeometries(fillGeometries, false);
  if (mergedFills) {
    const fills = new THREE.Mesh(mergedFills, fillMaterial);
    fills.name = 'merged-footprint-fills';
    fills.receiveShadow = true;
    fills.renderOrder = 1;
    group.add(fills);
  }

  const outlines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(outlinePositions, 3),
    ),
    lineMaterial,
  );
  outlines.name = 'merged-footprint-outlines';
  outlines.renderOrder = 2;
  group.add(outlines);

  const mergedMarks = mergeGeometries(markGeometries, false);
  if (mergedMarks) {
    const marks = new THREE.Mesh(mergedMarks, markMaterial);
    marks.name = 'merged-registration-marks';
    marks.renderOrder = 2;
    group.add(marks);
  }

  group.userData.pieceCount = BATTLEFIELD_LAYOUT.length;
  group.userData.thicknessWorldUnits = FOOTPRINT_THICKNESS;

  return group;
}
