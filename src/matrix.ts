import * as leaflet from 'leaflet';


export type Mat3 = [number, number, number, number, number, number, number, number, number]
export type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]
export type Vec3 = [number, number, number]

// Compute the adjugate of m
function adj(m: Mat3): Mat3 {
	return [
		m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
		m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
		m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
	];
}

// multiply two 3*3 matrices
function multmm(a: Mat3, b: Mat3): Mat3 {
	var c: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	for (var i = 0; i < 3; i++) {
		for (var j = 0; j < 3; j++) {
			var cij = 0;

			for (var k = 0; k < 3; k++) {
				cij += a[3 * i + k] * b[3 * k + j];
			}

			c[3 * i + j] = cij;
		}
	}
	return c;
}

// multiply a 3*3 matrix and a 3-vector
function multmv(m: Mat3, v: Vec3): Vec3 {
	return [
		m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
		m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
		m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
	];
}

// multiply a scalar and a 3*3 matrix
function multsm(s: number, m: Mat3): Mat3 {
	return [
		s * m[0], s * m[1], s * m[2],
		s * m[3], s * m[4], s * m[5],
		s * m[6], s * m[7], s * m[8],
	]
}

function basisToPoints(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): Mat3 {
	var m: Mat3 = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
	var v: Vec3 = multmv(adj(m), [x4, y4, 1]);
	return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

export function general2DProjection(
	x1s: number, y1s: number, x1d: number, y1d: number,
	x2s: number, y2s: number, x2d: number, y2d: number,
	x3s: number, y3s: number, x3d: number, y3d: number,
	x4s: number, y4s: number, x4d: number, y4d: number
): Mat3 {
	var s = basisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
	var d = basisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
	var m = multmm(d, adj(s)); // Normalize to the unique matrix with m[8] == 1.
	// See: http://franklinta.com/2014/09/08/computing-css-matrix3d-transforms/

	return multsm(1 / m[8], m);
}

export function getMatrixString(m: Mat3): string {
    var is3d = leaflet.Browser.webkit3d || leaflet.Browser.gecko3d || leaflet.Browser.ie3d;
    /*
     * Since matrix3d takes a 4*4 matrix, we add in an empty row and column,
     * which act as the identity on the z-axis.
     * See:
     *     http://franklinta.com/2014/09/08/computing-css-matrix3d-transforms/
     *     https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function#M.C3.B6bius'_homogeneous_coordinates_in_projective_geometry
     */

    var matrix: Mat4 = [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, m[8]];
    var str = is3d ? 'matrix3d(' + matrix.join(',') + ')' : '';

    if (!is3d) {
      console.log('Your browser must support 3D CSS transforms' + 'in order to use DistortableImageOverlay.');
    }

    return str;
  }
