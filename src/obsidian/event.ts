export class EventManager{
	private events: Map<string, ((arg: any) => null)[]>;

	constructor() {
		this.events = new Map();
	}

	#getEvent(eventName: string): ((arg: any) => null)[] {
		let event = this.events.get(eventName);
		if (!event){
			event = [];
			this.events.set(eventName, event);
		}
		return event;
	};

	dispatchEvent(eventName: string, eventArgs: any){
		this.#getEvent(eventName).forEach(function(callback){
			callback(eventArgs);
		});
	};

	addEventListener(eventName: string, callback: ((arg: any) => null)){
		this.#getEvent(eventName).push(callback);
	};
}
