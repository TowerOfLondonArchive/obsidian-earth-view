import * as leaflet from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import {general2DProjection, Mat3, getMatrixString} from './matrix'
import {Browser, ImageOverlayOptions} from "leaflet";
import win = Browser.win;

export type CornersT = [leaflet.LatLng, leaflet.LatLng, leaflet.LatLng, leaflet.LatLng];

export class DistortableImageOverlay extends leaflet.ImageOverlay {
	corners: CornersT
	counter: number

	constructor(imageUrl: string, options?: ImageOverlayOptions){
		super(
			imageUrl,
			new leaflet.LatLngBounds(new leaflet.LatLng(0, 0), new leaflet.LatLng(1, 1)),
			options
		);
		this.corners = [
			new leaflet.LatLng(0, 0),
			new leaflet.LatLng(1, 0),
			new leaflet.LatLng(0, 1),
			new leaflet.LatLng(1, 1),
		];
		this.counter = 0;
		window.setInterval(this.updateOpacity.bind(this), 100);
	};

	updateOpacity(){
		this.setOpacity(0.5 + Math.sin(this.counter)/2);
		this.counter += 0.2;
	}

	onAdd(map: leaflet.Map): this {
		leaflet.ImageOverlay.prototype.onAdd.call(this, map);
		// window.setInterval(() => {
		// 	console.log("interval");
		// 	this.setCorners(this.getCorners());
		// }, 1000);
		// map.off('zoomanim');
		map.on('moveend', this._animateZoom, this);
		return this;
	}

	_animateZoom(event: leaflet.ZoomAnimEvent) {
		// const map = this._map;
		// const image = this.getElement();
		// const latLngToNewLayerPoint = function (latlng: leaflet.LatLng) {
		// 	return map._latLngToNewLayerPoint(latlng, event.zoom, event.center);
		// };
		// const transformMatrix: Mat3 = this._calculateProjectiveTransform(
		// 	latLngToNewLayerPoint
		// );
		// const topLeft = latLngToNewLayerPoint(this.getCorner(0));
		// const warp = getMatrixString(transformMatrix);
		// const translation = this._getTranslateString(topLeft);
		//
		// if (image){
		// 	/* See L.DomUtil.setPosition. Mainly for the purposes of L.Draggable. */
		// 	image._leaflet_pos = topLeft;
		//
		// 	image.style[L.DomUtil.TRANSFORM] = [translation, warp].join(' ');
		// }
		this.setCorners(this.getCorners());
		// window.setTimeout(()=>{
		// 	this.setCorners(this.getCorners());
		// }, 1000);
	}

	getCorners(): CornersT {
		return [
			this.corners[0],
			this.corners[1],
			this.corners[3],
			this.corners[2],
		];
	}

	getCorner(i: number): leaflet.LatLng {
		return this.corners[i];
	}

	setCorners(corners: [leaflet.LatLng, leaflet.LatLng, leaflet.LatLng, leaflet.LatLng]): DistortableImageOverlay {
		this.corners[0] = corners[0];
		this.corners[1] = corners[1];
		this.corners[2] = corners[3];
		this.corners[3] = corners[2];
		this.setBounds(leaflet.latLngBounds(this.getCorners()));
		this.fire('update');

		let latLngToLayerPoint = this._map.latLngToLayerPoint.bind(this._map);
		let transformMatrix: Mat3 = this._calculateProjectiveTransform(latLngToLayerPoint);
		const topLeft = latLngToLayerPoint(this.getCorner(0));
		const warp = getMatrixString(transformMatrix);
		const translation = this._getTranslateString(topLeft);
		/* See L.DomUtil.setPosition. Mainly for the purposes of L.Draggable. */

		const image = this.getElement();
		if (image){
			// @ts-ignore
			image._leaflet_pos = topLeft;
			// @ts-ignore
			image.style[leaflet.DomUtil.TRANSFORM] = [translation, warp].join(' ');

			/* Set origin to the upper-left corner rather than
			 * the center of the image, which is the default.
			 */
			// @ts-ignore
			image.style[leaflet.DomUtil.TRANSFORM + '-origin'] = '0 0 0';
		}

		return this;
	}

	/* Copied from Leaflet v0.7 https://github.com/Leaflet/Leaflet/blob/66282f14bcb180ec87d9818d9f3c9f75afd01b30/src/dom/DomUtil.js#L189-L199 */
  	/* since L.DomUtil.getTranslateString() is deprecated in Leaflet v1.0 */
	_getTranslateString(point: leaflet.Point) {
		// on WebKit browsers (Chrome/Safari/iOS Safari/Android)
		// using translate3d instead of translate
		// makes animation smoother as it ensures HW accel is used.
		// Firefox 13 doesn't care
		// (same speed either way), Opera 12 doesn't support translate3d

		const is3d = leaflet.Browser.webkit3d;
		const open = 'translate' + (is3d ? '3d' : '') + '(';
		const close = (is3d ? ',0' : '') + ')';

		return open + point.x + 'px,' + point.y + 'px' + close;
	}

	_calculateProjectiveTransform(latLngToCartesian: (latlng: leaflet.LatLng) => leaflet.Point): Mat3 {
		/* Setting reasonable but made-up image defaults
		 * allow us to place images on the map before
		 * they've finished downloading. */
		const offset = latLngToCartesian(this.getCorner(0));
		const w = this.getElement()?.offsetWidth || 500;
		const h = this.getElement()?.offsetHeight || 375;
		// Convert corners to container points (i.e. cartesian coordinates).
		let c0 = latLngToCartesian(this.getCorner(0)).subtract(offset)
		let c1 = latLngToCartesian(this.getCorner(1)).subtract(offset)
		let c2 = latLngToCartesian(this.getCorner(2)).subtract(offset)
		let c3 = latLngToCartesian(this.getCorner(3)).subtract(offset)

		/*
		 * This matrix describes the action of
		 * the CSS transform on each corner of the image.
		 * It maps from the coordinate system centered
		 * at the upper left corner of the image
		 * to the region bounded by the latlngs in this._corners.
		 * For example:
		 * 0, 0, c[0].x, c[0].y
		 * says that the upper-left corner of the image
		 * maps to the first latlng in this._corners.
		 */
		return general2DProjection(
			0, 0, c0.x, c0.y,
			w, 0, c1.x, c1.y,
			0, h, c2.x, c2.y,
			w, h, c3.x, c3.y
		);
	}
}
