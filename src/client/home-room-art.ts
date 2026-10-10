import * as T from 'three';
import { PartBuilder } from '../assets/claude-geometry/style/geometry.ts';
import type { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { libraryMaterials, makeKit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import type { HomeMaterial, HomeRoom } from '../shared/home.ts';
import { HOME_ART_THEMES } from './art-profile.ts';

/** Room finishes are derived visuals, never furniture or collision geometry. */
export function createHomeRoomArt(room: HomeRoom, library: StyleLibrary) {
  const { width, depth, height } = room;
  const b = new PartBuilder('medium'), source = libraryMaterials(library), kit = makeKit(b, source);
  // Continuous room surfaces use their shape; the host draws screen-space lines.
  const own = (material: T.MeshStandardMaterial, name: string) => {
    const result = material.clone();
    result.name = name;
    result.onBeforeCompile = material.onBeforeCompile;
    result.customProgramCacheKey = material.customProgramCacheKey;
    result.userData = { ...material.userData, sharedResource: false, ownedResource: true };
    return result;
  };
  const boards = kit.m('tread') as T.MeshStandardMaterial;
  const boardTones = [-.025, 0, .025].map((delta, i) => {
    const material = own(boards, `home:boards:${i}`);
    material.color.offsetHSL(0, -.035, delta);
    return material;
  });
  const plaster = kit.m('skinInner'), wood = kit.m('post');
  const panelling = own(kit.m('leaf') as T.MeshStandardMaterial, 'home:panelling');
  const trim = own(kit.m('skinInner') as T.MeshStandardMaterial, 'home:trim');
  const glass = new T.MeshBasicMaterial({ color: '#b9d1c7', side: T.DoubleSide });
  glass.name = 'home:window-daylight'; glass.userData.ownedResource = true;
  const distant = new T.MeshBasicMaterial({ color: '#8eab9b', side: T.DoubleSide });
  distant.name = 'home:window-horizon'; distant.userData.ownedResource = true;

  b.box(wood, [width, .16, depth], { position: [0, -.08, 0] }, 0);
  // 25 cm boards, staggered joints and slight tonal changes give a human scale
  // without introducing a texture or a mesh per board.
  const rows = Math.ceil(depth / .25), rowDepth = depth / rows, length = 2.7;
  for (let row = 0; row < rows; row++) {
    const z = -depth / 2 + rowDepth * (row + .5);
    const offset = [0, .9, 1.8][row % 3];
    for (let start = -width / 2 - offset, index = 0; start < width / 2; start += length, index++) {
      const left = Math.max(-width / 2 + .025, start), right = Math.min(width / 2 - .025, start + length);
      if (right - left < .02) continue;
      b.box(boardTones[(row * 2 + index) % boardTones.length], [right - left - .007, .014, rowDepth - .007], { position: [(left + right) / 2, .007, z] }, 0);
    }
  }

  /** Each wall is a continuous surface with a genuine opening and deep reveal. */
  const wall = (span: number, opening: { center: number; width: number }) => {
    const left = opening.center - opening.width / 2, right = opening.center + opening.width / 2;
    const sill = 1, top = Math.min(height - .38, 2.18), panelHeight = .72;
    b.extrude(plaster, [[-span / 2, 0], [span / 2, 0], [span / 2, height], [-span / 2, height]], .18,
      { position: [0, 0, -.09] }, 0, [[[left, sill], [left, top], [right, top], [right, sill]]]);
    b.box(panelling, [span, panelHeight, .018], { position: [0, panelHeight / 2, .1] }, 0);
    b.box(trim, [span, .09, .045], { position: [0, .055, .11] }, .012);
    b.box(trim, [span, .035, .04], { position: [0, panelHeight + .015, .114] }, .009);
    b.box(trim, [span, .12, .22], { position: [0, height - .025, .005] }, .012);
    b.box(wood, [span + .12, .055, .23], { position: [0, height + .045, 0] }, .009);
    // Window glazing sits at the outer edge of the wall; the sill and reveal
    // make its depth legible instead of presenting another painted wall square.
    b.box(trim, [opening.width + .16, .09, .34], { position: [opening.center, sill - .035, .03] }, .014);
    for (const x of [left - .025, right + .025]) b.box(trim, [.05, top - sill + .07, .21], { position: [x, (top + sill) / 2, .005] }, .006);
    b.box(trim, [opening.width + .15, .065, .23], { position: [opening.center, top + .03, .014] }, .009);
    b.geometry(glass, new T.PlaneGeometry(opening.width, top - sill), { position: [opening.center, (top + sill) / 2, -.078] });
    // Frosted, low-contrast distant foliage has no reflection pass or light.
    const horizon = new T.Shape();
    horizon.moveTo(left, sill); horizon.lineTo(right, sill); horizon.lineTo(right, sill + .27);
    horizon.lineTo(opening.center + opening.width * .23, sill + .35);
    horizon.lineTo(opening.center - opening.width * .18, sill + .18); horizon.lineTo(left, sill + .29); horizon.closePath();
    b.geometry(distant, new T.ShapeGeometry(horizon), { position: [0, 0, -.075] });
    for (const x of [left + .028, opening.center, right - .028]) b.box(trim, [.045, top - sill, .065], { position: [x, (top + sill) / 2, -.025] }, 0);
    for (const y of [sill + .027, top - .027]) b.box(trim, [opening.width, .05, .065], { position: [opening.center, y, -.025] }, 0);
  };
  b.within({ position: [0, 0, -depth / 2] }, () => wall(width, { center: .65, width: Math.min(2.65, width * .37) }));
  b.within({ position: [-width / 2, 0, 0], rotation: [0, Math.PI / 2, 0] }, () => wall(depth, { center: 1.3, width: Math.min(1.8, depth * .3) }));
  // Narrow corner posts, and the low cutaway edge, make the room a complete
  // volume while keeping the front/right walls out of the player's view.
  for (const [x, z] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [-width / 2, depth / 2]]) {
    b.box(trim, [.13, height, .13], { position: [x, height / 2, z] }, .012);
  }
  b.box(wood, [.09, .1, depth], { position: [width / 2, -.006, 0] }, .008);
  for (const side of [-1, 1]) b.box(wood, [(width - 1.2) / 2, .1, .09], { position: [side * (width / 4 + .3), -.006, depth / 2] }, .008);
  const built = b.build('home-room-finish');
  // Opaque daylight panes must not cast a second shadow over their openings.
  built.group.traverse(object => {
    if (object instanceof T.Mesh && (object.material === glass || object.material === distant)) object.castShadow = false;
  });
  built.group.userData.roomDimensions = { ...room };
  return built;
}

export function applyHomeRoomTheme(root: T.Object3D, material: HomeMaterial) {
  const [plaster, paint] = HOME_ART_THEMES[material];
  root.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    for (const surface of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(surface instanceof T.MeshStandardMaterial)) continue;
      if (surface.name === 'home:panelling') surface.color.set(paint).lerp(new T.Color(plaster), .63);
      if (surface.name === 'home:trim') surface.color.set(plaster).offsetHSL(0, -.03, .025);
    }
  });
}
