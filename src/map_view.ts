import {
	View,
	ItemView,
	WorkspaceLeaf,
	addIcon, TAbstractFile, TFile
} from 'obsidian';
import * as leaflet from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './styles.css'
import EarthPlugin from './main';
import {Database, File} from "./database";


const ViewName = "jgc-earth-map";


// class map ItemView
class MapView extends ItemView {
	private plugin: EarthPlugin;
	private map: leaflet.Map;

	constructor(
		plugin: EarthPlugin,
		leaf: WorkspaceLeaf,
		database: Database
	) {
		super(leaf);
		this.plugin = plugin;
		const map_el = this.contentEl.createDiv(
			{ cls: 'geojson-map' },
			(el: HTMLDivElement) => {
				el.style.zIndex = '1';
				el.style.width = '100%';
				el.style.height = '100%';
			}
		);

		this.map = new leaflet.Map(map_el, {
			center: [0, 0],
			zoom: 0,
			worldCopyJump: true,
			maxBoundsViscosity: 1.0,
			zoomSnap: 0
		});
		let map = this.map;

		leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxNativeZoom: 19,
			maxZoom: 25,
			attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(this.map);

		function parseGeoJSON(file: File){
			let geojson
			try {
				geojson = leaflet.geoJSON(file.geojson);
			} catch (e) {
				return
			}
			geojson.addTo(map);
		}

		Array.from(database.files.values()).map(parseGeoJSON)

		// map.setView([51.508083,-0.076076], 17);
		map.fitBounds(this.plugin.default_bounds)
	}

	getViewType() {
		return ViewName;
	}

	getDisplayText() {
		return 'Map View';
	}

	onResize() {
		super.onResize();
		this.map.invalidateSize()
	}

	addFile(file: File){
		let geojson
		try {
			geojson = leaflet.geoJSON(file.geojson);
		} catch (e) {
			return
		}
		geojson.addTo(this.map);
	}
}


export default class EarthViewManager {
	plugin: EarthPlugin;
	database: Database;
	maps: Set<MapView>;

	constructor(
		plugin: EarthPlugin,
		database: Database
	){
		this.plugin = plugin;
		this.database = database;
		this.maps = new Set<MapView>();

		this.database.addEventListener("create", this.#fileCreated.bind(this))
		this.database.addEventListener("modify", this.#fileModified.bind(this))
		this.database.addEventListener("delete", this.#fileDeleted.bind(this))
		this.database.addEventListener("rename", this.#fileRenamed.bind(this))

		this.plugin.registerView(ViewName, this.getView.bind(this));
		addIcon('globe', '<path fill="currentColor" stroke="currentColor" d="m50.06001,1.76c-26.54347,0 -48.06001,21.74039 -48.06001,48.56c0,26.81961 21.51654,48.56 48.06001,48.56c26.54347,0 48.06001,-21.74039 48.06001,-48.56c0,-26.81961 -21.51654,-48.56 -48.06001,-48.56zm15.94701,70.02039c-0.75578,0.75973 -1.54838,1.55666 -2.19177,2.2087c-0.57943,0.58742 -0.98833,1.3119 -1.19569,2.09709c-0.29262,1.10826 -0.52905,2.22828 -0.92438,3.30325l-3.37001,9.17353c-2.66656,0.58742 -5.42613,0.91833 -8.26516,0.91833l0,-5.36118c0.32751,-2.47108 -1.48056,-7.09994 -4.38548,-10.03508c-1.16274,-1.17484 -1.81582,-2.7687 -1.81582,-4.4311l0,-6.26776c0,-2.27919 -1.21507,-4.37432 -3.18979,-5.47671c-2.78477,-1.55666 -6.74584,-3.73207 -9.45891,-5.11251c-2.22471,-1.13176 -4.28277,-2.5729 -6.13346,-4.25879l-0.15503,-0.14098c-1.32339,-1.20715 -2.49854,-2.57055 -3.49985,-4.06103c-1.81775,-2.69625 -4.77887,-7.13127 -6.70321,-10.01354c3.96689,-8.90919 11.11582,-16.06396 19.99917,-19.95072l4.65291,2.35164c2.06193,1.04169 4.48818,-0.47189 4.48818,-2.80199l0,-2.21261c1.54838,-0.25259 3.1239,-0.41315 4.72655,-0.47385l5.48427,5.54132c1.21119,1.22379 1.21119,3.20731 0,4.4311l-0.90888,0.91637l-2.00379,2.02464c-0.60463,0.61092 -0.60463,1.60365 0,2.21457l0.90888,0.91833c0.60463,0.61092 0.60463,1.60365 0,2.21457l-1.55032,1.56645c-0.29107,0.29351 -0.68563,0.45838 -1.09685,0.45819l-1.74218,0c-0.40308,0 -0.79066,0.1586 -1.08135,0.44448l-1.9224,1.88953c-0.48351,0.47581 -0.60734,1.21263 -0.30619,1.82296l3.02119,6.1072c0.51548,1.04169 -0.23449,2.26744 -1.3856,2.26744l-1.09298,0c-0.37402,0 -0.73447,-0.13706 -1.01546,-0.38378l-1.79837,-1.5782c-0.82787,-0.72566 -1.97337,-0.95651 -3.01344,-0.607l-6.04045,2.03443c-0.9457,0.31858 -1.58365,1.21302 -1.58327,2.22045c0,0.887 0.4961,1.69568 1.28095,2.09317l2.1472,1.08477c1.82357,0.92225 3.83511,1.40197 5.87379,1.40197c2.03867,0 4.37772,5.34356 6.20129,6.26581l12.93551,0c1.64528,0 3.2208,0.65987 4.38548,1.83471l2.65299,2.68059c1.10829,1.12021 1.73074,2.63947 1.73055,4.22355c-0.00078,2.42428 -0.95771,4.74811 -2.6588,6.4577zm16.80356,-17.88692c-1.12205,-0.28392 -2.10069,-0.97903 -2.74213,-1.95219l-3.48435,-5.2809c-1.04259,-1.57781 -1.04259,-3.63456 0,-5.21237l3.79635,-5.75279c0.44959,-0.67945 1.06585,-1.23162 1.79062,-1.59582l2.5154,-1.27078c2.62005,5.27111 4.13161,11.20013 4.13161,17.49139c0,1.69764 -0.1434,3.36004 -0.3527,5.0009l-5.6548,-1.42743z" fill="#000000" id="shape0" stroke="#000000" stroke-linecap="square" stroke-linejoin="bevel" stroke-opacity="0" stroke-width="0"/>');
		this.plugin.addRibbonIcon('globe', 'Open Map View', async () => {
			await this.plugin.app.workspace.getLeaf().setViewState({ type: ViewName });
		});
	}

	getView(leaf: WorkspaceLeaf): View {
		let map = new MapView(this.plugin, leaf, this.database);
		this.maps.add(map);
		return map;
	}

	async #fileCreated(file: File){
		this.maps.forEach((map) => {
			map.addFile(file);
		})
		// for (var it = this.maps.values(), val= null; val=it.next().value; ) {
		// 	console.log(val);
		// }
		// this.maps.values
		// console.log("create");
	}
	async #fileModified(file: File){
		console.log("modify");
	}
	#fileDeleted(tfile: TFile){
		console.log("delete");
	}
	async #fileRenamed(args: {file: File, oldPath: string}){
		console.log("rename");
	}
}
