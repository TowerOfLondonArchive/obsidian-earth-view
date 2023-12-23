import EarthPlugin from "./main";
import {TFile, Notice, TAbstractFile} from "obsidian";
import {FeatureCollection} from "geojson";
import {EventManager} from "./event";


const geojsonCodeBlock = /^```geojson\s*$\r?\n(?<contents>.*?)^```/gsm;
const JPGUrlPattern = /!\[\[(?<path>.*?\.jpg)]]/


export class File {
	tfile: TFile
	geojson: FeatureCollection[]
	thumbnail_path: string | null

	constructor(tfile: TFile, geojson: FeatureCollection[], thumbnail_path: string | null) {
		this.tfile = tfile;
		this.geojson = geojson;
		this.thumbnail_path = thumbnail_path;
	}
}


export class Database extends EventManager {
	plugin: EarthPlugin
	files: Map<string, File>

	constructor(plugin: EarthPlugin){
		super();
		this.plugin = plugin;
		this.files = new Map();
		this.plugin.app.workspace.onLayoutReady(this.#init.bind(this));
	}

	async #init(){
		await Promise.all(this.plugin.app.vault.getMarkdownFiles().map(f => this.#fileCreated(f)));
		console.log("finished scanning files.");
		this.plugin.app.vault.on("create", this.#fileCreated.bind(this));
		this.plugin.app.vault.on("modify", this.#fileModified.bind(this));
		this.plugin.app.vault.on("delete", this.#fileDeleted.bind(this));
		this.plugin.app.vault.on("rename", this.#fileRenamed.bind(this));
	}

	async #fileCreated(tfile: TAbstractFile){
		if (tfile instanceof TFile) {
			let file = await this.#parseFile(tfile);
			this.files.set(file.tfile.path, file);
			this.dispatchEvent("create", file);
		}
	}

	async #fileModified(tfile: TAbstractFile){
		if (tfile instanceof TFile){
			let file = await this.#parseFile(tfile);
			this.files.set(file.tfile.path, file);
			this.dispatchEvent("modify", file);
		}
	}

	#fileDeleted(tfile: TAbstractFile){
		if (tfile instanceof TFile){
			this.files.delete(tfile.path);
			this.dispatchEvent("delete", tfile);
		}
	}

	async #fileRenamed(tfile: TAbstractFile, oldPath: string){
		if (tfile instanceof TFile){
			this.files.delete(oldPath);
			let file = await this.#parseFile(tfile);
			this.files.set(file.tfile.path, file);
			this.dispatchEvent("rename", {file: file, oldPath: oldPath});
		}
	}

	async #parseFile(tfile: TFile): Promise<File> {
		// let text = await this.plugin.app.vault.cachedRead(tfile);
		let file_src = await this.plugin.app.vault.adapter.read(tfile.path);
		let file = new File(tfile, [], null);
		for (let match of file_src.matchAll(geojsonCodeBlock)) {
			try {
				let contents = match.groups?.contents;
				if (!contents) {
					continue
				}
				let geojson = JSON.parse(contents);
				file.geojson.push(geojson);
			} catch (e) {
				console.log("Invalid geojson in file" + tfile.path);
				new Notice("Invalid geojson in file" + tfile.path);
			}
		}
		file.thumbnail_path = JPGUrlPattern.exec(file_src)?.groups?.path || null;
		return file;
	}
}
