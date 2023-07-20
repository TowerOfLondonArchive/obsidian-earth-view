import {
	View,
	ItemView,
	WorkspaceLeaf,
	addIcon,
	TFile
} from 'obsidian';
import * as leaflet from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './styles.css'
import EarthPlugin from './main';
import {File} from "./database";

import {point, Point, polygon, Polygon, multiPolygon, MultiPolygon, Feature} from '@turf/helpers'
import booleanIntersects from '@turf/boolean-intersects'


const ViewName = "tol-map";


// class map ItemView
class MapView extends ItemView {
	private plugin: EarthPlugin;
	private map_el: HTMLDivElement;
	private map: leaflet.Map;
	private data: [Feature<Point>[], Feature<Polygon>[], leaflet.Layer][];
	private user_selection: Feature<Polygon | MultiPolygon> | null;
	private user_layer: leaflet.Polygon | null;

	constructor(
		plugin: EarthPlugin,
		leaf: WorkspaceLeaf
	) {
		super(leaf);
		this.plugin = plugin;
		this.data = []
		// this.user_selection = null;
		this.user_selection = null;
		this.user_layer = null;

		this.#initMap();
		this.#populateData();
		this.#populateMap();
	}

	#initMap(){
		this.map_el = this.contentEl.createDiv(
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

		this.map.fitBounds(this.plugin.default_bounds);

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
			title: "edit",
			block: "custom",
			className: "jgc-edit",
			onClick: () => {
				if (this.user_layer !== null){
					this.user_layer.pm.disableLayerDrag();
					this.user_layer.pm.enable();
				}
			}
		})

		this.map.pm.Toolbar.createCustomControl({
			name: "drag",
			title: "drag",
			block: "custom",
			className: "jgc-drag",
			onClick: () => {
				if (this.user_layer !== null){
					this.user_layer.pm.disable();
					this.user_layer.pm.enableLayerDrag();
				}
			}
		})

		this.map.pm.Toolbar.createCustomControl({
			name: "remove",
			title: "remove",
			block: "custom",
			className: "jgc-remove",
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
	}

	#populateData(){
		function flatten_layer(geojson: leaflet.LayerGroup): [leaflet.Marker[], leaflet.Polygon[]] {
			let markers: leaflet.Marker[] = [];
			let polygons: leaflet.Polygon[] = [];

			geojson.eachLayer(function (layer){
				if (layer instanceof leaflet.Marker) {
					markers.push(layer);
				} else if (layer instanceof leaflet.Polygon){
					polygons.push(layer)
				} else if (layer instanceof leaflet.LayerGroup){
					let [markers_, polygons_] = flatten_layer(layer);
					markers.push(...markers_);
					polygons.push(...polygons_);
				}
			})

			return [markers, polygons];
		}

		Array.from(
			this.plugin.database.files.values()
		).map(function (file: File){
			let geojson;
			try {
				geojson = leaflet.geoJSON(file.geojson);
			} catch (e) {
				console.log("Failed parsing geoJSON in file " + file.tfile.path);
				return
			}
			let [markers, polygons] = flatten_layer(geojson);
			if (markers.length){
				// Only display features if they have one or more marker

				let turf_markers: Feature<Point>[] = [];
				// Make a turf feature collection containing all the items
				markers.forEach(function (marker){
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
				polygons.forEach(function (poly){
					parse_polygon(poly.getLatLngs());
				})

				// Add click events to all markers
				markers.forEach(function (marker: leaflet.Marker){
					marker.on("click", async function (){
						await this.plugin.app.workspace.getLeaf(true).openFile(file.tfile);
					}.bind(this))
				}.bind(this))
				let layer = leaflet.layerGroup(markers, {snapIgnore: true});

				this.data.push([turf_markers, turf_polygons, layer]);
			}
		}.bind(this))
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

	getViewType() {
		return ViewName;
	}

	getDisplayText() {
		return 'Map View';
	}
}


export default class EarthViewManager {
	plugin: EarthPlugin;

	constructor(
		plugin: EarthPlugin
	){
		this.plugin = plugin;
		this.plugin.registerView(ViewName, this.getView.bind(this));
		addIcon('globe', '<path fill="currentColor" stroke="currentColor" d="m50.06001,1.76c-26.54347,0 -48.06001,21.74039 -48.06001,48.56c0,26.81961 21.51654,48.56 48.06001,48.56c26.54347,0 48.06001,-21.74039 48.06001,-48.56c0,-26.81961 -21.51654,-48.56 -48.06001,-48.56zm15.94701,70.02039c-0.75578,0.75973 -1.54838,1.55666 -2.19177,2.2087c-0.57943,0.58742 -0.98833,1.3119 -1.19569,2.09709c-0.29262,1.10826 -0.52905,2.22828 -0.92438,3.30325l-3.37001,9.17353c-2.66656,0.58742 -5.42613,0.91833 -8.26516,0.91833l0,-5.36118c0.32751,-2.47108 -1.48056,-7.09994 -4.38548,-10.03508c-1.16274,-1.17484 -1.81582,-2.7687 -1.81582,-4.4311l0,-6.26776c0,-2.27919 -1.21507,-4.37432 -3.18979,-5.47671c-2.78477,-1.55666 -6.74584,-3.73207 -9.45891,-5.11251c-2.22471,-1.13176 -4.28277,-2.5729 -6.13346,-4.25879l-0.15503,-0.14098c-1.32339,-1.20715 -2.49854,-2.57055 -3.49985,-4.06103c-1.81775,-2.69625 -4.77887,-7.13127 -6.70321,-10.01354c3.96689,-8.90919 11.11582,-16.06396 19.99917,-19.95072l4.65291,2.35164c2.06193,1.04169 4.48818,-0.47189 4.48818,-2.80199l0,-2.21261c1.54838,-0.25259 3.1239,-0.41315 4.72655,-0.47385l5.48427,5.54132c1.21119,1.22379 1.21119,3.20731 0,4.4311l-0.90888,0.91637l-2.00379,2.02464c-0.60463,0.61092 -0.60463,1.60365 0,2.21457l0.90888,0.91833c0.60463,0.61092 0.60463,1.60365 0,2.21457l-1.55032,1.56645c-0.29107,0.29351 -0.68563,0.45838 -1.09685,0.45819l-1.74218,0c-0.40308,0 -0.79066,0.1586 -1.08135,0.44448l-1.9224,1.88953c-0.48351,0.47581 -0.60734,1.21263 -0.30619,1.82296l3.02119,6.1072c0.51548,1.04169 -0.23449,2.26744 -1.3856,2.26744l-1.09298,0c-0.37402,0 -0.73447,-0.13706 -1.01546,-0.38378l-1.79837,-1.5782c-0.82787,-0.72566 -1.97337,-0.95651 -3.01344,-0.607l-6.04045,2.03443c-0.9457,0.31858 -1.58365,1.21302 -1.58327,2.22045c0,0.887 0.4961,1.69568 1.28095,2.09317l2.1472,1.08477c1.82357,0.92225 3.83511,1.40197 5.87379,1.40197c2.03867,0 4.37772,5.34356 6.20129,6.26581l12.93551,0c1.64528,0 3.2208,0.65987 4.38548,1.83471l2.65299,2.68059c1.10829,1.12021 1.73074,2.63947 1.73055,4.22355c-0.00078,2.42428 -0.95771,4.74811 -2.6588,6.4577zm16.80356,-17.88692c-1.12205,-0.28392 -2.10069,-0.97903 -2.74213,-1.95219l-3.48435,-5.2809c-1.04259,-1.57781 -1.04259,-3.63456 0,-5.21237l3.79635,-5.75279c0.44959,-0.67945 1.06585,-1.23162 1.79062,-1.59582l2.5154,-1.27078c2.62005,5.27111 4.13161,11.20013 4.13161,17.49139c0,1.69764 -0.1434,3.36004 -0.3527,5.0009l-5.6548,-1.42743z" fill="#000000" id="shape0" stroke="#000000" stroke-linecap="square" stroke-linejoin="bevel" stroke-opacity="0" stroke-width="0"/>');
		this.plugin.addRibbonIcon('globe', 'Open Map View', async () => {
			await this.plugin.app.workspace.getLeaf().setViewState({ type: ViewName });
		});
	}

	getView(leaf: WorkspaceLeaf): View {
		return new MapView(this.plugin, leaf);
	}
}
