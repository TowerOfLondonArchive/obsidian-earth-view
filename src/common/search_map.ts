import * as leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import {point, Point, polygon, Polygon, MultiPolygon, Feature} from '@turf/helpers'
import booleanIntersects from '@turf/boolean-intersects'


export interface Resource {
	title: string | null;
	points: leaflet.Marker[];
	polygons: leaflet.Polygon[];
	get_thumbnail: (() => Promise<ArrayBuffer | null>);
	open_resource: () => void;
}


// class map ItemView
export class SearchMap {
	private map_el: HTMLDivElement;
	private map: leaflet.Map;

	private data: [Feature<Point>[], Feature<Polygon>[], leaflet.Layer][];
	private user_selection: Feature<Polygon | MultiPolygon> | null;
	private user_layer: leaflet.Polygon | null;

	constructor(
		parent: HTMLElement,
		bounds: leaflet.LatLngBounds,
		resources: Resource[],
	) {
		this.data = [];
		this.user_selection = null;
		this.user_layer = null;

		this.map_el = parent.createDiv(
			{ cls: 'geojson-map' },
			(el: HTMLDivElement) => {
				el.style.zIndex = '1';
				el.style.width = '100%';
				el.style.height = '100%';
			}
		);

		this.map = new leaflet.Map(this.map_el, {
			center: [0, 0],
			zoom: 0,
			worldCopyJump: true,
			maxBoundsViscosity: 1.0,
			zoomSnap: 0
		});
		leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxNativeZoom: 19,
			maxZoom: 25,
			attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(this.map);

		this.map.fitBounds(bounds);

		this.map.pm.addControls({
			position: 'topleft',
			drawMarker: false,
			drawCircleMarker: false,
			drawPolyline: false,
			drawRectangle: false,
			drawCircle: false,
			drawText: false,
			cutPolygon: false,
			editMode: false,
			removalMode: false,
			dragMode: false,
			rotateMode: false
		});

		this.map.pm.Toolbar.createCustomControl({
			name: "edit",
			title: "Edit",
			block: "custom",
			className: "leaflet-pm-icon-edit",
			// @ts-ignore
			afterClick: (e: any, obj: any) => {
				if (this.user_layer !== null){
					this.user_layer.pm.disableLayerDrag();
					if (obj.button._button.toggleStatus){
						this.user_layer.pm.enable();
					} else {
						this.user_layer.pm.disable();
					}
				}
			}
		})

		this.map.pm.Toolbar.createCustomControl({
			name: "drag",
			title: "Drag",
			block: "custom",
			className: "leaflet-pm-icon-drag",
			// @ts-ignore
			afterClick: (e: any, obj: any) => {
				if (this.user_layer !== null){
					this.user_layer.pm.disable();
					if (obj.button._button.toggleStatus){
						this.user_layer.pm.enableLayerDrag();
					} else {
						this.user_layer.pm.disableLayerDrag();
					}
				}
			}
		})

		this.map.pm.Toolbar.createCustomControl({
			name: "remove",
			title: "Remove",
			block: "custom",
			className: "leaflet-pm-icon-delete",
			toggle: false,
			onClick: () => {
				if (this.user_layer !== null){
					this.user_layer.remove();
					this.user_layer = null;
					this.user_selection = null;
					this.#populateMap();
				}
			}
		})

		this.map.on('pm:create', async ({layer}) => {
			if (layer instanceof leaflet.Polygon){
				if (this.user_layer !== null){
					this.user_layer.remove();
					this.user_layer = null;
				}
				this.user_layer = layer;
				this.user_selection = layer.toGeoJSON();
				layer.on('pm:edit', async e => {
					this.user_selection = layer.toGeoJSON();
					this.#populateMap();
				});
				this.#populateMap();
			}
		});

		new ResizeObserver(() => {
			this.map.invalidateSize();
		}).observe(this.map_el);

		resources.forEach(
			function (resource: Resource){
				if (!resource.points.length){
					// Only display features if they have one or more marker
					return;
				}
				let turf_markers: Feature<Point>[] = [];
				// Make a turf feature collection containing all the items
				resource.points.forEach(function (marker){
					let latLng = marker.getLatLng();
					turf_markers.push(point([latLng.lng, latLng.lat]));
				})

				let turf_polygons: Feature<Polygon>[] = [];
				function parse_polygon(poly: leaflet.LatLng[] | leaflet.LatLng[][] | leaflet.LatLng[][][]){
					let latLngs: leaflet.LatLng[] = [];

					poly.forEach(function (p){
						if (p instanceof leaflet.LatLng){
							latLngs.push(p);
						} else {
							parse_polygon(p);
						}
					})

					if (latLngs.length) {
						let points: number[][][] = [[]];
						latLngs.forEach(function (ll) {
							points[0].push([ll.lng, ll.lat]);
						})
						points[0].push(points[0][0]);
						turf_polygons.push(polygon(points));
					}
				}
				resource.polygons.forEach(function (poly){
					parse_polygon(poly.getLatLngs());
				})

				resource.get_thumbnail().then(
					(jpg: ArrayBuffer | null) => {
						if (jpg === null) {
							return;
						}
						let blob = new Blob([jpg], {type: "application/jpg"});
						let blob_path = URL.createObjectURL(blob);
						let icon = leaflet.icon({
							iconUrl: blob_path,
							iconSize: [30, 30],
						});
						resource.points.forEach(function (marker: leaflet.Marker){
							marker.setIcon(icon);
						}.bind(this));
					}
				)

				// Add click events to all markers
				resource.points.forEach(function (marker: leaflet.Marker){
					marker.on("click", resource.open_resource);
					if (resource.title !== null){
						marker.bindPopup(resource.title);
						marker.on('mouseover', function (e) {
							this.openPopup();
						});
						marker.on('mouseout', function (e) {
							this.closePopup();
						});
					}
				}.bind(this))
				let layer = leaflet.layerGroup(resource.points, {snapIgnore: true});

				this.data.push([turf_markers, turf_polygons, layer]);
			}.bind(this)
		)
		this.#populateMap();
	}

	#populateMap(){
		this.data.forEach(function (entry: [Point[], Polygon[], leaflet.Layer]){
			let [turf_markers, turf_polygons, layer] = entry;
			layer.remove();
			if (this.user_selection === null){
				layer.addTo(this.map);
			} else {
				for (let i = 0; i < turf_markers.length; i++){
					let marker = turf_markers[i];
					if (booleanIntersects(this.user_selection, marker)){
						layer.addTo(this.map);
						return;
					}
				}
				for (let i = 0; i < turf_polygons.length; i++){
					let polygon = turf_polygons[i];
					if (booleanIntersects(this.user_selection, polygon)){
						layer.addTo(this.map);
						return;
					}
				}
			}
		}.bind(this))
	}
}
